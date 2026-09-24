import type { Updater } from "@tanstack/vue-table";
import type { Ref } from "vue";
import { ref, toValue, watch } from "vue";

import { functionalUpdate } from "@tanstack/vue-table";

/**
 * One state slice of the table, following the canonical controlled/uncontrolled contract
 * (docs/state.md): controlled `value` / uncontrolled `defaultValue` / observer `onChange`
 * receiving the resolved value. TanStack hands us `Updater`s; they are resolved here so consumer
 * callbacks never see a function.
 *
 * Vue edition: there is no concurrent rendering to tear a read away from a commit — the whole
 * requested-value machinery the React edition carries collapses to one rule. The internal ref
 * mirrors the controlled prop whenever it moves (the owner's answer, normalization included),
 * and a `set` writes the resolved value into the ref first: in uncontrolled mode that IS the
 * state; in controlled mode it is the optimistic echo that stands until the owner answers or
 * declines through the prop. Either way `onChange` fires with the resolved value, never a
 * function.
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
}: UseSliceInput<T>): readonly [Ref<T>, SliceSetter<T>] {
  const initial = toValue(value);
  const internal = ref<T>((initial ?? defaultValue ?? fallback)) as Ref<T>;

  // The owner's answer — accepted, normalized, or replaced — reaches the ref here. Equality
  // writes are no-ops by ref semantics, so an acceptance echo costs nothing.
  watch(() => toValue(value), (next) => {
    if (next !== undefined) {
      internal.value = next;
    }
  });

  const set = (updater: Updater<T>): void => {
    const next = functionalUpdate(updater, internal.value);

    onSet?.(next);
    internal.value = next;
    onChange?.(next);
  };

  return [internal, set] as const;
}
