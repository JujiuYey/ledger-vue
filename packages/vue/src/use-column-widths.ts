import type { RowData } from "@tanstack/vue-table";
import type { ReactiveInput, Column, TableInstance } from "./types";

/**
 * The width engine (docs/sizing.md): every visible leaf column resolves to an exact integer
 * pixel width, so the rendered width, the specified width, and the pinned-offset basis are one
 * number system — the browser never redistributes anything.
 *
 * Rules, in order:
 * - a column with an explicit width (user-resized `columnSizing` entry, else the author's
 * `size`, else `defaultColumn.size`) is fixed at that width, clamped to its declared min/max;
 * - a column without one is a grow column with basis `minSize ?? 80`; container surplus is
 * distributed proportionally to the bases (integer floor, remainder in display order), capped
 * by maxSize; when the container is too small every grow column falls back to its basis and the
 * table overflows into horizontal scroll;
 * - with no grow columns at all, surplus distributes proportionally over every column up to each
 * maxSize. Hard maximums win over filling the viewport.
 *
 * Author sizing comes from the raw-definition registry (`rawColumnSizing`), never from
 * `column.columnDef` — TanStack merges `size: 150, minSize: 20` defaults into every resolved
 * definition, which would make "unsized" unrepresentable.
 *
 * Vue edition: the reactive inputs (`columns`, `viewport`, `tableMinWidth`, `injectedWidth`)
 * are read through `toValue` inside computeds and effects, and the state reads go through the
 * table's atoms — `table.state` is not tracked. The return keeps the React shape verbatim: a
 * plain `ColumnWidths` object whose `byId`/`total` consumers read directly, reactive under the
 * hood so computeds reading it recompute when the numbers move.
 */
import { computed, reactive, ref, toValue, watch } from "vue";

import { isInternalColumn, rawColumnSizing } from "./build-columns";

/**
 * Grow basis for columns that declare neither `size` nor `minSize`.
 */
const DEFAULT_FLEX_BASIS = 80;

export interface ColumnWidthSpec {
  id: string;
  size: number | undefined;
  minSize: number | undefined;
  maxSize: number | undefined;
}

export interface ColumnWidths {
  /**
   * Resolved width per visible leaf column id, integer pixels.
   */
  byId: Record<string, number>;
  /**
   * Sum of all resolved widths — the exact table width.
   */
  total: number;
}

