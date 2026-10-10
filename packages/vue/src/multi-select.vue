<script setup lang="ts">
/**
 * The multi-select half of the family: `string[]` value, checkbox boxes in the list, joined
 * labels on the trigger. Picking toggles membership; the clear affordance empties the array.
 * Same inline-list APG skeleton as `filter-select.vue`; deliberately not reka — reka's Select
 * family is single-pick, and its Checkbox is a button whose semantics the boxes don't share.
 */
import type { LedgerFilterOption } from "./types";
import type { LedgerSize } from "./size";
import { computed, h, ref, useId, watch, onScopeDispose } from "vue";

import { svgGlyph } from "./controls";

defineOptions({ name: "LedgerMultiSelect" });

const props = withDefaults(
  defineProps<{
    modelValue: string[];
    options: LedgerFilterOption[];
    placeholder?: string;
    ariaLabel?: string;
    clearable?: boolean;
    clearLabel?: string;
    disabled?: boolean;
    size?: LedgerSize;
  }>(),
  { placeholder: undefined, ariaLabel: undefined, clearable: false, clearLabel: undefined, disabled: false, size: "sm" }
);

const emit = defineEmits<{
  "update:modelValue": [value: string[]];
}>();

const IconChevronDown = svgGlyph(() => [h("path", { d: "m6 9 6 6 6-6" })]);
const IconX = svgGlyph(() => [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })]);

interface ResolvedOption {
  value: string;
  label: string;
  disabled: boolean;
  group: string | undefined;
}

const uid = useId();
const open = ref(false);
const activeIndex = ref(0);
const rootEl = ref<HTMLElement | null>(null);

const resolved = computed(() =>
  (props.options ?? []).map(option =>
    typeof option === "string"
      ? { value: option, label: option, disabled: false, group: undefined }
      : { value: option.value, label: option.label ?? option.value, disabled: option.disabled ?? false, group: option.group }
  )
);
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

const onTriggerKeydown = (event: KeyboardEvent) => {
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
    case " ": {
      event.preventDefault();
      const option = resolved.value[activeIndex.value];

      if (open.value && option) {
        toggle(option);
      } else {
        openList();
      }

      break;
    }

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

const onDocumentPointerdown = (event: PointerEvent) => {
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
    open.value = false;
  }
};

watch(open, isOpen => {
  if (isOpen) {
    document.addEventListener("pointerdown", onDocumentPointerdown, true);
  } else {
    document.removeEventListener("pointerdown", onDocumentPointerdown, true);
  }
});

onScopeDispose(() => document.removeEventListener("pointerdown", onDocumentPointerdown, true));

const listId = `${uid}-list`;
const optionId = (index: number) => `${uid}-option-${index}`;

const isGroupHead = (index: number): boolean => {
  const option = resolved.value[index];

  if (!option) {
    return false;
  }

  return option.group !== undefined && resolved.value.findIndex(before => before.group === option.group) === index;
};

const onClear = (event: MouseEvent): void => {
  event.stopPropagation();
  emit("update:modelValue", []);
};
</script>

<template>
  <div ref="rootEl" class="ledger-multiselect" :data-size="size">
    <button
      class="ledger-select-trigger"
      :aria-expanded="open"
      :aria-haspopup="'listbox'"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="open ? optionId(activeIndex) : undefined"
      :aria-label="ariaLabel"
      :aria-disabled="disabled || undefined"
      :data-placeholder="modelValue.length === 0 || undefined"
      :disabled="disabled || undefined"
      type="button"
      role="combobox"
      @click="open ? close() : openList()"
      @keydown="onTriggerKeydown"
    >
      <span class="ledger-select-value">{{ triggerLabel || placeholder || "" }}</span>
      <IconChevronDown class="ledger-select-chevron" />
    </button>

    <button
      v-if="clearable && modelValue.length > 0"
      class="ledger-clear-button"
      :aria-label="clearLabel"
      type="button"
      @click="onClear"
    >
      <IconX />
    </button>

    <div
      v-if="open"
      :id="listId"
      class="ledger-select-list"
      :aria-label="ariaLabel"
      aria-multiselectable="true"
      role="listbox"
    >
      <template v-for="(option, index) in resolved" :key="option.value">
        <div
          v-if="isGroupHead(index)"
          class="ledger-select-group"
          role="presentation"
        >
          {{ option.group }}
        </div>
        <div
          :id="optionId(index)"
          class="ledger-select-option"
          :aria-selected="selected.has(option.value)"
          :aria-disabled="option.disabled || undefined"
          :data-active="open && index === activeIndex || undefined"
          :data-selected="selected.has(option.value) || undefined"
          role="option"
          @click="toggle(option)"
          @pointerdown.prevent
        >
          <span
            aria-hidden="true"
            class="ledger-checkbox-box"
            :data-checked="selected.has(option.value) || undefined"
          />
          {{ option.label }}
        </div>
      </template>
    </div>
  </div>
</template>
