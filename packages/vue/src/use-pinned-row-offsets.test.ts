import type { PinnedRowMeasurer } from "./use-pinned-row-offsets";

import { computed, defineComponent, h, nextTick, ref } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { usePinnedRowOffsets } from "./use-pinned-row-offsets";

enableAutoUnmount(afterEach);

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope (effect-scope disposal included). Rerender becomes a ref write plus
 * `await nextTick()` — the composable's post-flush count watch is the commit phase, so a change
 * only "commits" once the scheduler has flushed it.
 */
function useInSetup<T>(composable: () => T): T {
  let result!: T;

  const Host = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    }
  });

  mount(Host);

  return result;
}

function rowWithHeight(height: number): Element {
  return {
    getBoundingClientRect: () => { return { height }; }
  } as unknown as Element;
}

/**
 * The two ends of the body are the same mechanism read in opposite directions: top items stack
 * downward from the first, bottom items upward from the last. Every rule below holds for both.
 */
const ENDS = [
  {
    name: "top",
    counts: (count: number) => [count, 0] as const,
    register: (measurer: PinnedRowMeasurer) => measurer.registerTopRow,
    read: (measurer: PinnedRowMeasurer) => measurer.offsets.value.top,
    // Heights 20 then 40, with the first replaced by 30: each item clears the ones above it.
    settled: [0, 30]
  },
  {
    name: "bottom",
    counts: (count: number) => [0, count] as const,
    register: (measurer: PinnedRowMeasurer) => measurer.registerBottomRow,
    read: (measurer: PinnedRowMeasurer) => measurer.offsets.value.bottom,
    // The last item sits on the edge; the one above it clears the 40 below.
    settled: [40, 0]
  }
];

describe("usePinnedRowOffsets", () => {
  it("remeasures same-count element replacements and row reorders", () => {
    const measurer = useInSetup(() => usePinnedRowOffsets(2, 0));

    measurer.registerTopRow(0)(rowWithHeight(20));
    measurer.registerTopRow(1)(rowWithHeight(40));
    expect(measurer.offsets.value.top).toEqual([0, 20]);

    measurer.registerTopRow(0)(rowWithHeight(40));
    measurer.registerTopRow(1)(rowWithHeight(20));
    expect(measurer.offsets.value.top).toEqual([0, 40]);
  });

  it.each(ENDS)("keeps measuring the $name rows on screen after a discarded update shrank the count", async end => {
    const count = ref(2);
    const counts = computed(() => end.counts(count.value));
    const measurer = useInSetup(() => usePinnedRowOffsets(() => counts.value[0], () => counts.value[1]));
    const register = end.register(measurer);

    register(0)(rowWithHeight(20));
    register(1)(rowWithHeight(40));
    expect(end.read(measurer)).toEqual(end.name === "top" ? [0, 20] : [40, 0]);

    // The Vue counterpart of the React edition's suspended transition (a render nobody ever
    // saw): the count shrinks and reverts inside one tick, so the post-flush count watch — the
    // commit phase — never observes the shrink. Two rows are still on screen, and nothing about
    // them changed.
    count.value = 1;
    count.value = 2;
    await nextTick();
    expect(end.read(measurer)).toEqual(end.name === "top" ? [0, 20] : [40, 0]);

    // Something the observer watches resizes. The measurement has to cover both rows that are
    // actually there — an update nobody saw may not have taken one of them out of it.
    register(0)(rowWithHeight(30));

    expect(end.read(measurer)).toEqual(end.settled);
  });

  it.each(ENDS)("remeasures the $name rows when a real change of count commits", async end => {
    const count = ref(1);
    const counts = computed(() => end.counts(count.value));
    const measurer = useInSetup(() => usePinnedRowOffsets(() => counts.value[0], () => counts.value[1]));
    const register = end.register(measurer);

    register(0)(rowWithHeight(20));
    expect(end.read(measurer)).toEqual([0]);

    // A second row arrives. Its element attaches during the patch that carries the new count,
    // before anything in the owner has seen that count — which is the only order Vue offers,
    // since template refs are written during the patch and the post-flush count watch runs
    // after it.
    register(1)(rowWithHeight(40));

    count.value = 2;
    await nextTick();
    expect(end.read(measurer)).toEqual(end.name === "top" ? [0, 20] : [40, 0]);

    // And it leaves again: the patch detaches its element, then the new count commits.
    register(1)(null);

    count.value = 1;
    await nextTick();
    expect(end.read(measurer)).toEqual([0]);

    // Nothing of the row that left may come back with the next measurement.
    register(0)(rowWithHeight(30));
    expect(end.read(measurer)).toEqual([0]);
  });
});
