<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { useCopy, useLang } from "../i18n";
import { demoSources, type SourceFile } from "../source";

/**
 * The "view source" drawer: the demo's own file plus one level of its local imports, tabs per
 * file, shiki-highlighted (lazy — the highlighter loads on the first open), line numbers, and a
 * copy button per tab. The Vue counterpart of the React edition's Drawer + CodeHighlightTabs.
 */
const props = defineProps<{
  demoId: string;
  opened: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const copy = {
  en: {
    title: "Source",
    close: "Close source",
    copy: "Copy",
    copied: "Copied"
  },
  zh: {
    title: "源码",
    close: "关闭源码",
    copy: "复制",
    copied: "已复制"
  }
};

const t = useCopy(copy);
const { lang } = useLang();

const files = computed<SourceFile[]>(() => demoSources(props.demoId));
const activeFile = ref(0);

// Landing mid-file after a switch is disorienting — every file starts from its top.
watch(files, () => (activeFile.value = 0));
watch(() => props.opened, opened => {
  if (opened) {
    activeFile.value = 0;
    void highlight(activeFile.value);
  }
});

watch(activeFile, index => void highlight(index));

const highlighted = ref<Record<number, string>>({});
let highlighterPromise: Promise<{
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
}> | null = null;

async function getHighlighter() {
  if (highlighterPromise === null) {
    // Lazy: the shiki bundle lands in an async chunk only the drawer can pull.
    highlighterPromise = import("shiki").then(shiki => shiki.createHighlighter({
      langs: ["vue", "typescript"],
      themes: ["github-light"]
    }));
  }

  return highlighterPromise;
}

async function highlight(index: number): Promise<void> {
  const file = files.value[index];

  if (!props.opened || file === undefined || highlighted.value[index] !== undefined) {
    return;
  }

  const highlighter = await getHighlighter();
  const html = highlighter.codeToHtml(file.code, {
    lang: file.fileName.endsWith(".vue") ? "vue" : "typescript",
    theme: "github-light"
  });

  highlighted.value = { ...highlighted.value, [index]: html };
}

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyActive(): Promise<void> {
  const file = files.value[activeFile.value];

  if (file === undefined) {
    return;
  }

  await navigator.clipboard.writeText(file.code);
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 1600);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pg-drawer">
      <div
        v-if="opened"
        class="pg-drawer-overlay"
        @click.self="emit('close')"
        @keydown.esc="emit('close')"
      >
        <aside class="pg-drawer" role="dialog" aria-modal="true" :aria-label="t.title">
          <header class="pg-drawer-header">
            <strong>{{ t.title }}</strong>
            <div class="pg-drawer-header-actions">
              <button
                v-if="files.length > 0"
                class="pg-drawer-copy"
                type="button"
                @click="copyActive"
              >
                {{ copied ? t.copied : t.copy }}
              </button>
              <button
                class="pg-drawer-close"
                type="button"
                :aria-label="t.close"
                @click="emit('close')"
              >
                <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </header>

          <nav v-if="files.length > 1" class="pg-drawer-tabs" role="tablist">
            <button
              v-for="(file, index) in files"
              :key="file.fileName"
              class="pg-drawer-tab"
              :data-active="index === activeFile || undefined"
              role="tab"
              type="button"
              :aria-selected="index === activeFile"
              @click="activeFile = index"
            >
              {{ file.fileName }}
            </button>
          </nav>

          <div class="pg-drawer-body">
            <div
              v-if="highlighted[activeFile]"
              class="pg-drawer-code"
              v-html="highlighted[activeFile]"
            />
            <pre v-else-if="files[activeFile]" class="pg-drawer-code-raw">{{ files[activeFile]?.code }}</pre>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pg-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgb(0 0 0 / 32%);
}

.pg-drawer {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  display: flex;
  flex-direction: column;
  width: min(60rem, 100vw);
  background: #fff;
  box-shadow: -4px 0 24px rgb(0 0 0 / 8%);
}

.pg-drawer-header {
  display: flex;
  flex: none;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #e9ecef;
}

.pg-drawer-header strong {
  font-size: 16px;
}

.pg-drawer-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.pg-drawer-copy,
.pg-drawer-close {
  padding: 5px 10px;
  font: inherit;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
  background: none;
  border: 1px solid #dee2e6;
  border-radius: 6px;
}

.pg-drawer-close {
  display: inline-flex;
  padding: 6px;
}

.pg-drawer-copy:hover,
.pg-drawer-close:hover {
  background: #f8f9fa;
}

.pg-drawer-tabs {
  display: flex;
  flex: none;
  gap: 2px;
  padding: 8px 18px 0;
  overflow-x: auto;
  border-bottom: 1px solid #e9ecef;
}

.pg-drawer-tab {
  padding: 7px 12px;
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: #495057;
  cursor: pointer;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
}

.pg-drawer-tab[data-active] {
  font-weight: 600;
  color: #1e1e1e;
  border-bottom-color: #228be6;
}

.pg-drawer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.pg-drawer-code :deep(pre) {
  margin: 0;
  padding: 14px 0;
  font-size: 12.5px;
  line-height: 1.55;
  counter-reset: line;
}

.pg-drawer-code :deep(code) {
  display: block;
  width: max-content;
  min-width: 100%;
  padding: 0 16px 0 52px;
}

.pg-drawer-code :deep(.line) {
  display: inline-block;
  width: 100%;
}

.pg-drawer-code :deep(.line::before) {
  position: absolute;
  left: -40px;
  width: 32px;
  font-variant-numeric: tabular-nums;
  color: #adb5bd;
  text-align: end;
  content: counter(line);
  counter-increment: line;
}

.pg-drawer-code-raw {
  margin: 0;
  padding: 14px 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.55;
}

/* Enter/leave — a slide from the inline-end edge. */
.pg-drawer-enter-active,
.pg-drawer-leave-active {
  transition: opacity 160ms ease;
}

.pg-drawer-enter-active .pg-drawer,
.pg-drawer-leave-active .pg-drawer {
  transition: translate 160ms ease;
}

.pg-drawer-enter-from,
.pg-drawer-leave-to {
  opacity: 0;
}

.pg-drawer-enter-from .pg-drawer,
.pg-drawer-leave-to .pg-drawer {
  translate: 100% 0;
}
</style>
