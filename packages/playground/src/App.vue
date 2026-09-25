<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from "vue";

import "@coldsmirk/ledger-vue/styles.css";

import "./app.css";

import { provideLanguage, useCopy, useLang, type Copy, type Lang } from "./i18n";
import SourceDrawer from "./source-drawer.vue";

// The shell owns the language (App.vue ≈ the React edition's App.tsx + LanguageProvider in one).
provideLanguage();

const en = {
  shell: {
    title: "ledger playground",
    language: "Language",
    toggleNavigation: "Toggle navigation",
    viewSource: "View source"
  },
  groups: {
    start: "Getting started",
    business: "Business data",
    hierarchy: "Hierarchy and reports",
    scale: "Scale and wide tables",
    integration: "Integration"
  },
  demos: {
    basic: {
      label: "Basic table",
      description: "A staff roster: column defs plus data, sorting and hover, an email column that comes and goes with the breakpoint"
    },
    appearance: {
      label: "Borders and density",
      description: "A price list: three border shapes, stripes, density, loading and empty"
    },
    states: {
      label: "States and recovery",
      description: "Loading, empty, no results, failure with retry, and a failed load-more"
    },
    orders: {
      label: "Order desk",
      description: "Five column filters, pagination, a totals row, the active row and its keyboard"
    },
    selection: {
      label: "Bulk actions",
      description: "Multi-select, Shift ranges, the selection bar, CSV export"
    },
    editing: {
      label: "Cell editing",
      description: "Stock count: four editors, validation, async commits"
    },
    "row-editing": {
      label: "Row editing",
      description: "Employee records: the whole row opens, commits atomically, driven from an actions column"
    },
    "row-ordering": {
      label: "Row ordering",
      description: "A release checklist: drag the handle or lift with Space, sorting disables the handles"
    },
    "master-detail": {
      label: "Master–detail",
      description: "Expand an order to read its line items"
    },
    tree: {
      label: "Tree data",
      description: "Revenue by region: indented sub-rows and expand-all"
    },
    "menu-tree": {
      label: "Menu administration",
      description: "A tree in a real screen: many columns, a pinned tree column, horizontal scrolling"
    },
    spanning: {
      label: "Spanning cells",
      description: "A revenue report: equal neighbours merge down, the totals row merges across"
    },
    "grouped-headers": {
      label: "Grouped headers",
      description: "Quarterly store report: header groups, a footer row, DOM props on header and footer cells"
    },
    pinning: {
      label: "Columns, pinning, widths",
      description: "A wide table: the columns panel, a persisted layout, double-click a column edge to fit"
    },
    grouping: {
      label: "Grouping and pinned rows",
      description: "Sales grouped by role, aggregated sums, rows pinned to the top"
    },
    virtualized: {
      label: "Virtual scrolling",
      description: "An audit log: fifty thousand rows with infinite loading"
    },
    "column-virtualization": {
      label: "Column virtualization",
      description: "A year of daily sales: 361 columns windowed on both axes, month groups clamping as you scroll"
    },
    "server-side": {
      label: "Server-side data",
      description: "Sorting, filtering and pagination all belong to the backend; the table holds one page"
    },
    "hook-toolbar": {
      label: "Hook mode toolbar",
      description: "useDataTable plus the compound components, assembled by hand"
    }
  }
};

type AppCopy = typeof en;

type DemoId = keyof AppCopy["demos"];
type GroupId = keyof AppCopy["groups"];