function finiteNumber(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function normalizedBound(value: number | undefined): number | undefined {
  const finite = finiteNumber(value);

  return finite === undefined ? undefined : Math.max(0, Math.round(finite));
}

function clampWidth(value: number, min: number | undefined, max: number | undefined): number {
  const rounded = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  return Math.min(
    Math.max(rounded, normalizedBound(min) ?? 0),
    normalizedBound(max) ?? Number.MAX_SAFE_INTEGER
  );
}

interface SurplusRecipient {
  id: string;
  weight: number;
  max: number | undefined;
}

/**
 * Weighted water-filling over integer pixels. Columns that hit maxSize leave the active set and
 * the remaining space is redistributed over columns that can still grow. If every column reaches
 * its cap, maxSize wins and the table intentionally stops short of the viewport.
 */
function distributeSurplus(
  byId: Record<string, number>,
  recipients: SurplusRecipient[],
  surplus: number
): void {
  let remaining = surplus;

  while (remaining > 0) {
    const active = recipients.filter(
      recipient => recipient.max === undefined || byId[recipient.id]! < recipient.max
    );

    if (active.length === 0) {
      return;
    }

    const positiveWeightTotal = active.reduce(
      (total, recipient) => total + Math.max(0, recipient.weight),
      0
    );
    const equalWeight = positiveWeightTotal === 0;
    const weightTotal = equalWeight ? active.length : positiveWeightTotal;
    let distributed = 0;

    for (const recipient of active) {
      const current = byId[recipient.id]!;
      const capacity = recipient.max === undefined
        ? Infinity
        : recipient.max - current;
      const weight = equalWeight ? 1 : Math.max(0, recipient.weight);
      const share = Math.min(capacity, Math.floor((remaining * weight) / weightTotal));

      if (share > 0) {
        byId[recipient.id] = current + share;
        distributed += share;
      }
    }

    remaining -= distributed;

    if (remaining === 0) {
      return;
    }

    // Every proportional share rounded to zero. Hand the integer remainder out in display order;
    // this preserves the engine's established "remainder to the first columns" determinism.
    if (distributed === 0) {
      for (const recipient of active) {
        const current = byId[recipient.id]!;
        const capacity = recipient.max === undefined
          ? Infinity
          : recipient.max - current;

        if (capacity > 0) {
          byId[recipient.id] = current + 1;
          remaining -= 1;
        }

        if (remaining === 0) {
          return;
        }
      }
    }
  }
}

export function resolveColumnWidths(
  columns: ColumnWidthSpec[],
  columnSizing: Record<string, number>,
  availableWidth: number
): ColumnWidths {
  const byId: Record<string, number> = {};
  const growColumns: SurplusRecipient[] = [];

  for (const column of columns) {
    const sized = finiteNumber(columnSizing[column.id]) ?? finiteNumber(column.size);

    if (sized === undefined) {
      const basis = clampWidth(column.minSize ?? DEFAULT_FLEX_BASIS, column.minSize, column.maxSize);
      byId[column.id] = basis;
      growColumns.push({
        id: column.id,
        weight: basis,
        max: normalizedBound(column.maxSize)
      });
    } else {
      byId[column.id] = clampWidth(sized, column.minSize, column.maxSize);
    }
  }

  const baseTotal = columns.reduce((total, column) => total + (byId[column.id] ?? 0), 0);
  const targetWidth = Number.isFinite(availableWidth) ? Math.max(0, Math.round(availableWidth)) : 0;
  const surplus = targetWidth - baseTotal;

  if (surplus > 0) {
    const recipients = growColumns.length > 0
      ? growColumns
      : columns.map(column => {
          return {
            id: column.id,
            weight: byId[column.id] ?? 0,
            max: normalizedBound(column.maxSize)
          };
        });

    distributeSurplus(byId, recipients, surplus);
  }

  const total = columns.reduce((sum, column) => sum + (byId[column.id] ?? 0), 0);

  return { byId, total };
}

/**
 * Resolve `tableMinWidth` to pixels. Numbers are pixels; strings are resolved through the
 * body table's computed style (the browser turns rem/em into px there).
 */
function minWidthPx(tableMinWidth: number | string | undefined, viewport: HTMLElement | null): number {
  if (tableMinWidth === undefined) {
    return 0;
  }

  if (typeof tableMinWidth === "number") {
    return tableMinWidth;
  }

  const tableElement = viewport?.querySelector("table");

  if (!tableElement) {
    // eslint-disable-next-line unicorn/prefer-number-coercion -- parses CSS lengths ("60rem"); Number() would yield NaN
    return Number.parseFloat(tableMinWidth) || 0;
  }

  // eslint-disable-next-line unicorn/prefer-number-coercion -- parses the computed "123px" string; Number() would yield NaN
  return Number.parseFloat(getComputedStyle(tableElement).minWidth) || 0;
}

export function useColumnWidths<TData extends RowData>(
  table: TableInstance<TData>,
  /**
   * Visible leaf columns in DISPLAY order (pinned-aware) — the same order the colgroup renders.
   */
  columns: ReactiveInput<Array<Column<TData, unknown>>>,
  viewport: ReactiveInput<HTMLDivElement | null>,
  tableMinWidth: ReactiveInput<number | string | undefined>,
  /**
   * The injected columns' width — the table's `size` decides it (`size.ts`) — for every
   * bound an override left unsaid.
   */
  injectedWidth: ReactiveInput<number>
): ColumnWidths {
  const availableWidth = ref(0);

  const measure = () => {
    const viewportElement = toValue(viewport);

    if (!viewportElement) {
      return;
    }

    const next = Math.max(viewportElement.clientWidth, minWidthPx(toValue(tableMinWidth), viewportElement));

    if (availableWidth.value !== next) {
      availableWidth.value = next;
    }
  };

  /* Pre-paint measurement: the corrected widths land before the first frame is shown. */
  watch([() => toValue(viewport), () => toValue(tableMinWidth)], () => {
    measure();
  }, { immediate: true, flush: "post" });

  watch(() => toValue(viewport), (viewportElement, _previous, onCleanup) => {
    if (!viewportElement) {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);

    onCleanup(() => observer.disconnect());
  }, { immediate: true, flush: "post" });

  const resolved = computed(
    () => {
      // The atoms are the tracked read; `table.state` is not reactive.
      const columnSizing = table.atoms.columnSizing.get();
      const defaultColumn = table.options.defaultColumn;
      const injected = toValue(injectedWidth);
      const specs = toValue(columns).map<ColumnWidthSpec>(column => {
        const raw = rawColumnSizing(column.columnDef);

        if (isInternalColumn(column.id)) {
          return {
            id: column.id,
            size: raw?.size ?? injected,
            minSize: raw?.minSize ?? injected,
            maxSize: raw?.maxSize ?? injected
          };
        }

        return {
          id: column.id,
          size: raw ? raw.size ?? defaultColumn?.size : column.columnDef.size,
          minSize: raw ? raw.minSize ?? defaultColumn?.minSize : column.columnDef.minSize,
          maxSize: raw ? raw.maxSize ?? defaultColumn?.maxSize : column.columnDef.maxSize
        };
      });

      return resolveColumnWidths(specs, columnSizing, availableWidth.value);
    }
  );

  // Stable identity while the numbers are unchanged — downstream computeds depend on it. The
  // byId a consumer reads is always a fresh object when the widths actually moved.
  const widths = reactive<ColumnWidths>({ byId: {}, total: 0 });
  let signature = "";

  watch(resolved, next => {
    const nextSignature = JSON.stringify([next.total, Object.entries(next.byId)]);

    if (nextSignature === signature) {
      return;
    }

    signature = nextSignature;
    widths.byId = next.byId;
    widths.total = next.total;
  }, { immediate: true });

  return widths;
}
