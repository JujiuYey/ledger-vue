/**
 * Sticky offsets for pinned display items: each top item sticks at the body edge plus the measured
 * heights above it (bottom items mirror upward). One shared `top` value would stack every pinned
 * row/detail item onto the same edge. Heights are measured, not assumed — they follow content and
 * spacing.
 */
import type { Ref } from "vue";
import { onScopeDispose, ref, toValue, watch } from "vue";

import type { ReactiveInput } from "./types";

interface PinnedRowOffsets {
  top: number[];
  bottom: number[];
}

const NONE: PinnedRowOffsets = { top: [], bottom: [] };

export interface PinnedRowMeasurer {
  /**
   * Vue edition: the offsets are a ref, so the render layer reads `offsets.value.top[displayIndex]`
   * / `offsets.value.bottom[displayIndex]` where it draws and stays reactive to re-measures.
   */
  offsets: Ref<PinnedRowOffsets>;
  registerTopRow: (index: number) => (element: Element | null) => void;
  registerBottomRow: (index: number) => (element: Element | null) => void;
}

export function usePinnedRowOffsets(topCount: ReactiveInput<number>, bottomCount: ReactiveInput<number>): PinnedRowMeasurer {
  const offsets = ref<PinnedRowOffsets>(NONE);
  // Vue edition: the composable runs once per component, so the mutable mirrors the React edition
  // kept in refs are plain closure state — stable for the life of the instance.
  const topRows: Array<Element | null> = [];
  const bottomRows: Array<Element | null> = [];
  const topCallbacks: Array<(element: Element | null) => void> = [];
  const bottomCallbacks: Array<(element: Element | null) => void> = [];

  /**
   * How many items of each end actually reached the screen. Mirrored in a post-flush watch — the
   * commit phase — never read from the live arguments while measuring: the measurement works from
   * what has committed, and moving the counts here is what trims the elements whose rows left
   * before everything still on screen is measured again.
   */
  let committed = { bottom: toValue(bottomCount), top: toValue(topCount) };

  const measure = () => {
    const cumulative = (elements: Array<Element | null>, count: number) => {
      const result: number[] = [];
      let sum = 0;

      for (let index = 0; index < count; index += 1) {
        result.push(sum);
        sum += elements[index]?.getBoundingClientRect().height ?? 0;
      }

      return result;
    };

    // Only what is on screen is measured, and all of it: an element registered for a row that has
    // not committed yet is not part of the layout, and a row that has is, whether or not anything
    // has re-attached its element since.
    const counts = committed;

    // Bottom rows stack upward: the LAST bottom-pinned row sits at 0, the ones above it offset
    // by the heights below them.
    const bottom: number[] = [];
    let below = 0;

    for (let index = counts.bottom - 1; index >= 0; index -= 1) {
      bottom[index] = below;
      below += bottomRows[index]?.getBoundingClientRect().height ?? 0;
    }

    const next = { top: cumulative(topRows, counts.top), bottom };
    const previous = offsets.value;

    if (previous.top.join(",") === next.top.join(",") && previous.bottom.join(",") === next.bottom.join(",")) {
      return;
    }

    offsets.value = next;
  };

  const observer = new ResizeObserver(measure);

  onScopeDispose(() => {
    observer.disconnect();
  });

  watch(
    () => [toValue(topCount), toValue(bottomCount)] as const,
    ([nextTop, nextBottom]) => {
      const counts = committed;

      if (counts.top === nextTop && counts.bottom === nextBottom) {
        return;
      }

      committed = { bottom: nextBottom, top: nextTop };
      topRows.length = nextTop;
      bottomRows.length = nextBottom;
      measure();
    },
    { flush: "post" }
  );

  const register = (
    elements: Array<Element | null>,
    callbacks: Array<(element: Element | null) => void>,
    index: number
  ) => {
    const existing = callbacks[index];

    if (existing) {
      return existing;
    }

    let currentElement: Element | null = null;

    const callback = (element: Element | null) => {
      if (element === currentElement) {
        return;
      }

      if (currentElement) {
        observer.unobserve(currentElement);
      }

      currentElement = element;
      // Written whatever the array's length is: a row growing the list attaches its element
      // during the same commit that carries the new count, and the watch above has not run
      // yet. The watch is what trims anything the screen no longer holds.
      elements[index] = element;

      if (element) {
        observer.observe(element);
      }

      measure();
    };

    callbacks[index] = callback;

    return callback;
  };

  const registerTopRow = (index: number) => register(topRows, topCallbacks, index);

  const registerBottomRow = (index: number) => register(bottomRows, bottomCallbacks, index);

  return {
    offsets,
    registerTopRow,
    registerBottomRow
  };
}
