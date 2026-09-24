import { computed, ref } from "vue";

/**
 * Bilingual copy for the playground chrome and demo pages (the original playground's
 * i18n.tsx pattern, Vue edition): one flat dictionary per locale, `lang` is the single source
 * of truth, `t` resolves through it.
 */
export type Lang = "en" | "zhCN";

export const lang = ref<Lang>("en");

export const t = computed(() => (key: string): string => {
  return COPY[lang.value][key] ?? COPY.en[key] ?? key;
});

type Copy = Record<string, string>;

const COPY: Record<Lang, Copy> = {
  en: {
    "nav.title": "ledger-vue",
    "nav.subtitle": "A Vue-native DataTable on TanStack Table + TanStack Virtual",
    "nav.pages": "Pages",
    "chrome.language": "中文",
    "chrome.dark": "Dark",
    "chrome.light": "Light",

    "page.getting-started.title": "Getting started",
    "page.sorting-filtering.title": "Sorting & filtering",
    "page.selection-expansion.title": "Selection & expansion",
    "page.pinning-sizing.title": "Pinning & sizing",
    "page.pagination.title": "Pagination",
    "page.virtualization.title": "Virtualization",
    "page.editing.title": "Inline editing",
    "page.row-ordering.title": "Row ordering",
    "page.csv-export.title": "CSV export",
    "page.persistence.title": "Persistence"
  },
  zhCN: {
    "nav.title": "ledger-vue",
    "nav.subtitle": "基于 TanStack Table + TanStack Virtual 的 Vue 原生数据表格",
    "nav.pages": "页面",
    "chrome.language": "English",
    "chrome.dark": "深色",
    "chrome.light": "浅色",

    "page.getting-started.title": "快速上手",
    "page.sorting-filtering.title": "排序与筛选",
    "page.selection-expansion.title": "选择与展开",
    "page.pinning-sizing.title": "固定与尺寸",
    "page.pagination.title": "分页",
    "page.virtualization.title": "虚拟滚动",
    "page.editing.title": "行内编辑",
    "page.row-ordering.title": "行排序拖拽",
    "page.csv-export.title": "CSV 导出",
    "page.persistence.title": "状态持久化"
  }
};
