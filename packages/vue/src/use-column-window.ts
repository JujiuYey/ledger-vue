import type { RowData } from "@tanstack/vue-table";
import type { ComputedRef } from "vue";
import type { Header, ReactiveInput } from "./types";

/**
 * Column virtualization (docs/virtualization.md#column-virtualization). Only the center zone
 * windows — pinned columns are sticky and always mounted — and the window is the width
 * engine's own numbers, not a second virtualizer: every column width is already an exact
 * integer pixel (use-column-widths.ts), so the rendered range is a binary search over their
 * prefix sums, derived in the same render pass that draws the colgroup. A measuring
 * virtualizer would hold a parallel copy of the horizontal geometry that resize, responsive
 * breakpoints, and grow redistribution would each have to invalidate by hand.
 *
 * Vue edition: the inputs are reactive (`ReactiveInput`), read through `toValue` where the
 * window is measured, and the window itself is a computed — consumers recompute when it
 * moves. React's `startTransition` chase has no Vue counterpart and needs none: Vue's
 * scheduler coalesces the scroll-driven writes into one render of the newest window (there
 * are no abandoned renders to starve), and the commit-step re-measure below keeps a smooth
 * scroll chasing the live position.
 */
import { computed, ref, toValue, watch } from "vue";

const DEFAULT_COLUMN_OVERSCAN = 4;

export { DEFAULT_COLUMN_OVERSCAN };

export interface ColumnWindowInput {
  enabled: ReactiveInput<boolean>;
  /**
   * Extra columns rendered beyond the visible range on each side.
   */
  overscan: ReactiveInput<number>;
  viewport: ReactiveInput<HTMLDivElement | null>;
  /**
   * Visible center leaf column ids in display order — the zone that windows.
   */
  centerColumnIds: ReactiveInput<readonly string[]>;
  /**
   * The width engine's resolved integer pixels per visible leaf column id.
   */
  widths: ReactiveInput<Record<string, number>>;
  /**
   * The sticky pinned overlays narrow the visible center strip by their summed widths.
   */
  pinnedStartWidth: ReactiveInput<number>;
  pinnedEndWidth: ReactiveInput<number>;
}

export interface ColumnWindow {
  /**
   * The rendered center slice, `[start, end)` over the center zone.
   */
  start: number;
  end: number;
  /**
   * Widths of the not-rendered runs — the two spacer `<col>`s.
   */
  leadingSpace: number;
  trailingSpace: number;
}

/**
 * The render-facing descriptor: the window plus the display geometry every renderer tiles by.
 */
export interface ColumnWindowView extends ColumnWindow {
  pinnedStartCount: number;
  pinnedEndCount: number;
  centerCount: number;
  /**
   * Total visible leaf columns — `aria-colcount`.
   */
  totalLeafCount: number;
  /**
   * Display index (pinned-aware) per visible leaf column id; `aria-colindex` is this + 1.
   */
  displayIndexById: ReadonlyMap<string, number>;
}

/**
 * First index whose value is greater than `target` (`values` ascending).
 */
