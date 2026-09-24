import type { Ref } from "vue";
import { nextTick, ref } from "vue";

import { describe, expect, it, vi } from "vitest";

import { useSlice } from "./use-slice";

/**
 * Port of the React `useSlice` contract tests. The React edition's concurrency-specific cases
 * (transitions, Suspense blockers, requested-value bookkeeping) exist to defeat React tearing
 * and have no Vue counterpart — Vue's reactivity has no discarded renders, so `useSlice`
 * collapses to one rule (see use-slice.ts): the internal ref mirrors the controlled prop
 * whenever it moves, and a `set` writes the resolved value into the ref first — the optimistic
 * echo that stands until the owner answers through the prop. The two dropped scenarios are
 * noted inline below.
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
    // Vue contract: the set is the optimistic echo — the ref holds the resolved value until the
    // owner answers or declines through the prop (the React edition held the line at 5; its
    // requested-value machinery is what the Vue edition collapses).
    expect(current.value).toBe(6);

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

  it("keeps the optimistic echo until the owner answers through the prop", async () => {
    // React: "drops an optimistic value the controlled owner declined". Vue: an owner that never
    // moves the prop never re-fires the mirror watch, so the echo stands and the next event
    // departs from it. The invariant that survives from the React test is the second part: two
    // separate events (a microtask checkpoint between them, exactly what a browser does between
    // two real clicks) each resolve against the current internal value, never a stale one.
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
    expect(current.value).toBe(6);

    // Two separate events.
    await Promise.resolve();

    set(previous => previous + 1);

    expect(onChange.mock.calls.map(call => call[0])).toEqual([6, 7]);
    expect(current.value).toBe(7);

    // The owner declines and names 5 again — no change, no mirror — then changes its mind to 4:
    // the prop moving is what re-claims the slice.
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
    expect(current.value).toBe(11);
  });
});

// Type-level: the tuple is readonly [Ref<T>, SliceSetter<T>].
export type SliceTuple = readonly [Ref<number>, (updater: unknown) => void];
