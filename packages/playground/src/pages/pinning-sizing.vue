<script setup lang="ts">
import { computed, ref } from "vue";

import {
  createColumnHelper,
  DataTableColumnsPanel,
  useDataTable
} from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.pinning-sizing.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  columns: "Columns",
  caption: "Pinned edges + the columns panel",
  size: "Size",
  striped: "Striped",
  hover: "Hover highlight",
  tableBorder: "Table border",
  columnBorders: "Column borders",
  note: "First and last name start pinned (defaultColumnPinning); the panel reorders, hides, pins, and sets widths; headers drag to reorder and resize from their right edge."
};
const zhCopy: typeof enCopy = {
  columns: "列设置",
  caption: "固定边缘 + 列设置面板",
  size: "尺寸",
  striped: "斑马纹",
  hover: "悬停高亮",
  tableBorder: "表格外框",
  columnBorders: "列边框",
  note: "姓名两列默认固定（defaultColumnPinning）；面板可拖拽排序、显隐、钉住与设宽；表头可拖动排序、拖动右缘调宽。"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const people = makePeople(80);

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("firstName", { header: "First name", size: 120 }),
  helper.accessor("lastName", { header: "Last name", size: 120 }),
  helper.accessor("email", { header: "Email", minSize: 200, meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 90, meta: { align: "end" } }),
  helper.accessor("city", { header: "City", size: 110 }),
  helper.accessor("department", { header: "Department", size: 140 }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  }),
  helper.accessor("rating", { header: "Rating", size: 90, meta: { align: "end" } })
];

/* The size scale is the table's own; the package does not export the `LedgerSize` alias (yet). */
const SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
type LedgerSize = (typeof SIZES)[number];
const size = ref<LedgerSize>("sm");
const striped = ref(true);
const hover = ref(true);
const tableBorder = ref(true);
const columnBorders = ref(false);

const table = useDataTable({
  data: people,
  columns,
  getRowId: person => person.id,
  enableColumnOrdering: true,
  enableColumnResizing: true,
  defaultColumnPinning: { start: ["firstName"], end: ["rating"] }
});
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-toolbar">
      <DataTableColumnsPanel :table="table as any">
        <button class="pg-mini-btn" type="button">{{ copy.columns }}</button>
      </DataTableColumnsPanel>

      <div class="pg-button-group" role="group" :aria-label="copy.size">
        <button
          v-for="candidate in SIZES"
          :key="candidate"
          class="pg-mini-btn pg-size-btn"
          :data-active="candidate === size || undefined"
          type="button"
          @click="size = candidate"
        >
          {{ candidate }}
        </button>
      </div>

      <label class="pg-toggle">
        <input v-model="striped" type="checkbox"> {{ copy.striped }}
      </label>
      <label class="pg-toggle">
        <input v-model="hover" type="checkbox"> {{ copy.hover }}
      </label>
      <label class="pg-toggle">
        <input v-model="tableBorder" type="checkbox"> {{ copy.tableBorder }}
      </label>
      <label class="pg-toggle">
        <input v-model="columnBorders" type="checkbox"> {{ copy.columnBorders }}
      </label>
    </div>

    <div class="pg-table-wrap">
      <DataTable
        :table="table"
        :size="size"
        :striped="striped"
        :highlight-on-hover="hover"
        :with-table-border="tableBorder"
        :with-column-borders="columnBorders"
        tabular-nums
      />
    </div>

    <p class="pg-note">{{ copy.note }}</p>
  </section>
</template>

<style>
.pg-button-group {
  display: flex;
  gap: 4px;
}

.pg-size-btn.pg-mini-btn[data-active] {
  color: var(--pg-accent);
  background: color-mix(in srgb, var(--pg-accent) 18%, transparent);
  border-color: var(--pg-accent);
}

.pg-toggle {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 12px;
  color: var(--pg-text);
  cursor: pointer;
  user-select: none;
}

.pg-mini-btn {
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--pg-text);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--pg-border);
  border-radius: 6px;
}

.pg-mini-btn:hover {
  background: rgb(127 127 127 / 12%);
}
</style>
