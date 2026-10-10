<script setup lang="ts">
/**
 * A native `type="number"` input speaking the React NumberInput's value contract: an empty field
 * reads and writes `""`, everything else a number. While the user types, the raw text is what the
 * field shows (so partial input like `-` survives); the parsed value is what listeners receive.
 */
import { ref, watch } from "vue";

defineOptions({ name: "LedgerNumberInput" });

const props = withDefaults(
  defineProps<{
    modelValue?: number | "";
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    min?: number;
    max?: number;
    step?: number;
  }>(),
  { modelValue: "", placeholder: undefined, disabled: false, ariaLabel: undefined, min: undefined, max: undefined, step: undefined }
);

const emit = defineEmits<{
  "update:modelValue": [value: number | ""];
}>();

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

const onInput = (event: Event): void => {
  const text = (event.currentTarget as HTMLInputElement).value;
  raw.value = text;
  lastEmitted = text.trim() === "" ? "" : Number(text);
  emit("update:modelValue", lastEmitted);
};
</script>

<template>
  <input
    class="ledger-input"
    :aria-label="ariaLabel"
    :disabled="disabled || undefined"
    :max="max"
    :min="min"
    :placeholder="placeholder"
    :step="step"
    type="number"
    :value="raw"
    @input="onInput"
  />
</template>
