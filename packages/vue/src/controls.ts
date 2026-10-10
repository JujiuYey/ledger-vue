/**
 * The chrome controls (docs/styling.md): the small internal pieces the table chrome composes —
 * buttons, the checkbox, text/number inputs, the select family, the popover, the spinner. The
 * React edition drew these from Mantine; this edition has no component-library host, so they are
 * ledger-owned controls styled by the stylesheet's `ledger-*` classes and `--ledger-*` tokens.
 *
 * Since the SFC direction (2026-10, DESIGN.md) each control is its own `<script setup>` component
 * file — `button.vue`, `checkbox.vue`, `text-input.vue`, `number-input.vue`, `filter-select.vue`
 * (the inline select the filter family and the pagination bar use — `select.vue` is the editor's
 * portaled reka one), `multi-select.vue`, `popover.vue`, `close-button.vue`, `spinner.vue` — and
 * this module is their barrel plus the two shared helpers that are not components. They are
 * internal plumbing, not public surface: the labels/icons registries and the compound components
 * are the API. Presentation props follow Mantine's vocabulary (`variant`, `size`, `disabled`);
 * state stays in the DOM as data-attributes.
 */
import type { Component, VNode } from "vue";
import { getCurrentScope, h, onScopeDispose } from "vue";

/* ------------------------------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------------------------------- */

/**
 * A debounce with an explicit cancel — the Vue counterpart of `useDebouncedCallback`. The timer
 * is cleared when the creating scope disposes, so a pending write never fires after unmount —
 * or, with `flushOnDispose`, the pending write FIRES on dispose (the React edition's
 * `flushOnUnmount`: closing the filter popover commits what was typed, never drops it).
 */
export interface Debouncer<Args extends unknown[] = unknown[]> {
  run: (...args: Args) => void;
  cancel: () => void;
  flush: () => void;
}

export function createDebouncer<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: () => number,
  options?: { flushOnDispose?: boolean }
): Debouncer<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Args | undefined;

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending = undefined;
  };

  const flush = () => {
    if (timer !== undefined && pending !== undefined) {
      const args = pending;

      cancel();
      fn(...args);
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(options?.flushOnDispose ? flush : cancel);
  }

  return {
    run: (...args: Args) => {
      cancel();
      pending = args;
      timer = setTimeout(() => {
        const queued = pending;

        timer = undefined;
        pending = undefined;

        if (queued !== undefined) {
          fn(...queued);
        }
      }, delay());
    },
    cancel,
    flush
  };
}

/**
 * The inline glyph factory the controls need (chevrons, the close cross). The table chrome's
 * swappable glyphs live in `icons.ts` and reach components through the resolved registry — these
 * never do: they are the anatomy of the controls themselves, the way Mantine's Select carried its
 * own chevron. Path data is Feather/Lucide, same license note as `icons.ts`.
 */
export function svgGlyph(paths: () => VNode[]): Component {
  return () =>
    h(
      "svg",
      {
        "aria-hidden": true,
        fill: "none",
        height: 16,
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": 2,
        viewBox: "0 0 24 24",
        width: 16
      },
      paths()
    );
}

/* ------------------------------------------------------------------------------------------------
 * The components (each its own SFC)
 * ---------------------------------------------------------------------------------------------- */

export type LedgerButtonVariant = "default" | "light" | "subtle";

export { default as LedgerButton } from "./button.vue";
export { default as LedgerCheckbox } from "./checkbox.vue";
export { default as LedgerCloseButton } from "./close-button.vue";
export { default as LedgerMultiSelect } from "./multi-select.vue";
export { default as LedgerNumberInput } from "./number-input.vue";
export { default as LedgerPopover } from "./popover.vue";
export { default as LedgerSelect } from "./filter-select.vue";
export { default as LedgerSpinner } from "./spinner.vue";
export { default as LedgerTextInput } from "./text-input.vue";
