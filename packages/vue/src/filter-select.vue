<script setup lang="ts">
/**
 * The select-only combobox pattern (APG): a trigger button with `role="combobox"` opening an
 * absolutely positioned `role="listbox"`; Arrow/Home/End move the active option, Enter picks it,
 * Escape closes. Options come as `LedgerFilterOption[]` — bare strings, grouped entries,
 * disabled ones. It lists inline (the filter popover and the pagination bar are the consumers);
 * the cell editor's select (`select.vue`) is the portaled reka one.
 *
 * SFC transcription of the hand-rolled version: the behavior (this script) is unchanged; the
 * DOM — classes, roles, data-attributes — is what the stylesheet and the tests read.
 */
import type { LedgerFilterOption } from "./types";
import type { LedgerSize } from "./size";
import { computed, h, ref, useId, watch, onScopeDispose } from "vue";

import { svgGlyph } from "./controls";

defineOptions({ name: "LedgerSelect" });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    options: LedgerFilterOption[];
    placeholder?: string;
    ariaLabel?: string;
    ariaLabelledby?: string;
    clearable?: boolean;
    clearLabel?: string;
    disabled?: boolean;
    size?: LedgerSize;
  }>(),
  { modelValue: null, placeholder: undefined, ariaLabel: undefined, ariaLabelledby: undefined, clearable: false, clearLabel: undefined, disabled: false, size: "sm" }
);

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
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

const onTriggerKeydown = (event: KeyboardEvent) => {
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

/** Whether `index` is the first entry of its group (grouped options render a caption before it). */
const isGroupHead = (index: number): boolean => {
  const option = resolved.value[index];

  if (!option) {
    return false;
  }

  return option.group !== undefined && resolved.value.findIndex(before => before.group === option.group) === index;
};

const onOptionPointerdown = (event: PointerEvent): void => {
  event.preventDefault();
};

const onOptionClick = (option: ResolvedOption): void => {
  if (!option.disabled) {
    pick(option);
  }
};

const onClear = (event: MouseEvent): void => {
  event.stopPropagation();
  pick(null);
};
</script>

<template>
  <div ref="rootEl" class="ledger-select" :data-size="size">
    <button
      class="ledger-select-trigger"
      :aria-expanded="open"
      :aria-haspopup="'listbox'"
      :aria-controls="open ? listId : undefined"
      :aria-activedescendant="open ? optionId(activeIndex) : undefined"
      :aria-label="ariaLabel"
      :aria-labelledby="ariaLabelledby"
      :aria-disabled="disabled || undefined"
      :data-placeholder="selected === null || undefined"
      :disabled="disabled || undefined"
      type="button"
      role="combobox"
      @click="open ? close() : openList()"
      @keydown="onTriggerKeydown"
    >
      <span class="ledger-select-value">{{ selected?.label ?? placeholder ?? "" }}</span>
      <IconChevronDown class="ledger-select-chevron" />
    </button>

    <button
      v-if="clearable && modelValue !== null"
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
      :aria-labelledby="ariaLabelledby"
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
          :aria-selected="option.value === modelValue"
          :aria-disabled="option.disabled || undefined"
          :data-active="open && index === activeIndex || undefined"
          :data-selected="option.value === modelValue || undefined"
          role="option"
          @click="onOptionClick(option)"
          @pointerdown="onOptionPointerdown"
        >
          {{ option.label }}
        </div>
      </template>
    </div>
  </div>
</template>
