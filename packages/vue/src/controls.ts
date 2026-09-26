/**
 * The chrome controls (docs/styling.md): the small internal pieces the table chrome composes —
 * buttons, the checkbox, text/number inputs, the select family, the popover, the spinner. The
 * React edition drew these from Mantine; this edition has no component-library host, so they are
 * ledger-owned controls styled by the stylesheet's `ledger-*` classes and `--ledger-*` tokens.
 *
 * They are internal plumbing, not public surface: the labels/icons registries and the compound
 * components are the API. Presentation props follow Mantine's vocabulary (`variant`, `size`,
 * `disabled`); state stays in the DOM as data-attributes.
 */
import type { Component, CSSProperties, PropType, VNode } from "vue";
import type { LedgerFilterOption } from "./types";
import type { LedgerSize } from "./size";
import { computed, defineComponent, getCurrentScope, h, onScopeDispose, ref, useId, watch } from "vue";

import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";

/* ------------------------------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------------------------------- */

/**
 * A debounce with an explicit cancel — the Vue counterpart of `useDebouncedCallback`. The timer
 * is cleared when the creating scope disposes, so a pending write never fires after unmount
 * (the React edition's `flushOnUnmount` semantics inverted: Vue calls cancel explicitly instead).
 */
export interface Debouncer<Args extends unknown[] = unknown[]> {
  run: (...args: Args) => void;
  cancel: () => void;
}

export function createDebouncer<Args extends unknown[]>(fn: (...args: Args) => void, delay: () => number): Debouncer<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(cancel);
  }

  return {
    run: (...args: Args) => {
      cancel();
      timer = setTimeout(() => fn(...args), delay());
    },
    cancel
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

const IconChevronDown = svgGlyph(() => [h("path", { d: "m6 9 6 6 6-6" })]);
const IconX = svgGlyph(() => [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })]);

/* ------------------------------------------------------------------------------------------------
 * Button
 * ---------------------------------------------------------------------------------------------- */

export type LedgerButtonVariant = "default" | "light" | "subtle";

export const LedgerButton = defineComponent({
  name: "LedgerButton",
  props: {
    variant: { type: String as PropType<LedgerButtonVariant>, default: "default" },
    size: { type: String as PropType<LedgerSize>, default: "sm" },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: undefined }
  },
  setup(props, { slots }) {
    return () =>
      h(
        "button",
        {
          class: "ledger-button",
          "data-variant": props.variant,
          "data-size": props.size,
          type: "button",
          disabled: props.disabled || undefined,
          "aria-label": props.ariaLabel
        },
        slots.default?.()
      );
  }
});

/* ------------------------------------------------------------------------------------------------
 * Checkbox
 * ---------------------------------------------------------------------------------------------- */

/**
 * A native input + a styled box: the input stays in the accessibility tree (focus, space to
 * toggle, `:checked` / `:indeterminate` state) while the box carries the paint. The optional
 * slot is the label text. `data-checked` / `data-indeterminate` on the box also drive the paint
 * when no input sibling exists (the multiselect options reuse the box alone).
 */
export const LedgerCheckbox = defineComponent({
  name: "LedgerCheckbox",
  props: {
    checked: { type: Boolean, default: false },
    indeterminate: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: undefined },
    size: { type: String as PropType<LedgerSize>, default: "sm" }
  },
  emits: {
    "update:checked": (_checked: boolean) => true
  },
  // Fallthrough attrs (the selection cells' onClick) belong on the INPUT, not the label:
  // the handler reads `currentTarget.checked`, which only the input carries.
  inheritAttrs: false,
  setup(props, { emit, slots, attrs }) {
    return () =>
      h(
        "label",
        {
          class: "ledger-checkbox",
          "data-size": props.size,
          "aria-label": props.ariaLabel
        },
        [
          h("input", {
            ...attrs,
            class: "ledger-checkbox-input",
            type: "checkbox",
            checked: props.checked,
            indeterminate: props.indeterminate || undefined,
            disabled: props.disabled || undefined,
            onChange: (event: Event) => emit("update:checked", (event.currentTarget as HTMLInputElement).checked)
          }),
          h("span", {
            class: "ledger-checkbox-box",
            "aria-hidden": true,
            "data-checked": props.checked || undefined,
            "data-indeterminate": props.indeterminate || undefined
          }),
          slots.default ? h("span", { class: "ledger-checkbox-label" }, slots.default()) : null
        ]
      );
  }
});

