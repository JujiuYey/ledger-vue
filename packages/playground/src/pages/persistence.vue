<script setup lang="ts">
import { computed, ref } from "vue";

import {
  createColumnHelper,
  DataTable,
  DataTableColumnsPanel,
  DataTableSearch,
  useDataTable
} from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.persistence.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  caption: "One table, persisted layout and query state",
  columns: "Columns",
  stored: "Stored under \"ledger:ledger-vue-playground:persistence\"",
  refresh: "Refresh",
  clear: "Clear and reload",
  empty: "nothing stored yet — change something above, wait a beat, then refresh here or reload the page.",
  columnsLabel: {
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    age: "Age",
    city: "City",
    department: "Department",
    salary: "Salary"
  }
};
const zhCopy: typeof enCopy = {
  caption: "同一张表：布局与查询状态都被持久化",
  columns: "列设置",
  stored: "存储键 \"ledger:ledger-vue-playground:persistence\"",
  refresh: "刷新",
  clear: "清除并重载",
  empty: "尚未存储——在上面对表格做些改动，稍候片刻，再点这里刷新或直接重载页面。",
  columnsLabel: {
    firstName: "名",
    lastName: "姓",
    email: "邮箱",
    age: "年龄",
    city: "城市",
    department: "部门",
    salary: "薪资"
  }
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const STORAGE_KEY = "ledger-vue-playground:persistence";

const people = makePeople(120);

const helper = createColumnHelper<Person>();

const cityOptions = [...new Set(people.map(person => person.city))].sort();

const columns = computed(() => [
  helper.accessor("firstName", { header: copy.value.columnsLabel.firstName, size: 120 }),
  helper.accessor("lastName", { header: copy.value.columnsLabel.lastName, size: 120 }),
  helper.accessor("email", { header: copy.value.columnsLabel.email, minSize: 200, meta: { truncate: true } }),
  helper.accessor("age", {
    header: copy.value.columnsLabel.age,
    size: 100,
    meta: { align: "end", filter: "range" as const }
  }),
  helper.accessor("city", {
    header: copy.value.columnsLabel.city,
    size: 120,
    meta: {
      filter: {
        variant: "select" as const,
        options: cityOptions
      }
    }
  }),
  helper.accessor("department", { header: copy.value.columnsLabel.department, size: 140 }),
  helper.accessor("salary", {
    header: copy.value.columnsLabel.salary,
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  })
]);

const table = useDataTable({
  data: people,
  columns,
  getRowId: person => person.id,
  enableGlobalFilter: true,
  enablePagination: true,
  defaultPagination: { pageIndex: 0, pageSize: 12 },
  persistState: {
    key: STORAGE_KEY,
    slices: [
      "sorting",
      "columnFilters",
      "globalFilter",
      "pagination",
      "columnVisibility",
      "columnPinning",
      "columnOrder"
    ]
  }
});

/* A small inspector for what actually reached localStorage (writes are debounced 250ms). */
const raw = ref<string | null>(localStorage.getItem(`ledger:${STORAGE_KEY}`));

const refresh = () => {
  raw.value = localStorage.getItem(`ledger:${STORAGE_KEY}`);
};

const clearAndReload = () => {
  localStorage.removeItem(`ledger:${STORAGE_KEY}`);
  window.location.reload();
};
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-toolbar">
      <!-- `as any`: the compounds type `table` as TableInstance<any>; v9's ColumnDef unions
           make the instance invariant, so a concrete one needs the cast. -->
      <DataTableSearch :table="table as any" :width="220" />
      <DataTableColumnsPanel :table="table as any">
        <button class="pg-mini-btn" type="button">{{ copy.columns }}</button>
      </DataTableColumnsPanel>
    </div>

    <div class="pg-table-wrap">
      <DataTable :table="table" with-table-border striped highlight-on-hover tabular-nums />
    </div>

    <p class="pg-note">{{ copy.stored }}</p>
    <p class="pg-output">{{ raw ?? copy.empty }}</p>

    <div class="pg-toolbar" style="margin-top: 10px">
      <button class="pg-mini-btn" type="button" @click="refresh">{{ copy.refresh }}</button>
      <button class="pg-mini-btn" type="button" @click="clearAndReload">{{ copy.clear }}</button>
    </div>

    <p class="pg-note">
      {{ lang === "en"
        ? "Persisted slices: sorting, columnFilters, globalFilter, pagination, columnVisibility, columnPinning, columnOrder. Hide or pin a column, sort, filter, search, change the page — then reload."
        : "持久化的切片：排序、列筛选、全局搜索、分页、列显隐、列固定、列顺序。隐藏或钉住列、排序、筛选、搜索、翻页——然后刷新页面。" }}
    </p>
  </section>
</template>

<style>
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
