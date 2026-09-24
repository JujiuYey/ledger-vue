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
    "page.persistence.title": "Persistence",

    "page.getting-started.hint-en": "The smallest useful table: pass data and columns, get sorting, adaptive sizing, and an internal scroller. Click a header to sort it.",
    "page.sorting-filtering.hint-en": "Hook mode: useDataTable plus a toolbar. Hover a header for its filter — all five variants are here (text, select, multi-select, range, date-range). Shift-click headers to sort by several columns; the search box runs a custom global filter registered through filterFns.",
    "page.selection-expansion.hint-en": "Checkbox selection (multi with a selection bar, gated single pick), tree data through getSubRows with the injected expander column, and a detail panel under each row.",
    "page.pinning-sizing.hint-en": "Columns pinned to both edges, the columns panel (drag to reorder, hide, pin, set a width), the five sizes, and the striped / hover / border presentation toggles.",
    "page.pagination.hint-en": "Client pagination with the built-in bar, the standalone DataTablePagination compound, and a server-mode page that fetches one slice at a time from a fake API.",
    "page.virtualization.hint-en": "10,000 rows and 80 columns with both axes virtualized — only the visible window is in the DOM. Scrolling to the bottom loads more; give the table a definite height or the dev warning fires.",
    "page.editing.hint-en": "Cell mode (double-click or click to open, Tab between cells, validation, an instant checkbox) and row mode (the whole row opens and commits atomically) — commits land back in local data.",
    "page.row-ordering.hint-en": "Drag a handle (or focus it and press Space) to reorder — row order is data order, so onRowReorder hands you the arrayMove. Sort a column and the handles disable until the data owns the order again.",
    "page.csv-export.hint-en": "toCsv runs over the live table instance: four scopes (filtered / all / page / selected) and meta.export excluding a column or overriding its header. Search or select rows, then export.",
    "page.persistence.hint-en": "persistState writes sorting, filters, search, pagination, and the column layout to localStorage under a playground key — change something, then reload the page to see it restored."
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
    "page.persistence.title": "状态持久化",

    "page.getting-started.hint-zh": "最小可用的表格：传入 data 与 columns，即获得排序、自适应尺寸与内部滚动。点击表头即可排序。",
    "page.sorting-filtering.hint-zh": "组合式模式：useDataTable 加工具栏。悬停表头打开筛选（五种变体齐全：文本、单选、多选、区间、日期区间）；Shift 点击表头可多列排序；搜索框走的是经 filterFns 注册的自定义全局筛选函数。",
    "page.selection-expansion.hint-zh": "复选选择（多选带选择栏、单选带门槛）、经 getSubRows 的树形数据与注入的展开列，以及每行下方的详情面板。",
    "page.pinning-sizing.hint-zh": "两侧固定列、列设置面板（拖拽排序、显隐、钉住、设宽）、五种尺寸，以及斑马纹 / 悬停 / 边框等外观开关。",
    "page.pagination.hint-zh": "内置分页栏的客户端分页、独立的 DataTablePagination 组件，以及每次从模拟接口取一页的服务端分页。",
    "page.virtualization.hint-zh": "1 万行 × 80 列双轴虚拟滚动——DOM 里只有可见窗口。滚动到底部会加载更多；不给表格确定高度会触发开发警告。",
    "page.editing.hint-zh": "单元格模式（双击或单击进入，Tab 切换，校验拦截，即时提交的复选框）与整行模式（整行打开、原子提交）——提交结果写回本地数据。",
    "page.row-ordering.hint-zh": "拖动把手（或聚焦后按空格）调整行序——行序即数据顺序，onRowReorder 交给你一次 arrayMove。排序后把手禁用，清除排序后恢复。",
    "page.csv-export.hint-zh": "toCsv 直接作用于表格实例：四种范围（filtered / all / page / selected），meta.export 可排除列或改写表头。先搜索或勾选行，再导出。",
    "page.persistence.hint-zh": "persistState 将排序、筛选、搜索、分页与列布局写入 localStorage（playground 专用键）——改动后刷新页面即可看到恢复。"
  }
};
