import type { Updater } from "@tanstack/vue-table";
import type { ComputedRef, Ref } from "vue";
import { computed, ref, toValue, watch } from "vue";

import { functionalUpdate } from "@tanstack/vue-table";

/**
 * One state slice of the table, following the canonical controlled/uncontrolled contract
 * (docs/state.md): controlled `value` / uncontrolled `defaultValue` / observer `onChange`
 * receiving the resolved value. TanStack hands us `Updater`s; they are resolved here so consumer
 * callbacks never see a function.
 *
 * Vue edition: the slice reads through one computed — the controlled prop while the owner holds
 * the slice, the internal ref the moment it does not — and a `set` resolves its updater against
 * what that computed says before writing the resolved value into the internal ref and reporting
 * it. In controlled mode the owner is the authority: moving `value` is it answering (accepted,
 * normalized, or replaced — the mirror watch carries the answer into the ref, so a later
 * handover to uncontrolled departs from the owner's last word), and silence is a refusal — the
 * on-screen value never echoes a request the owner declined, and the next event departs from
 * what is on screen. That is the React edition's contract verbatim; its requested-value ledger
 * only existed to keep updaters honest across React's commit windows, which Vue's synchronous
 * reactivity does not have.
 *
 * `undefined` is the only "not controlled" signal — `null` is a value several slices legitimately
 * hold (the editing cells) — so every controlled-ness check compares against `undefined`.
 */
export type SliceSetter<T> = (updater: Updater<T>) => void;

export interface UseSliceInput<T> {
  /**
   * The controlled value, as a reactive getter. `undefined` means uncontrolled.
   */
  value: () => T | undefined;
  defaultValue: T | undefined;
  onChange: ((value: T) => void) | undefined;
  /**
   * Internal notification for every resolved set attempt. Used by debounced controls to observe
   * an external reset to the current value.
   */
  onSet?: (value: T) => void;
  fallback: T;
}

export function useSlice<T>({
  value,
  defaultValue,
  onChange,
  onSet,
  fallback
}: UseSliceInput<T>): readonly [ComputedRef<T>, SliceSetter<T>] {
  const initial = toValue(value);
  const internal = ref<T>(initial !== undefined ? initial : (defaultValue !== undefined ? defaultValue : fallback)) as Ref<T>;

  // The owner's answer — accepted, normalized, or replaced — reaches the ref here. Equality
  // writes are no-ops by ref semantics, so an acceptance echo costs nothing.
  watch(() => toValue(value), (next) => {
    if (next !== undefined) {
      internal.value = next;
    }
  });

  // Controlled: the owner's prop is the on-screen value, full stop. Uncontrolled: the internal
  // ref is the state.
  const current = computed<T>(() => {
    const controlled = toValue(value);

    return controlled !== undefined ? controlled : internal.value;
  });

  const set = (updater: Updater<T>): void => {
    const next = functionalUpdate(updater, current.value);

    onSet?.(next);
    internal.value = next;
    onChange?.(next);
  };

  return [current, set] as const;
}
