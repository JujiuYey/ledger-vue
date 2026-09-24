<script setup lang="ts">
import { computed, ref, watch } from "vue";

import {
  createColumnHelper,
  DataTable,
  DataTablePagination,
  useDataTable
} from "@coldsmirk/ledger-vue";
import type { PaginationState, SortingState } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.pagination.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  clientCaption: "Client mode: the built-in pagination bar",
  standaloneCaption: "Standalone DataTablePagination (withPaginationBar off, the compound placed by the page)",
  serverCaption: "Server mode: paginationMode \"server\" + rowCount, one fetched slice at a time",
  pending: "Requesting…",
  result: (rows: number, requests: number) => `${rows} rows on page · ${requests} requests`,
  note: "Sorting is server-side too: change it and the page refetches. ledger resets pageIndex to 0 on a sorting change in server mode, so a page out of range cannot happen."
};
const zhCopy: typeof enCopy = {
  clientCaption: "客户端模式：内置分页栏",
  standaloneCaption: "独立 DataTablePagination（关闭 withPaginationBar，由页面自行摆放）",
  serverCaption: "服务端模式：paginationMode \"server\" + rowCount，每次取一页",
  pending: "请求中…",
  result: (rows, requests) => `本页 ${rows} 行 · 已请求 ${requests} 次`,
  note: "排序同样在服务端：改变排序会重新取数。服务端模式下 ledger 会在排序变化时把 pageIndex 重置为 0，页码不会越界。"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("firstName", { header: "First name", size: 120 }),
  helper.accessor("lastName", { header: "Last name", size: 120 }),
  helper.accessor("email", { header: "Email", minSize: 200, meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 90, meta: { align: "end" } }),
  helper.accessor("city", { header: "City", size: 110 }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  })
];

const getRowId = (person: Person): string => person.id;

/* ---- 1. client mode, built-in bar ---- */

const clientPeople = makePeople(64);

/* ---- 2. standalone bar ---- */

const standaloneTable = useDataTable({
  data: makePeople(64),
  columns,
  getRowId,
  enablePagination: true,
  defaultPagination: { pageIndex: 0, pageSize: 10 }
});

/* ---- 3. server mode ---- */

const dataset = makePeople(500);

async function fetchPage(sorting: SortingState, pageIndex: number, pageSize: number): Promise<{ rows: Person[]; total: number }> {
  await new Promise(resolve => {
    setTimeout(resolve, 350);
  });

  const sorted = sorting.length === 0
    ? dataset
    : [...dataset].sort((left, right) => {
        for (const rule of sorting) {
          const a = left[rule.id as keyof Person];
          const b = right[rule.id as keyof Person];
          const result = typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b));

          if (result !== 0) {
            return rule.desc ? -result : result;
          }
        }

        return 0;
      });

  const start = pageIndex * pageSize;

  return { rows: sorted.slice(start, start + pageSize), total: sorted.length };
}

const sorting = ref<SortingState>([{ id: "lastName", desc: false }]);
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 10 });
const rows = ref<Person[]>([]);
const total = ref(dataset.length);
const loading = ref(true);
const requests = ref(0);

let requestSeq = 0;

const load = async () => {
  const token = requestSeq + 1;
  requestSeq = token;
  loading.value = true;

  const result = await fetchPage(sorting.value, pagination.value.pageIndex, pagination.value.pageSize);

  // The guard is the point: rapid sorting clicks race, and the last request must win.
  if (token !== requestSeq) {
    return;
  }

  rows.value = result.rows;
  total.value = result.total;
  loading.value = false;
  requests.value += 1;
};

watch([sorting, pagination], load, { immediate: true });

const serverTable = useDataTable({
  data: () => rows.value,
  columns,
  getRowId,
  sortingMode: "server",
  paginationMode: "server",
  // The whole data set holds 500 people; the table only ever holds the current page.
  rowCount: dataset.length,
  enablePagination: true,
  sorting,
  onSortingChange: value => {
    sorting.value = value;
  },
  pagination,
  onPaginationChange: value => {
    pagination.value = value;
  }
});

const queryLine = computed(() => {
  const sort = sorting.value.map(rule => `${rule.id}:${rule.desc ? "desc" : "asc"}`).join(",");

  return `GET /api/people?page=${pagination.value.pageIndex + 1}&size=${pagination.value.pageSize}${sort === "" ? "" : `&sort=${sort}`}`;
});
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.clientCaption }}</p>

    <div class="pg-table-wrap">
      <DataTable
        :data="clientPeople"
        :columns="columns"
        :get-row-id="getRowId"
        :default-pagination="{ pageIndex: 0, pageSize: 10 }"
        :page-size-options="[5, 10, 20]"
        enable-pagination
        with-table-border
        striped
        highlight-on-hover
        tabular-nums
      />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.standaloneCaption }}</p>

    <div class="pg-table-wrap">
      <DataTable :table="standaloneTable" :with-pagination-bar="false" with-table-border highlight-on-hover />
    </div>

    <div style="margin-top: 10px">
      <DataTablePagination :table="standaloneTable as any" />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.serverCaption }}</p>

    <div class="pg-toolbar">
      <span class="pg-note" style="margin: 0">
        <template v-if="loading">{{ copy.pending }}</template>
        <template v-else>{{ copy.result(rows.length, requests) }}</template>
      </span>
    </div>

    <p class="pg-output">{{ queryLine }}</p>

    <div class="pg-table-wrap">
      <DataTable :table="serverTable" :loading="loading" with-table-border striped highlight-on-hover tabular-nums />
    </div>

    <p class="pg-note">{{ copy.note }}</p>
  </section>
</template>
