/**
 * The editor's single-pick control — reka-ui's Select, the Vue port of the same Radix machinery
 * Mantine's Select wraps in the React edition. reka provides the behavior (open state, the
 * ported dropdown, highlight and typeahead, collision-aware popper placement, outside and
 * Escape dismissal); the `ledger-editor-select-*` classes draw the surface, from the same
 * `--ledger-*` tokens the rest of the controls read.
 *
 * It is internal plumbing like the rest of `controls.ts` — the labels/icons registries are the
 * API — and it is distinct from the filter family's hand-rolled `LedgerSelect` (controls.ts):
 * that one lists inline, this one portals, because a cell editor opens inside a clipped,
 * scroll-transformed table where an inline list cannot escape the cell.
 */
import type { PropType, VNode } from "vue";
import type { LedgerSize } from "./size";
import { computed, defineComponent, Fragment, h } from "vue";

import {
  SelectContent,
  SelectGroup,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectPortal,
  SelectRoot,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectTrigger,
  SelectValue,
  SelectViewport
} from "reka-ui";

import { svgGlyph } from "./controls";

/**
 * One option of the select editor. A bare string is its own value and label; `group` clusters
 * options under a non-selectable caption. The Vue edition has no Mantine to borrow
 * `ComboboxData` from, so the shape is declared here.
 */
export type SelectEditorOption
  = | string
    | { value: string; label?: string; disabled?: boolean }
    | { group: string; items: SelectEditorOption[] };

interface ResolvedOption {
  disabled: boolean;
  group: string | null;
  label: string;
  value: string;
}

function resolveOptions(options: SelectEditorOption[]): ResolvedOption[] {
  return options.flatMap((option): ResolvedOption[] => {
    if (typeof option === "string") {
      return [{ disabled: false, group: null, label: option, value: option }];
    }

    if ("group" in option) {
      return resolveOptions(option.items).map(resolved => ({ ...resolved, group: option.group }));
    }

    return [{ disabled: option.disabled ?? false, group: null, label: option.label ?? option.value, value: option.value }];
  });
}

/** Options order into render order: the ungrouped head, then each group at its first member. */
interface ResolvedGroup {
  label: string | null;
  options: ResolvedOption[];
}

function groupOptions(options: ResolvedOption[]): ResolvedGroup[] {
  const groups: ResolvedGroup[] = [];

  for (const option of options) {
    let bucket = groups.find(group => group.label === option.group);

    if (!bucket) {
      bucket = { label: option.group, options: [] };
      groups.push(bucket);
    }

    bucket.options.push(option);
  }

  return groups;
}

const IconChevronDown = svgGlyph(() => [h("path", { d: "m6 9 6 6 6-6" })]);
const IconChevronUp = svgGlyph(() => [h("path", { d: "m18 15-6-6-6 6" })]);
const IconCheck = svgGlyph(() => [h("path", { d: "M20 6 9 17l-5-5" })]);

export const LedgerSelect = defineComponent({
  name: "LedgerSelect",
  props: {
    modelValue: { type: String as PropType<string | null>, default: null },
    options: { type: Array as PropType<SelectEditorOption[]>, required: true },
    ariaLabel: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    size: { type: String as PropType<LedgerSize>, default: "sm" },
    /** Cell mode opens at once — one cell is the whole session, the way Mantine's
     * `defaultDropdownOpened` did it. */
    defaultOpen: { type: Boolean, default: false }
  },
  emits: {
    "update:modelValue": (_value: string | null) => true
  },
  setup(props, { emit }) {
    const groups = computed(() => groupOptions(resolveOptions(props.options)));

    const renderItem = (option: ResolvedOption): VNode =>
      h(
        SelectItem,
        {
          class: "ledger-editor-select-item",
          disabled: option.disabled || undefined,
          value: option.value
        },
        {
          default: () => [
            h(SelectItemIndicator, { class: "ledger-editor-select-check" }, { default: () => [h(IconCheck)] }),
            h(SelectItemText, null, { default: () => option.label })
          ]
        }
      );

    const renderGroups = (): VNode[] =>
      groups.value.map(group =>
        group.label === null
          ? h(Fragment, group.options.map(renderItem))
          : h(SelectGroup, { class: "ledger-editor-select-group", key: group.label }, {
              default: () => [
                h(SelectLabel, { class: "ledger-editor-select-group-label" }, { default: () => group.label }),
                h(Fragment, group.options.map(renderItem))
              ]
            })
      );

    return () =>
      h(
        SelectRoot,
        {
          defaultOpen: props.defaultOpen || undefined,
          // Null is "no selection": reka wants undefined for that, and its update carries
          // undefined the other way, which maps back to null here.
          modelValue: props.modelValue ?? undefined,
          "onUpdate:modelValue": (value: unknown) => {
            emit("update:modelValue", value === null || value === undefined ? null : String(value));
          }
        },
        {
          default: () => [
            h(
              SelectTrigger,
              {
                "aria-label": props.ariaLabel,
                class: "ledger-input ledger-editor-select-trigger",
                "data-size": props.size,
                disabled: props.disabled || undefined
              },
              {
                default: () => [
                  h(SelectValue, { placeholder: "" }),
                  h(SelectIcon, { asChild: true }, { default: () => [h(IconChevronDown, { class: "ledger-editor-select-chevron" })] })
                ]
              }
            ),
            h(SelectPortal, null, {
              default: () =>
                h(
                  SelectContent,
                  {
                    align: "start",
                    class: "ledger-editor-select-content",
                    position: "popper",
                    side: "bottom",
                    sideOffset: 6,
                    // The cell editor host's outside-click cancel reads this: a pointerdown
                    // inside the ported dropdown is inside the editor, wherever the panel
                    // itself is mounted.
                    "data-ledger-editor-surface": ""
                  },
                  {
                    default: () => [
                      h(SelectScrollUpButton, { class: "ledger-editor-select-scroll" }, { default: () => [h(IconChevronUp)] }),
                      h(SelectViewport, { class: "ledger-editor-select-viewport" }, { default: renderGroups }),
                      h(SelectScrollDownButton, { class: "ledger-editor-select-scroll" }, { default: () => [h(IconChevronDown)] })
                    ]
                  }
                )
            })
          ]
        }
      );
  }
});