/* ------------------------------------------------------------------------------------------------
 * Text input
 * ---------------------------------------------------------------------------------------------- */

export const LedgerTextInput = defineComponent({
  name: "LedgerTextInput",
  props: {
    modelValue: { type: String, default: "" },
    placeholder: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: undefined }
  },
  emits: {
    "update:modelValue": (_value: string) => true
  },
  setup(props, { emit }) {
    return () =>
      h("input", {
        class: "ledger-input",
        type: "text",
        value: props.modelValue,
        placeholder: props.placeholder,
        disabled: props.disabled || undefined,
        "aria-label": props.ariaLabel,
        onInput: (event: Event) => emit("update:modelValue", (event.currentTarget as HTMLInputElement).value)
      });
  }
});

/* ------------------------------------------------------------------------------------------------
 * Number input
 * ---------------------------------------------------------------------------------------------- */

/**
 * A native `type="number"` input speaking the React NumberInput's value contract: an empty field
 * reads and writes `""`, everything else a number. While the user types, the raw text is what the
 * field shows (so partial input like `-` survives); the parsed value is what listeners receive.
 */
export const LedgerNumberInput = defineComponent({
  name: "LedgerNumberInput",
  props: {
    modelValue: { type: [Number, String] as PropType<number | "">, default: "" },
    placeholder: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    ariaLabel: { type: String, default: undefined },
    min: { type: Number, default: undefined },
    max: { type: Number, default: undefined },
    step: { type: Number, default: undefined }
  },
  emits: {
    "update:modelValue": (_value: number | "") => true
  },
  setup(props, { emit }) {
    // The raw text, synced from the prop whenever the prop moves from outside. A value arriving
    // back equal to what this input last emitted does not clobber what the user is typing.
    const raw = ref(props.modelValue === "" ? "" : String(props.modelValue));
    let lastEmitted: number | "" = props.modelValue;

    watch(
      () => props.modelValue,
      (value) => {
        if (value !== lastEmitted) {
          raw.value = value === "" ? "" : String(value);
        }
      }
    );

    const handleInput = (event: Event) => {
      const text = (event.currentTarget as HTMLInputElement).value;
      raw.value = text;
      lastEmitted = text.trim() === "" ? "" : Number(text);
      emit("update:modelValue", lastEmitted);
    };

    return () =>
      h("input", {
        class: "ledger-input",
        type: "number",
        value: raw.value,
        placeholder: props.placeholder,
        disabled: props.disabled || undefined,
        "aria-label": props.ariaLabel,
        min: props.min,
        max: props.max,
        step: props.step,
        onInput: handleInput
      });
  }
});

/* ------------------------------------------------------------------------------------------------
 * Select
 * ---------------------------------------------------------------------------------------------- */

interface ResolvedOption {
  value: string;
  label: string;
  disabled: boolean;
  group: string | undefined;
}

function resolveOptions(options: LedgerFilterOption[]): ResolvedOption[] {
  return options.map(option =>
    typeof option === "string"
      ? { value: option, label: option, disabled: false, group: undefined }
      : { value: option.value, label: option.label ?? option.value, disabled: option.disabled ?? false, group: option.group }
  );
}

/**
 * The select-only combobox pattern (APG): a trigger button with `role="combobox"` opening an
 * absolutely positioned `role="listbox"`; Arrow/Home/End move the active option, Enter picks it,
 * Escape closes. Options come as `LedgerFilterOption[]` — bare strings, grouped entries,
 * disabled entries. `null` clears (the filter controls' clear affordance).
 */
