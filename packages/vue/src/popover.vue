<script setup lang="ts">
/**
 * The popover: reka-ui's Popover — the Vue port of the same Radix machinery Mantine's Popover
 * wraps in the React edition — providing what the hand-rolled version did (open state,
 * outside-pointerdown and Escape dismissal, content focus, focus return) and what it could not
 * (collision-aware placement through floating-ui, repositioning on resize and scroll while the
 * anchor moves). The public shape is unchanged: the default slot is the trigger area — a click
 * bubbling to the anchor toggles, and consumers may stopPropagation and drive `toggle`
 * themselves — and the content slot draws the teleported panel. SFC transcription; reka's own
 * Popover* wrappers in shadcn-vue's registry are the thin per-primitive form of the same tree.
 */
import type { CSSProperties } from "vue";
import { ref } from "vue";

import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from "reka-ui";

defineOptions({ name: "LedgerPopover" });

withDefaults(
  defineProps<{
    placement?: "bottom-start" | "bottom-end";
    panelWidth?: number;
    panelMaxHeight?: string;
    panelStyle?: CSSProperties;
  }>(),
  { placement: "bottom-start", panelWidth: undefined, panelMaxHeight: undefined, panelStyle: undefined }
);

const open = ref(false);
const anchorEl = ref<HTMLElement | null>(null);

const toggle = () => {
  open.value = !open.value;
};

// The anchor's own click toggles (a second trigger click closes); reka must not race it with an
// outside-dismiss on the same pointerdown.
const onPointerDownOutside = (event: Event): void => {
  if (anchorEl.value?.contains(event.target as Node)) {
    event.preventDefault();
  }
};

const onCloseAutoFocus = (event: Event): void => {
  // Focus returns to the trigger the way the hand-rolled version returned it to the
  // previously-focused element — there is no PopoverTrigger here for reka to restore to.
  event.preventDefault();

  const focusTarget = anchorEl.value?.querySelector<HTMLElement>("button") ?? anchorEl.value;

  focusTarget?.focus();
};
</script>

<template>
  <PopoverRoot :open="open" @update:open="open = $event">
    <PopoverAnchor as-child>
      <span
        ref="anchorEl"
        class="ledger-popover"
        :aria-expanded="open"
        aria-haspopup="dialog"
        :data-open="open || undefined"
        @click="toggle"
      >
        <slot :open="open" :toggle="toggle" />
      </span>
    </PopoverAnchor>

    <PopoverPortal>
      <PopoverContent
        class="ledger-popover-panel"
        :align="placement === 'bottom-end' ? 'end' : 'start'"
        side="bottom"
        :side-offset="6"
        :style="{
          width: panelWidth !== undefined ? `${panelWidth}px` : undefined,
          maxHeight: panelMaxHeight,
          ...panelStyle
        }"
        @pointer-down-outside="onPointerDownOutside"
        @close-auto-focus="onCloseAutoFocus"
      >
        <slot name="content" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