const copy: Copy<AppCopy> = {
  en,
  zh: {
    shell: {
      title: "ledger playground",
      language: "语言",
      toggleNavigation: "切换导航",
      viewSource: "查看源码"
    },
    groups: {
      start: "入门",
      business: "业务数据",
      hierarchy: "层级与报表",
      scale: "大规模与宽表",
      integration: "集成与定制"
    },
    demos: {
      basic: {
        label: "基础表格",
        description: "员工名册：列定义 + 数据，排序与悬停，邮箱列随断点显隐"
      },
      appearance: {
        label: "外观与边框",
        description: "价目表：三种边框形态、斑马纹、密度、加载与空态"
      },
      states: {
        label: "状态与恢复",
        description: "加载、空态、无匹配、失败重试、加载更多失败"
      },
      orders: {
        label: "订单中心",
        description: "五种列筛选、分页、合计行、活动行与键盘导航"
      },
      selection: {
        label: "批量操作",
        description: "多选、Shift 范围、批量栏、CSV 导出"
      },
      editing: {
        label: "单元格编辑",
        description: "库存盘点：四种编辑器、校验、异步提交"
      },
      "row-editing": {
        label: "整行编辑",
        description: "员工档案：整行打开、原子提交、操作列驱动"
      },
      "row-ordering": {
        label: "行拖拽排序",
        description: "发布清单：拖把手或 Space 拿起调整顺序，排序时把手禁用"
      },
      "master-detail": {
        label: "主从明细",
        description: "订单行展开查看商品明细"
      },
      tree: {
        label: "树形数据",
        description: "区域营收：子行缩进 + 展开全部"
      },
      "menu-tree": {
        label: "菜单管理",
        description: "树形业务示例：多列、钉住树列、横向滚动"
      },
      spanning: {
        label: "合并单元格",
        description: "营收报表：相邻同值纵向合并 + 总计行横向合并"
      },
      "grouped-headers": {
        label: "多级表头",
        description: "门店季度报表：分组表头 + 合计行 + 表头/合计单元格 DOM 属性"
      },
      pinning: {
        label: "列设置 / 钉列 / 列宽",
        description: "宽表：列设置面板、布局持久化、双击列缝自适应列宽"
      },
      grouping: {
        label: "分组聚合 + 钉行",
        description: "销售业绩按角色分组、聚合求和、置顶行"
      },
      virtualized: {
        label: "虚拟滚动",
        description: "操作日志：五万条 + 无限加载"
      },
      "column-virtualization": {
        label: "列虚拟化",
        description: "全年每日销售：361 列双轴虚拟化，月份分组随滚动钳制"
      },
      "server-side": {
        label: "服务端数据",
        description: "排序 / 筛选 / 分页全部交给后端，表格只持有当前一页"
      },
      "hook-toolbar": {
        label: "Hook 模式工具栏",
        description: "useDataTable + 复合组件自由组合"
      }
    }
  }
};

const t = useCopy(copy);
const { lang, setLang } = useLang();

/* Simple → complex: plain rendering, then data browsing, then structure, then scale. */
interface DemoGroup {
  id: GroupId;
  demos: DemoId[];
}

const GROUPS: DemoGroup[] = [
  {
    id: "start",
    demos: ["basic", "appearance", "states"]
  },
  {
    id: "business",
    demos: ["orders", "selection", "editing", "row-editing", "row-ordering", "master-detail"]
  },
  {
    id: "hierarchy",
    demos: ["tree", "menu-tree", "spanning", "grouped-headers"]
  },
  {
    id: "scale",
    demos: ["pinning", "grouping", "virtualized", "column-virtualization"]
  },
  {
    id: "integration",
    demos: ["server-side", "hook-toolbar"]
  }
];