function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = (low + high) >> 1;

    if (values[mid]! <= target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * First index whose value is at least `target` (`values` ascending).
 */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;

  while (low < high) {
    const mid = (low + high) >> 1;

    if (values[mid]! < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

/**
 * The measured window over `[0, centerCount)` given a scroll position: the columns whose spans
 * intersect the visible center strip, extended by `overscan` on each side. Pure — the hook's
 * unit-testable core.
 */
export function measureColumnWindow(input: {
  offsets: readonly number[];
  scrollLeft: number;
  clientWidth: number;
  pinnedStartWidth: number;
  pinnedEndWidth: number;
  overscan: number;
}): { start: number; end: number } {
  const count = input.offsets.length - 1;
  // RTL viewports report a negative scrollLeft; the window only needs the distance scrolled.
  const from = Math.abs(input.scrollLeft);
  const to = from + Math.max(0, input.clientWidth - input.pinnedStartWidth - input.pinnedEndWidth);
  const first = Math.max(0, upperBound(input.offsets, from) - 1);
  const last = Math.max(first + 1, lowerBound(input.offsets, to));

  return {
    start: Math.max(0, first - input.overscan),
    end: Math.min(count, last + input.overscan)
  };
}

export function useColumnWindow({
  enabled,
  overscan,
  viewport,
  centerColumnIds,
  widths,
  pinnedStartWidth,
  pinnedEndWidth
}: ColumnWindowInput): ComputedRef<ColumnWindow | null> {
  // Prefix sums over the center zone: offsets[i] is where column i starts, offsets at the end
  // is the zone's total width.
  const offsets = computed(
    () => {
      const out: number[] = [0];
      let sum = 0;

      for (const id of toValue(centerColumnIds)) {
        sum += toValue(widths)[id] ?? 0;
        out.push(sum);
      }

      return out;
    }
  );

  const range = ref({ end: 0, start: 0 });

  let lastScrollLeft = 0;

  // Stable closures — Vue has no render-phase identity churn to absorb, so the scroll
  // listener, the observer and the watchers below share one `measure` for the composable's
  // life. It reads its inputs untracked: only the window computed below is a reactive read.
  const measure = (defer: boolean) => {
    const enabledNow = toValue(enabled);
    const viewportElement = toValue(viewport);
    const currentOffsets = offsets.value;

    if (!enabledNow || !viewportElement || currentOffsets.length <= 1) {
      return;
    }

    const pinnedStart = toValue(pinnedStartWidth);
    const pinnedEnd = toValue(pinnedEndWidth);
    const scrollLeft = Math.abs(viewportElement.scrollLeft);
    const strip = Math.max(0, viewportElement.clientWidth - pinnedStart - pinnedEnd);
    // A discrete leap (scrollToColumn, a scrollbar jump) has no continuation to starve and no
    // shear to fear — one event, and the mirror already ran ahead of this listener — while a
    // transition would leave the landing blank for a render. It applies synchronously.
    const jumped = Math.abs(scrollLeft - lastScrollLeft) > strip;
    lastScrollLeft = scrollLeft;

    const next = measureColumnWindow({
      clientWidth: viewportElement.clientWidth,
      offsets: currentOffsets,
      overscan: toValue(overscan),
      pinnedEndWidth: pinnedEnd,
      pinnedStartWidth: pinnedStart,
      scrollLeft: viewportElement.scrollLeft
    });

    // The committed window shares nothing with where the viewport now is — the visible strip
    // is already fully blank, so there is nothing left to keep responsive; and a scroll-driven
    // shift writes the newest window outright — Vue's scheduler coalesces same-tick writes
    // into one render, which is the time-sliced behavior the React chase had to build by
    // hand. The commit-step re-measure below keeps a smooth scroll chasing the live position.
    const blank = next.start >= range.value.end || next.end <= range.value.start;

    if (!defer || jumped || blank) {
      if (range.value.start !== next.start || range.value.end !== next.end) {
        range.value = next;
      }

      return;
    }

    if (next.start === range.value.start && next.end === range.value.end) {
      return;
    }

    range.value = next;
  };

  // The chase step: a committed window re-measures from the live scroll position — a smooth
  // scroll has moved on while the window rendered, and the next hop starts from here.
  // Terminates because `measure` no-ops once the window matches the scroll.
  watch(range, () => {
    measure(true);
  }, { flush: "post" });

  // Post-flush subscriptions so the first real window replaces the minimal initial render
  // before paint. Only [enabled, viewport] re-arms them — re-measuring on geometry changes is
  // the next watcher's job, so a width change never churns the listener and the observer (a
  // resize drag reshapes `offsets` on every pointer move).
  watch(() => [toValue(enabled), toValue(viewport)] as const, ([enabledNow, viewportElement], _previous, onCleanup) => {
    if (!enabledNow || !viewportElement) {
      return;
    }

    measure(false);
    const onScroll = () => measure(true);
    viewportElement.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(viewportElement);

    onCleanup(() => {
      viewportElement.removeEventListener("scroll", onScroll);
      observer.disconnect();
    });
  }, { immediate: true, flush: "post" });

  // A width or pinned-boundary change re-derives the range from the same scroll position in
  // the same commit that moved the columns; `measure` itself guards the disabled states.
  watch([offsets, () => toValue(pinnedStartWidth), () => toValue(pinnedEndWidth)], () => {
    measure(false);
  }, { immediate: true, flush: "post" });

  return computed(
    () => {
      const enabledNow = toValue(enabled);
      const count = toValue(centerColumnIds).length;

      if (!enabledNow || count === 0) {
        return null;
      }

      // Clamped against the CURRENT columns: the measured range may predate a width or
      // composition change by one commit, and the spaces must always sum with the rendered
      // columns to the exact zone total.
      const start = Math.min(range.value.start, count - 1);
      const end = Math.max(start + 1, Math.min(range.value.end, count));

      return {
        end,
        leadingSpace: offsets.value[start] ?? 0,
        start,
        trailingSpace: (offsets.value[count] ?? 0) - (offsets.value[end] ?? 0)
      };
    }
  );
}

// ------------------------------------------------------------------------------------------------
// Tiling helpers — how the three synced tables render against a window
// ------------------------------------------------------------------------------------------------

/**
 * Rendered column count including the spacer cols — what a full-width cell (detail panel,
 * loader row) spans.
 */
export function renderedColCount(view: ColumnWindowView | null, leafColumnCount: number): number {
  if (view === null) {
    return leafColumnCount;
  }

  return view.pinnedStartCount
    + (view.end - view.start)
    + view.pinnedEndCount
    + (view.start > 0 ? 1 : 0)
    + (view.end < view.centerCount ? 1 : 0);
}

export interface WindowedRowCells<T> {
  leading: T[];
  windowed: T[];
  trailing: T[];
}

/**
 * A leaf-level row's cells against the window. `cells` is the full display-ordered list, so a
 * segment cell's display index is its segment offset plus the segment's start.
 */
export function windowRowCells<T>(cells: readonly T[], view: ColumnWindowView): WindowedRowCells<T> {
  return {
    leading: cells.slice(0, view.pinnedStartCount),
    trailing: view.pinnedEndCount === 0 ? [] : cells.slice(cells.length - view.pinnedEndCount),
    windowed: cells.slice(view.pinnedStartCount + view.start, view.pinnedStartCount + view.end)
  };
}

export type WindowedHeaderCell<TData extends RowData>
  = | { kind: "header"; header: Header<TData, unknown>; colSpan: number; ariaColIndex: number }
    | { kind: "spacer"; edge: "leading" | "trailing" };

/**
 * One clamp rule for every header and footer row (docs/virtualization.md#column-virtualization):
 * a header's colSpan is the number of its leaf columns actually rendered, plus a spacer col its
 * span fully contains (a header whose rendered leaves sit on both sides of a hidden run is one
 * rectangle and must absorb it); headers with nothing rendered vanish, and a spacer col nobody
 * absorbed stands alone. Well-defined because v9 builds header groups over the display-ordered
 * leaves — every header instance covers a contiguous run, pinning splits included.
 */
export function windowHeaderCells<TData extends RowData>(
  headers: Array<Header<TData, unknown>>,
  view: ColumnWindowView
): Array<WindowedHeaderCell<TData>> {
  const windowStart = view.pinnedStartCount + view.start;
  const windowEnd = view.pinnedStartCount + view.end;
  const centerEnd = view.pinnedStartCount + view.centerCount;

  const isRendered = (index: number) => index < view.pinnedStartCount || index >= centerEnd || (index >= windowStart && index < windowEnd);

  const out: Array<WindowedHeaderCell<TData>> = [];
  let leadingPending = view.start > 0;
  let trailingPending = view.end < view.centerCount;

  for (const header of headers) {
    let low = Infinity;
    let high = -Infinity;
    let renderedCount = 0;
    let firstRendered = Infinity;
    // Unique indexes: for a placeholder chain (an ungrouped column passing through a group
    // row) v9's getLeafHeaders yields the same leaf column more than once.
    const seen = new Set<number>();

    for (const leaf of header.getLeafHeaders()) {
      const index = view.displayIndexById.get(leaf.column.id);

      if (index !== undefined && !seen.has(index)) {
        seen.add(index);
        low = Math.min(low, index);
        high = Math.max(high, index);

        if (isRendered(index)) {
          renderedCount += 1;
          firstRendered = Math.min(firstRendered, index);
        }
      }
    }

    if (renderedCount === 0) {
      continue;
    }

    // A rendered leaf in the pinned-start zone AND one at or past the window start puts the
    // leading hidden run inside this header's rectangle; same shape on the trailing side.
    const absorbLeading = leadingPending && low < view.pinnedStartCount && high >= windowStart;
    const absorbTrailing = trailingPending && low < windowEnd && high >= centerEnd;

    if (leadingPending && !absorbLeading && high >= windowStart) {
      out.push({ edge: "leading", kind: "spacer" });
      leadingPending = false;
    }

    if (trailingPending && !absorbTrailing && low >= windowEnd) {
      out.push({ edge: "trailing", kind: "spacer" });
      trailingPending = false;
    }

    if (absorbLeading) {
      leadingPending = false;
    }

    if (absorbTrailing) {
      trailingPending = false;
    }

    out.push({
      ariaColIndex: firstRendered + 1,
      colSpan: renderedCount + (absorbLeading ? 1 : 0) + (absorbTrailing ? 1 : 0),
      header,
      kind: "header"
    });
  }

  if (trailingPending) {
    out.push({ edge: "trailing", kind: "spacer" });
  }

  return out;
}