export const LedgerSelect = defineComponent({
  name: "LedgerSelect",
  props: {
    modelValue: { type: String as PropType<string | null>, default: null },
    options: { type: Array as PropType<LedgerFilterOption[]>, required: true },
    placeholder: { type: String, default: undefined },
    ariaLabel: { type: String, default: undefined },
    ariaLabelledby: { type: String, default: undefined },
    clearable: { type: Boolean, default: false },
    clearLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    size: { type: String as PropType<LedgerSize>, default: "sm" }
  },
  emits: {
    "update:modelValue": (_value: string | null) => true
  },
  setup(props, { emit }) {
    const uid = useId();
    const open = ref(false);
    const activeIndex = ref(0);
    const rootEl = ref<HTMLElement | null>(null);

    const resolved = computed(() => resolveOptions(props.options));
    const selected = computed(() => resolved.value.find(option => option.value === props.modelValue) ?? null);

    const close = (refocus = false) => {
      open.value = false;
      if (refocus) {
        rootEl.value?.querySelector<HTMLButtonElement>(".ledger-select-trigger")?.focus();
      }
    };

    const pick = (option: ResolvedOption | null) => {
      emit("update:modelValue", option?.value ?? null);
      close(true);
    };

    const moveActive = (delta: 1 | -1 | "first" | "last") => {
      const options = resolved.value;
      if (options.length === 0) {
        return;
      }

      if (delta === "first") {
        activeIndex.value = firstEnabledIndex(options, 0, 1);
        return;
      }

      if (delta === "last") {
        activeIndex.value = firstEnabledIndex(options, options.length - 1, -1);
        return;
      }

      let index = activeIndex.value;
      for (let step = 0; step < options.length; step += 1) {
        index = (index + delta + options.length) % options.length;
        if (!options[index]?.disabled) {
          activeIndex.value = index;
          return;
        }
      }
    };

    const firstEnabledIndex = (options: ResolvedOption[], start: number, step: 1 | -1): number => {
      let index = start;

      for (let visited = 0; visited < options.length && options[index]?.disabled; visited += 1) {
        index += step;
      }

      return Math.max(0, Math.min(index, options.length - 1));
    };

    const openList = () => {
      const current = resolved.value.findIndex(option => option.value === props.modelValue);
      activeIndex.value = current === -1 ? firstEnabledIndex(resolved.value, 0, 1) : current;
      open.value = true;
    };

    const handleTriggerKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp": {
          event.preventDefault();
          if (open.value) {
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else {
            openList();
          }

          break;
        }

        case "Home":
          event.preventDefault();
          moveActive("first");
          break;

        case "End":
          event.preventDefault();
          moveActive("last");
          break;

        case "Enter":
        case " ": {
          event.preventDefault();
          if (open.value) {
            pick(resolved.value[activeIndex.value] ?? null);
          } else {
            openList();
          }

          break;
        }

        case "Escape":
          if (open.value) {
            event.stopPropagation();
            close(true);
          }

          break;

        case "Tab":
          open.value = false;
          break;
      }
    };

    // Outside pointerdown closes — the dropdown is absolutely positioned inside the wrapper, so
    // one listener on the root cannot see it; the document decides.
    const handleDocumentPointerdown = (event: PointerEvent) => {
      if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
        open.value = false;
      }
    };

    watch(open, isOpen => {
      if (isOpen) {
        document.addEventListener("pointerdown", handleDocumentPointerdown, true);
      } else {
        document.removeEventListener("pointerdown", handleDocumentPointerdown, true);
      }
    });

    onScopeDispose(() => document.removeEventListener("pointerdown", handleDocumentPointerdown, true));

    const listId = `${uid}-list`;
    const optionId = (index: number) => `${uid}-option-${index}`;

    // Grouped options render a caption before each group's first entry.
    const renderOptions = () =>
      resolved.value.map((option, index) => {
        const caption
          = option.group !== undefined && resolved.value.findIndex(before => before.group === option.group) === index
            ? h("div", { class: "ledger-select-group", role: "presentation" }, option.group)
            : null;

        return [
          caption,
          h(
            "div",
            {
              id: optionId(index),
              class: "ledger-select-option",
              role: "option",
              "aria-selected": option.value === props.modelValue,
              "aria-disabled": option.disabled || undefined,
              "data-selected": option.value === props.modelValue || undefined,
              "data-active": open.value && index === activeIndex.value || undefined,
              onPointerdown: (event: PointerEvent) => event.preventDefault(),
              onClick: () => !option.disabled && pick(option)
            },
            option.label
          )
        ];
      });

    return () =>
      h(
        "div",
        {
          ref: rootEl,
          class: "ledger-select",
          "data-size": props.size
        },
        [
          h(
            "button",
            {
              class: "ledger-select-trigger",
              type: "button",
              role: "combobox",
              "aria-expanded": open.value,
              "aria-haspopup": "listbox",
              "aria-controls": open.value ? listId : undefined,
              "aria-activedescendant": open.value ? optionId(activeIndex.value) : undefined,
              "aria-label": props.ariaLabel,
              "aria-labelledby": props.ariaLabelledby,
              "aria-disabled": props.disabled || undefined,
              "data-placeholder": selected.value === null || undefined,
              disabled: props.disabled || undefined,
              onClick: () => (open.value ? close() : openList()),
              onKeydown: handleTriggerKeydown
            },
            [
              h("span", { class: "ledger-select-value" }, selected.value?.label ?? props.placeholder ?? ""),
              h(IconChevronDown, { class: "ledger-select-chevron" })
            ]
          ),

          props.clearable
            && props.modelValue !== null
            && h("button", {
              class: "ledger-clear-button",
              type: "button",
              "aria-label": props.clearLabel,
              onClick: (event: MouseEvent) => {
                event.stopPropagation();
                pick(null);
              }
            }, [h(IconX)]),

          open.value
            && h(
              "div",
              {
                id: listId,
                class: "ledger-select-list",
                role: "listbox",
                "aria-label": props.ariaLabel,
                "aria-labelledby": props.ariaLabelledby
              },
              renderOptions()
            )
        ]
      );
  }
});

