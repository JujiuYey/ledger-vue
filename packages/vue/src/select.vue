<script setup lang="ts">
/**
 * The editor's single-pick control — the library's first SFC component, transcribed from the
 * shadcn-vue `select` registry set (`npx shadcn-vue add select`: Select / SelectTrigger /
 * SelectContent / SelectViewport / SelectItem / SelectItemText / SelectItemIndicator /
 * SelectGroup / SelectLabel / SelectScroll*Button, each a thin reka-ui wrapper) and composed
 * here into the editor's options-array API. The transcription rules:
 *
 * - reka-ui stays the behavior engine, exactly as in shadcn-vue (open state, the ported
 *   dropdown, highlight and typeahead, popper placement, outside and Escape dismissal).
 * - shadcn's Tailwind classes become `ledger-editor-select-*` classes resolved by the layered
 *   stylesheet from the same `--ledger-*` tokens as every other control — the skin is the
 *   Vue edition's own (Mantine parity), never a published dependency.
 * - shadcn's lucide glyphs stay anatomy glyphs drawn by `svgGlyph` (the library carries no
 *   icon dependency); the ported dropdown marks itself `data-ledger-editor-surface` so the
 *   cell editor host's outside-click cancel counts it as inside.
 *
 * It is internal plumbing like the rest of `controls.ts`, and it is distinct from the filter
 * family's hand-rolled `LedgerSelect` (controls.ts): that one lists inline, this one portals,
 * because a cell editor opens inside a clipped, scroll-transformed table where an inline list
 * cannot escape the cell.
 */
import type { PropType } from "vue";
import type { LedgerSize } from "./size";
import type { SelectEditorOption } from "./types";
import { computed, h, useId } from "vue";

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

defineOptions({ name: "LedgerSelect" });

const props = defineProps({
  modelValue: { type: String as PropType<string | null>, default: null },
  options: { type: Array as PropType<SelectEditorOption[]>, required: true },
  ariaLabel: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  size: { type: String as PropType<LedgerSize>, default: "sm" },
  /** Cell mode opens at once — one cell is the whole session, Mantine's `defaultDropdownOpened`. */
  defaultOpen: { type: Boolean, default: false }
});

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
}>();

const uid = useId();

// shadcn's SelectItem renders the check inside an absolutely-placed span, so every row reserves
// the mark's column; the glyph is this library's anatomy check, not a lucide import.
const IconCheck = svgGlyph(() => [h("path", { d: "M20 6 9 17l-5-5" })]);
const IconChevronDown = svgGlyph(() => [h("path", { d: "m6 9 6 6 6-6" })]);
const IconChevronUp = svgGlyph(() => [h("path", { d: "m18 15-6-6-6 6" })]);

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

const groups = computed<ResolvedGroup[]>(() => {
  const buckets: ResolvedGroup[] = [];

  for (const option of resolveOptions(props.options)) {
    let bucket = buckets.find(candidate => candidate.label === option.group);

    if (!bucket) {
      bucket = { label: option.group, options: [] };
      buckets.push(bucket);
    }

    bucket.options.push(option);
  }

  return buckets;
});

// Null is "no selection": reka wants undefined for that, and its update carries undefined the
// other way, which maps back to null here.
const rootValue = computed(() => props.modelValue ?? undefined);

const onRootUpdate = (value: unknown): void => {
  emit("update:modelValue", value === null || value === undefined ? null : String(value));
};
</script>

<template>
  <SelectRoot
    :default-open="defaultOpen"
    :model-value="rootValue"
    @update:model-value="onRootUpdate"
  >
    <!-- SelectTrigger (shadcn): the value span, then the chevron through SelectIcon as-child. -->
    <SelectTrigger
      :aria-label="ariaLabel"
      class="ledger-input ledger-editor-select-trigger"
      :data-size="size"
      :disabled="disabled || undefined"
    >
      <SelectValue placeholder="" />
      <SelectIcon as-child>
        <IconChevronDown class="ledger-editor-select-chevron" />
      </SelectIcon>
    </SelectTrigger>

    <!-- SelectContent (shadcn): portal, popper position, scroll buttons around the viewport. -->
    <SelectPortal>
      <SelectContent
        :id="`${uid}-list`"
        align="start"
        class="ledger-editor-select-content"
        data-ledger-editor-surface=""
        position="popper"
        side="bottom"
        :side-offset="6"
      >
        <SelectScrollUpButton class="ledger-editor-select-scroll">
          <IconChevronUp />
        </SelectScrollUpButton>

        <SelectViewport class="ledger-editor-select-viewport">
          <template v-for="group in groups" :key="group.label ?? '-unmapped'">
            <SelectGroup v-if="group.label !== null">
              <!-- SelectGroup + SelectLabel (shadcn): the non-selectable caption. -->
              <SelectLabel class="ledger-editor-select-group-label">
                {{ group.label }}
              </SelectLabel>
              <SelectItem
                v-for="option in group.options"
                :key="option.value"
                class="ledger-editor-select-item"
                :disabled="option.disabled || undefined"
                :value="option.value"
              >
                <SelectItemIndicator class="ledger-editor-select-check">
                  <IconCheck />
                </SelectItemIndicator>
                <SelectItemText>{{ option.label }}</SelectItemText>
              </SelectItem>
            </SelectGroup>
            <template v-else>
              <SelectItem
                v-for="option in group.options"
                :key="option.value"
                class="ledger-editor-select-item"
                :disabled="option.disabled || undefined"
                :value="option.value"
              >
                <SelectItemIndicator class="ledger-editor-select-check">
                  <IconCheck />
                </SelectItemIndicator>
                <SelectItemText>{{ option.label }}</SelectItemText>
              </SelectItem>
            </template>
          </template>
        </SelectViewport>

        <SelectScrollDownButton class="ledger-editor-select-scroll">
          <IconChevronDown />
        </SelectScrollDownButton>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
