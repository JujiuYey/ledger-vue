import type { Ref } from "vue";
import { nextTick, ref } from "vue";

import { describe, expect, it, vi } from "vitest";

import { useSlice } from "./use-slice";

/**
 * Port of the React `useSlice` contract tests. The React edition's concurrency-specific cases
 * (transitions, Suspense blockers, requested-value bookkeeping) exist to defeat React tearing
 * and have no Vue counterpart — Vue's reactivity has no discarded renders, and the slice reads
 * through one computed: the controlled prop while the owner holds the slice, the internal ref
 * the moment it does not (see use-slice.ts). The dropped scenarios are noted inline below.
 */
describe("useSlice", () => {
  it("runs uncontrolled from defaultValue and resolves functional updaters", () => {
    const onChange = vi.fn();
    const [current, set] = useSlice<number[]>({
      value: () => undefined,
      defaultValue: [1],
      onChange,
      fallback: []
    });

    expect(current.value).toEqual([1]);

    set(previous => [...previous, 2]);

    expect(current.value).toEqual([1, 2]);
    // The observer receives the resolved value, never the updater function.
    expect(onChange).toHaveBeenCalledWith([1, 2]);
  });

  it("falls back when neither value nor defaultValue is given", () => {
    const [current, set] = useSlice<string>({
      value: () => undefined,
      defaultValue: undefined,
      onChange: undefined,
      fallback: "fallback"
    });

    expect(current.value).toBe("fallback");

    // Keep the setter alive in the assertion surface: an unused binding would read as a hole.
    expect(typeof set).toBe("function");
  });

  it("follows the controlled value and still reports resolved values", async () => {
    const onChange = vi.fn();
    const ownerValue = ref<number>(5);
    const [current, set] = useSlice<number>({
      value: () => ownerValue.value,
      defaultValue: undefined,
      onChange,
      fallback: 0
    });

    expect(current.value).toBe(5);

    set(previous => previous + 1);

    expect(onChange).toHaveBeenCalledWith(6);
    // Controlled: the rendered value only moves when the prop moves (the React edition held the
    // same line — silence is a refusal, not an acceptance).
    expect(current.value).toBe(5);

    // The owner answers 6: the ref follows the prop.
    ownerValue.value = 6;
    await nextTick();

    expect(current.value).toBe(6);
  });

  it("resolves chained updaters within one event against fresh state", () => {
    const [current, set] = useSlice<number>({
      value: () => undefined,
      defaultValue: 0,
      onChange: undefined,
      fallback: 0
    });

    set(previous => previous + 1);
    set(previous => previous + 1);

    expect(current.value).toBe(2);
  });

  // N/A (React concurrency): "resolves an updater against the value on screen, not one a
  // discarded render named" — the discarded render, the Suspense throw and the transition are
  // React mechanisms; Vue has no render to discard, so the scenario does not arise.

  it("drops an optimistic value the controlled owner declined", async () => {
    const onChange = vi.fn();
    const ownerValue = ref<number>(5);
    const [current, set] = useSlice<number>({
      value: () => ownerValue.value,
      defaultValue: undefined,
      onChange,
      fallback: 0
    });

    set(previous => previous + 1);

    expect(onChange.mock.calls.map(call => call[0])).toEqual([6]);
    // `value` never moved, so the on-screen value stays at what the owner last said.
    expect(current.value).toBe(5);

    // A separate event, so any boundary between the two is crossed — exactly what a browser
    // does between two real clicks.
    await Promise.resolve();

    set(previous => previous + 1);

    // The second event departs from 5 as well. Asking for 7 would be building on a request the
    // owner turned down.
    expect(onChange.mock.calls.map(call => call[0])).toEqual([6, 6]);
    expect(current.value).toBe(5);

    // The prop moving is what re-claims the slice — the owner finally answers 4.
    ownerValue.value = 4;
    await nextTick();

    expect(current.value).toBe(4);
  });

  it("resolves against a controlled value the owner normalized, not the one it was asked for", async () => {
    const onChange = vi.fn();
    const ownerValue = ref<number>(5);
    const [current, set] = useSlice<number>({
      value: () => ownerValue.value,
      defaultValue: undefined,
      onChange: next => {
        onChange(next);
        // The owner is the authority on a controlled slice, and it does not have to agree: it
        // snaps what it was asked for to a value of its own, synchronously.
        ownerValue.value = 10;
      },
      fallback: 0
    });

    set(previous => previous + 1);

    // 5 + 1 asked for, 10 answered — and the second updater departs from the answer. Departing
    // from 6 would build on a number the owner has already overruled and nobody ever saw.
    // (The mirror watch applies the normalization on the flush; the React edition did it in the
    // same commit via a layout effect.)
    expect(onChange).toHaveBeenCalledWith(6);

    await nextTick();

    expect(current.value).toBe(10);

    set(previous => previous + 1);

    expect(onChange.mock.calls.map(call => call[0])).toEqual([6, 11]);
  });

  // N/A (React concurrency): "keeps an uncontrolled base alive across a transition that has not
  // committed" and "keeps an uncontrolled base alive across a commit that did not carry it" —
  // both pin the requested-value ledger that keeps a queued increment alive across a transition
  // that has not committed. Vue applies a set synchronously to the ref; there is no update queue
  // a commit could skip.

  it("drops a request the previous owner made when the slice changes hands", async () => {
    const onChange = vi.fn();
    const ownerValue = ref<number | undefined>(undefined);
    const [current, set] = useSlice<number>({
      value: () => ownerValue.value,
      defaultValue: 0,
      onChange,
      fallback: 0
    });

    // An uncontrolled increment applies at once (the React edition queued it behind a suspended
    // transition — N/A here).
    set(previous => previous + 1);

    expect(current.value).toBe(1);

    // The application then starts passing `value`, so the slice is controlled and 10 is what it
    // holds. Whatever the previous owner had asked for is not this owner's business.
    ownerValue.value = 10;
    await nextTick();

    expect(current.value).toBe(10);

    set(previous => previous + 1);

    expect(onChange).toHaveBeenLastCalledWith(11);
    // Controlled now: the owner's 10 stays on screen until it answers the 11 it was asked for.
    expect(current.value).toBe(10);
  });
});

// Type-level: the tuple is readonly [Ref<T>, SliceSetter<T>].
export type SliceTuple = readonly [Ref<number>, (updater: unknown) => void];
