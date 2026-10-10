<script setup lang="ts">
defineOptions({ name: "LedgerTextInput" });

withDefaults(
  defineProps<{
    modelValue?: string;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { modelValue: "", placeholder: undefined, disabled: false, ariaLabel: undefined }
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const onInput = (event: Event): void => {
  emit("update:modelValue", (event.currentTarget as HTMLInputElement).value);
};
</script>

<template>
  <input
    class="ledger-input"
    :aria-label="ariaLabel"
    :disabled="disabled || undefined"
    :placeholder="placeholder"
    type="text"
    :value="modelValue"
    @input="onInput"
  />
</template>