/* ------------------------------------------------------------------------------------------------
 * Multi select
 * ---------------------------------------------------------------------------------------------- */

/**
 * The multi-select half of the family: `string[]` value, checkbox boxes in the list, joined
 * labels on the trigger. Picking toggles membership; the clear affordance empties the array.
 */
export const LedgerMultiSelect = defineComponent({
  name: "LedgerMultiSelect",
  props: {
    modelValue: { type: Array as PropType<string[]>, required: true },
    options: { type: Array as PropType<LedgerFilterOption[]>, required: true },
    placeholder: { type: String, default: undefined },
    ariaLabel: { type: String, default: undefined },
    clearable: { type: Boolean, default: false },
    clearLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    size: { type: String as PropType<LedgerSize>, default: "sm" }
  },
  emits: {
    "update:modelValue": (_value: string[]) => true
  },
  setup(props, { emit }) {
    const uid = useId();
    const open = ref(false);
    const activeIndex = ref(0);
    const rootEl = ref<HTMLElement | null>(null);

    const resolved = computed(() => resolveOptions(props.options));
    const selected = computed(() => new Set(props.modelValue));
    const triggerLabel = computed(() =>
      props.modelValue
        .map(value => resolved.value.find(option => option.value === value)?.label ?? value)
        .join(", ")
    );

    const close = () => {
      open.value = false;
    };

    const toggle = (option: ResolvedOption) => {
      if (option.disabled) {
        return;
      }

      const next = selected.value.has(option.value)
        ? props.modelValue.filter(value => value !== option.value)
        : [...props.modelValue, option.value];

      emit("update:modelValue", next);
    };

    const moveActive = (delta: 1 | -1 | "first" | "last") => {
      const options = resolved.value;
      if (options.length === 0) {
        return;
      }

      if (delta === "first") {
        activeIndex.value = 0;
        return;
      }

      if (delta === "last") {
        activeIndex.value = options.length - 1;
        return;
      }

      activeIndex.value = (activeIndex.value + delta + options.length) % options.length;
    };

    const openList = () => {
      activeIndex.value = 0;
      open.value = true;
    };

    const handleTriggerKeydown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowDown":
        case "ArrowUp":
          event.preventDefault();
          if (open.value) {
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else {
            openList();
          }

          break;

        case "Home":
          event.preventDefault();
          moveActive("first");
          break;

        case "End":
          event.preventDefault();
          moveActive("last");
          break;

        case "Enter":
        case " ":
          event.preventDefault();
          {
            const option = resolved.value[activeIndex.value];

            if (open.value && option) {
              toggle(option);
            } else {
              openList();
            }
          }

          break;

        case "Escape":
          if (open.value) {
            event.stopPropagation();
            close();
          }

          break;

        case "Tab":
          open.value = false;
          break;
      }
    };

    const handleDocumentPointerdown = (event: PointerEvent) => {
      if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
        open.value = false;
      }
    };

    watch(open, isOpen => {
      if (isOpen) {
        document.addEventListener("pointerdown", handleDocumentPointerdown, true);
      } else {
        document.removeEventListener("pointerdown", handleDocumentPointerdown, true);
      }
    });

    onScopeDispose(() => document.removeEventListener("pointerdown", handleDocumentPointerdown, true));

    const listId = `${uid}-list`;
    const optionId = (index: number) => `${uid}-option-${index}`;

    const renderOptions = () =>
      resolved.value.map((option, index) => {
        const caption
          = option.group !== undefined && resolved.value.findIndex(before => before.group === option.group) === index
            ? h("div", { class: "ledger-select-group", role: "presentation" }, option.group)
            : null;
        const checked = selected.value.has(option.value);

        return [
          caption,
          h(
            "div",
            {
              id: optionId(index),
              class: "ledger-select-option",
              role: "option",
              "aria-selected": checked,
              "aria-disabled": option.disabled || undefined,
              "data-selected": checked || undefined,
              "data-active": open.value && index === activeIndex.value || undefined,
              onPointerdown: (event: PointerEvent) => event.preventDefault(),
              onClick: () => toggle(option)
            },
            [
              h("span", {
                class: "ledger-checkbox-box",
                "aria-hidden": true,
                "data-checked": checked || undefined
              }),
              option.label
            ]
          )
        ];
      });

    return () =>
      h(
        "div",
        {
          ref: rootEl,
          class: "ledger-multiselect",
          "data-size": props.size
        },
        [
          h(
            "button",
            {
              class: "ledger-select-trigger",
              type: "button",
              role: "combobox",
              "aria-expanded": open.value,
              "aria-haspopup": "listbox",
              "aria-controls": open.value ? listId : undefined,
              "aria-activedescendant": open.value ? optionId(activeIndex.value) : undefined,
              "aria-label": props.ariaLabel,
              "aria-disabled": props.disabled || undefined,
              "data-placeholder": props.modelValue.length === 0 || undefined,
              disabled: props.disabled || undefined,
              onClick: () => (open.value ? close() : openList()),
              onKeydown: handleTriggerKeydown
            },
            [
              h("span", { class: "ledger-select-value" }, triggerLabel.value || props.placeholder || ""),
              h(IconChevronDown, { class: "ledger-select-chevron" })
            ]
          ),

          props.clearable
            && props.modelValue.length > 0
            && h("button", {
              class: "ledger-clear-button",
              type: "button",
              "aria-label": props.clearLabel,
              onClick: (event: MouseEvent) => {
                event.stopPropagation();
                emit("update:modelValue", []);
              }
            }, [h(IconX)]),

          open.value
            && h(
              "div",
              {
                id: listId,
                class: "ledger-select-list",
                role: "listbox",
                "aria-multiselectable": true,
                "aria-label": props.ariaLabel
              },
              renderOptions()
            )
        ]
      );
  }
});

