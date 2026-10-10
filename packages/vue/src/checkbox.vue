<script setup lang="ts">
/**
 * A native input + a styled box: the input stays in the accessibility tree (focus, space to
 * toggle, `:checked` / `:indeterminate` state) while the box carries the paint. The optional
 * slot is the label text. `data-checked` / `data-indeterminate` on the box also drive the paint
 * when no input sibling exists (the multiselect options reuse the box alone).
 *
 * Deliberately NOT reka's Checkbox (shadcn-vue's is a button): the selection cells' handlers
 * read `currentTarget.checked`, a contract only the native input carries.
 */
import type { LedgerSize } from "./size";

defineOptions({
  name: "LedgerCheckbox",
  // Fallthrough attrs (the selection cells' onClick) belong on the INPUT, not the label:
  // the handler reads `currentTarget.checked`, which only the input carries.
  inheritAttrs: false
});

withDefaults(
  defineProps<{
    checked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    size?: LedgerSize;
  }>(),
  { checked: false, indeterminate: false, disabled: false, ariaLabel: undefined, size: "sm" }
);

const emit = defineEmits<{
  "update:checked": [checked: boolean];
}>();

const onChange = (event: Event): void => {
  emit("update:checked", (event.currentTarget as HTMLInputElement).checked);
};
</script>

<template>
  <label class="ledger-checkbox" :aria-label="ariaLabel" :data-size="size">
    <input
      v-bind="$attrs"
      class="ledger-checkbox-input"
      :checked="checked"
      :disabled="disabled || undefined"
      :indeterminate="indeterminate || undefined"
      type="checkbox"
      @change="onChange"
    />
    <span
      aria-hidden="true"
      class="ledger-checkbox-box"
      :data-checked="checked || undefined"
      :data-indeterminate="indeterminate || undefined"
    />
    <span v-if="$slots.default" class="ledger-checkbox-label">
      <slot />
    </span>
  </label>
</template>
