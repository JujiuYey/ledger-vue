<script setup lang="ts">
/**
 * The pending ring. `1em` square, so it scales with the text it sits beside; the rotation is the
 * stylesheet's (ledger-spinner).
 */
defineOptions({ name: "LedgerSpinner" });
</script>

<template>
  <span aria-hidden="true" class="ledger-spinner" />
</template>