/* ------------------------------------------------------------------------------------------------
 * Popover
 * ---------------------------------------------------------------------------------------------- */

/**
 * The popover: reka-ui's Popover — the Vue port of the same Radix machinery Mantine's Popover
 * wraps in the React edition — providing what the hand-rolled version did (open state,
 * outside-pointerdown and Escape dismissal, content focus, focus return) and what it could not
 * (collision-aware placement through floating-ui, repositioning on resize and scroll while the
 * anchor moves). The public shape is unchanged: the default slot is the trigger area — a click
 * bubbling to the anchor toggles, and consumers may stopPropagation and drive `toggle`
 * themselves — and the content slot draws the teleported panel.
 */
export const LedgerPopover = defineComponent({
  name: "LedgerPopover",
  props: {
    placement: { type: String as PropType<"bottom-start" | "bottom-end">, default: "bottom-start" },
    panelWidth: { type: Number, default: undefined },
    panelMaxHeight: { type: String, default: undefined },
    panelStyle: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props, { slots }) {
    const open = ref(false);
    const anchorEl = ref<HTMLElement | null>(null);

    const toggle = () => {
      open.value = !open.value;
    };

    return () =>
      h(
        PopoverRoot,
        {
          open: open.value,
          "onUpdate:open": (value: boolean) => {
            open.value = value;
          }
        },
        {
          default: () => [
            h(PopoverAnchor, { asChild: true }, {
              default: () => h(
                "span",
                {
                  ref: anchorEl,
                  class: "ledger-popover",
                  "aria-expanded": open.value,
                  "aria-haspopup": "dialog",
                  "data-open": open.value || undefined,
                  onClick: toggle
                },
                slots.default?.({ open: open.value, toggle })
              )
            }),
            h(PopoverPortal, null, {
              default: () => h(
                PopoverContent,
                {
                  class: "ledger-popover-panel",
                  side: "bottom",
                  align: props.placement === "bottom-end" ? "end" : "start",
                  sideOffset: 6,
                  // The anchor's own click toggles (a second trigger click closes); reka must
                  // not race it with an outside-dismiss on the same pointerdown.
                  onPointerDownOutside: (event: Event) => {
                    if (anchorEl.value?.contains(event.target as Node)) {
                      event.preventDefault();
                    }
                  },
                  onCloseAutoFocus: (event: Event) => {
                    // Focus returns to the trigger the way the hand-rolled version returned it
                    // to the previously-focused element — there is no PopoverTrigger here for
                    // reka to restore to.
                    event.preventDefault();

                    const focusTarget = anchorEl.value?.querySelector<HTMLElement>("button") ?? anchorEl.value;

                    focusTarget?.focus();
                  },
                  style: {
                    width: props.panelWidth !== undefined ? `${props.panelWidth}px` : undefined,
                    maxHeight: props.panelMaxHeight,
                    ...props.panelStyle
                  }
                },
                slots.content?.()
              )
            })
          ]
        }
      );
  }
});

/* ------------------------------------------------------------------------------------------------
 * Close button and spinner
 * ---------------------------------------------------------------------------------------------- */

/**
 * Mantine's CloseButton: the tiny square X the input-family clear affordances are drawn with.
 * Module-private — it is the anatomy of the inputs, not a registry glyph.
 */
export const LedgerCloseButton = defineComponent({
  name: "LedgerCloseButton",
  props: {
    ariaLabel: { type: String, required: true },
    disabled: { type: Boolean, default: false }
  },
  setup(props) {
    return () =>
      h(
        "button",
        {
          class: "ledger-clear-button",
          type: "button",
          "aria-label": props.ariaLabel,
          disabled: props.disabled || undefined
        },
        [h(IconX)]
      );
  }
});

/**
 * The pending ring. `1em` square, so it scales with the text it sits beside; the rotation is the
 * stylesheet's (ledger-spinner).
 */
export const LedgerSpinner = defineComponent({
  name: "LedgerSpinner",
  setup() {
    return () => h("span", { class: "ledger-spinner", "aria-hidden": true });
  }
});
