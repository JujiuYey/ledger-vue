<script setup lang="ts">
import type { LedgerSize } from "./size";

defineOptions({ name: "LedgerButton" });

withDefaults(
  defineProps<{
    variant?: "default" | "light" | "subtle";
    size?: LedgerSize;
    disabled?: boolean;
    ariaLabel?: string;
  }>(),
  { variant: "default", size: "sm", disabled: false, ariaLabel: undefined }
);
</script>

<template>
  <button
    class="ledger-button"
    :aria-label="ariaLabel"
    :data-size="size"
    :data-variant="variant"
    :disabled="disabled || undefined"
    type="button"
  >
    <slot />
  </button>
</template>
