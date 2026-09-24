<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";

import "@coldsmirk/ledger-vue/styles.css";

import { lang, t } from "./i18n";

/**
 * One page per feature area; pages are lazy so the shell mounts before every demo compiles.
 */
const PAGES = [
  { id: "getting-started", component: defineAsyncComponent(() => import("./pages/getting-started.vue")) },
  { id: "sorting-filtering", component: defineAsyncComponent(() => import("./pages/sorting-filtering.vue")) },
  { id: "selection-expansion", component: defineAsyncComponent(() => import("./pages/selection-expansion.vue")) },
  { id: "pinning-sizing", component: defineAsyncComponent(() => import("./pages/pinning-sizing.vue")) },
  { id: "pagination", component: defineAsyncComponent(() => import("./pages/pagination.vue")) },
  { id: "virtualization", component: defineAsyncComponent(() => import("./pages/virtualization.vue")) },
  { id: "editing", component: defineAsyncComponent(() => import("./pages/editing.vue")) },
  { id: "row-ordering", component: defineAsyncComponent(() => import("./pages/row-ordering.vue")) },
  { id: "csv-export", component: defineAsyncComponent(() => import("./pages/csv-export.vue")) },
  { id: "persistence", component: defineAsyncComponent(() => import("./pages/persistence.vue")) }
] as const;

const activeId = ref<string>("getting-started");
const themeOverride = ref<"light" | "dark" | null>(null);

const activePage = computed(() => PAGES.find(page => page.id === activeId.value) ?? PAGES[0]!);

function toggleTheme(): void {
  themeOverride.value
    = themeOverride.value === "dark"
      ? "light"
      : themeOverride.value === "light"
        ? null
        : "dark";

  if (themeOverride.value === null) {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = themeOverride.value;
  }
}
</script>

<template>
  <div class="pg-shell">
    <aside class="pg-sidebar">
      <div class="pg-brand">
        <h1 class="pg-brand-title">{{ t("nav.title") }}</h1>
        <p class="pg-brand-subtitle">{{ t("nav.subtitle") }}</p>
      </div>

      <nav class="pg-nav" aria-label="Pages">
        <button
          v-for="page in PAGES"
          :key="page.id"
          class="pg-nav-item"
          :data-active="page.id === activeId || undefined"
          type="button"
          @click="activeId = page.id"
        >
          {{ t(`page.${page.id}.title`) }}
        </button>
      </nav>

      <div class="pg-chrome">
        <button type="button" @click="lang = lang === 'en' ? 'zhCN' : 'en'">
          {{ t("chrome.language") }}
        </button>
        <button type="button" @click="toggleTheme">
          {{ themeOverride === "dark" ? t("chrome.light") : t("chrome.dark") }}
        </button>
      </div>
    </aside>

    <main class="pg-main">
      <div class="pg-page">
        <h2 class="pg-page-title">{{ t(`page.${activePage.id}.title`) }}</h2>
        <component :is="activePage.component" />
      </div>
    </main>
  </div>
</template>
