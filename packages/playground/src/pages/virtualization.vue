<script setup lang="ts">
import { computed, ref } from "vue";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.virtualization.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  rowsCaption: "10,000 rows, one window (virtualizedRows)",
  endlessCaption: "Infinite loading: onEndReached + loadingMore + endReachedOffset",
  endlessNote: (loaded: number, total: number) => `${loaded.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} rows loaded — scrolling near the bottom appends more.`,
  columnsCaption: "80 columns, windowed on both axes (virtualizedColumns)",
  columnsNote: (rows: number, columns: number) => `${columns} columns × ${rows} rows — only the visible window of each axis is in the DOM; the name column stays pinned.`,
  heightNote: "The body scroller is the only elastic region: give the table (or an ancestor) a definite height — these wrappers are fixed — or the dev warning about an unconstrained viewport fires."
};
const zhCopy: typeof enCopy = {
  rowsCaption: "1 万行，只渲染一个窗口（virtualizedRows）",
  endlessCaption: "无限加载：onEndReached + loadingMore + endReachedOffset",
  endlessNote: (loaded, total) => `已加载 ${loaded.toLocaleString("en-US")} / ${total.toLocaleString("en-US")} 行——滚动接近底部会追加更多。`,
  columnsCaption: "80 列，双轴开窗（virtualizedColumns）",
  columnsNote: (rows, columns) => `${columns} 列 × ${rows} 行——两个轴都只有可见窗口在 DOM 里；名称列保持固定。`,
  heightNote: "内部滚动区是唯一的弹性区域：给表格（或其祖先）一个确定高度——本页容器都是定高的——否则会触发视口未约束的开发警告。"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const helper = createColumnHelper<Person>();

const personColumns = [
  helper.accessor("firstName", { header: "First name", size: 120 }),
  helper.accessor("lastName", { header: "Last name", size: 120 }),
  helper.accessor("email", { header: "Email", minSize: 200, meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 90, meta: { align: "end" } }),
  helper.accessor("city", { header: "City", size: 110 }),
  helper.accessor("department", { header: "Department", size: 130 }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  })
];

const getRowId = (person: Person): string => person.id;

/* ---- 1. a big flat list ---- */

const everyone = makePeople(10_000);

/* ---- 2. infinite loading ---- */

const PAGE = 1_500;
const TOTAL = everyone.length;
const visibleCount = ref(PAGE);
const loadingMore = ref(false);

const visibleRows = computed(() => everyone.slice(0, visibleCount.value));

const loadMore = () => {
  if (loadingMore.value || visibleCount.value >= TOTAL) {
    return;
  }

  loadingMore.value = true;
  setTimeout(() => {
    visibleCount.value = Math.min(TOTAL, visibleCount.value + PAGE);
    loadingMore.value = false;
  }, 600);
};

/* ---- 3. many columns ---- */

interface Sample {
  id: string;
  name: string;
  cells: number[];
}

const SAMPLE_COLUMNS = 80;
const SAMPLE_ROWS = 40;

const samples: Sample[] = Array.from({ length: SAMPLE_ROWS }, (_unused, row) => ({
  id: `s-${row + 1}`,
  name: `Row ${row + 1}`,
  cells: Array.from({ length: SAMPLE_COLUMNS }, (_unused, column) => (row * 31 + column * 17) % 97)
}));

const sampleHelper = createColumnHelper<Sample>();

const sampleColumns = [
  sampleHelper.accessor("name", { header: "Name", size: 130 }),
  ...Array.from({ length: SAMPLE_COLUMNS }, (_unused, index) =>
    sampleHelper.accessor(row => row.cells[index] ?? 0, {
      id: `c${index}`,
      header: `C${index}`,
      size: 90,
      meta: { align: "end" }
    }))
];
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.rowsCaption }}</p>

    <div class="pg-table-wrap tall">
      <DataTable
        :data="everyone"
        :columns="personColumns"
        :get-row-id="getRowId"
        virtualized-rows
        with-table-border
        striped
        highlight-on-hover
        tabular-nums
      />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.endlessCaption }}</p>

    <div class="pg-table-wrap tall">
      <DataTable
        :data="visibleRows"
        :columns="personColumns"
        :get-row-id="getRowId"
        :loading-more="loadingMore"
        :end-reached-offset="200"
        :on-end-reached="loadMore"
        virtualized-rows
        with-table-border
        striped
        highlight-on-hover
        tabular-nums
      />
    </div>

    <p class="pg-note">{{ copy.endlessNote(visibleCount, TOTAL) }}</p>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.columnsCaption }}</p>

    <div class="pg-table-wrap tall">
      <DataTable
        :data="samples"
        :columns="sampleColumns"
        :get-row-id="sample => sample.id"
        :default-column-pinning="{ start: ['name'], end: [] }"
        virtualized-rows
        virtualized-columns
        with-table-border
        tabular-nums
      />
    </div>

    <p class="pg-note">{{ copy.columnsNote(SAMPLE_ROWS, SAMPLE_COLUMNS) }}</p>
    <p class="pg-note">{{ copy.heightNote }}</p>
  </section>
</template>
