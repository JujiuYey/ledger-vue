<script setup lang="ts">
/**
 * Mantine's CloseButton: the tiny square X the input-family clear affordances are drawn with.
 * It is the anatomy of the inputs, not a registry glyph.
 */
import { h } from "vue";

import { svgGlyph } from "./controls";

defineOptions({ name: "LedgerCloseButton" });

withDefaults(
  defineProps<{
    ariaLabel: string;
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const IconX = svgGlyph(() => [h("path", { d: "M18 6 6 18" }), h("path", { d: "m6 6 12 12" })]);
</script>

<template>
  <button
    class="ledger-clear-button"
    :aria-label="ariaLabel"
    :disabled="disabled || undefined"
    type="button"
  >
    <IconX />
  </button>
</template>