const DEMO_COMPONENTS: Record<DemoId, ReturnType<typeof defineAsyncComponent>> = {
  basic: defineAsyncComponent(() => import("./demos/basic.vue")),
  appearance: defineAsyncComponent(() => import("./demos/appearance.vue")),
  states: defineAsyncComponent(() => import("./demos/states.vue")),
  orders: defineAsyncComponent(() => import("./demos/orders.vue")),
  selection: defineAsyncComponent(() => import("./demos/selection.vue")),
  editing: defineAsyncComponent(() => import("./demos/editing.vue")),
  "row-editing": defineAsyncComponent(() => import("./demos/row-editing.vue")),
  "row-ordering": defineAsyncComponent(() => import("./demos/row-ordering.vue")),
  "master-detail": defineAsyncComponent(() => import("./demos/master-detail.vue")),
  tree: defineAsyncComponent(() => import("./demos/tree.vue")),
  "menu-tree": defineAsyncComponent(() => import("./demos/menu-tree.vue")),
  spanning: defineAsyncComponent(() => import("./demos/spanning.vue")),
  "grouped-headers": defineAsyncComponent(() => import("./demos/grouped-headers.vue")),
  pinning: defineAsyncComponent(() => import("./demos/pinning.vue")),
  grouping: defineAsyncComponent(() => import("./demos/grouping.vue")),
  virtualized: defineAsyncComponent(() => import("./demos/virtualized.vue")),
  "column-virtualization": defineAsyncComponent(() => import("./demos/column-virtualization.vue")),
  "server-side": defineAsyncComponent(() => import("./demos/server-side.vue")),
  "hook-toolbar": defineAsyncComponent(() => import("./demos/hook-toolbar.vue"))
};

const activeId = ref<DemoId>("basic");
const mobileNavOpened = ref(false);
const sourceOpened = ref(false);

const activeCopy = computed(() => t.value.demos[activeId.value]);
const activeComponent = computed(() => DEMO_COMPONENTS[activeId.value]);

function selectDemo(id: DemoId): void {
  activeId.value = id;
  mobileNavOpened.value = false;
}
</script>

<template>
  <div class="pg-app">
    <header class="pg-header">
      <button
        class="pg-burger"
        :aria-expanded="mobileNavOpened"
        aria-controls="playground-navigation"
        :aria-label="t.shell.toggleNavigation"
        type="button"
        @click="mobileNavOpened = !mobileNavOpened"
      >
        <svg aria-hidden="true" fill="none" height="16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="16">
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      <strong class="pg-title">{{ t.shell.title }}</strong>

      <!-- SegmentedControl counterpart: a radiogroup of two radio inputs. -->
      <div class="pg-lang" role="radiogroup" :aria-label="t.shell.language">
        <label v-for="option in [{ value: 'en', label: 'EN' }, { value: 'zh', label: '中文' }] as const" :key="option.value" class="pg-lang-option">
          <input v-model="lang" class="pg-lang-input" name="playground-language" type="radio" :value="option.value as Lang" @change="setLang(option.value as Lang)">
          <span class="pg-lang-label">{{ option.label }}</span>
        </label>
      </div>
    </header>

    <div class="pg-body">
      <nav
        id="playground-navigation"
        class="pg-nav"
        :data-open="mobileNavOpened || undefined"
      >
        <div v-for="group in GROUPS" :key="group.id" class="pg-nav-group">
          <div class="pg-nav-caption">{{ t.groups[group.id] }}</div>

          <button
            v-for="demo in group.demos"
            :key="demo"
            class="pg-nav-item"
            :aria-current="demo === activeId ? 'page' : undefined"
            :data-active="demo === activeId || undefined"
            type="button"
            @click="selectDemo(demo)"
          >
            <span class="pg-nav-label">{{ t.demos[demo].label }}</span>
            <span class="pg-nav-description">{{ t.demos[demo].description }}</span>
          </button>
        </div>
      </nav>

      <!-- A definite height caps the page: every demo scrolls inside its own table. -->
      <main class="pg-main">
        <div class="pg-demo-head">
          <div class="pg-demo-copy">
            <h2 class="pg-demo-title">{{ activeCopy.label }}</h2>
            <p class="pg-demo-description">{{ activeCopy.description }}</p>
          </div>

          <button class="pg-source-button" type="button" @click="sourceOpened = true">
            {{ t.shell.viewSource }}
          </button>
        </div>

        <component :is="activeComponent" class="pg-demo" />
      </main>
    </div>

    <SourceDrawer :demo-id="activeId" :opened="sourceOpened" @close="sourceOpened = false" />
  </div>
</template>
