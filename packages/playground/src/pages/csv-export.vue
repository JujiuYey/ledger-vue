<script setup lang="ts">
import { computed, ref } from "vue";

// `toCsv` ships in the library source but is not exported from the package index yet, so the
// playground reaches it by path. Once it is re-exported, import it from "@coldsmirk/ledger-vue".
import { toCsv } from "../../../vue/src/csv";

import {
  createColumnHelper,
  DataTable,
  DataTableSearch,
  useDataTable
} from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.csv-export.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  caption: "Four scopes over the live table instance",
  scopes: {
    filtered: "Filtered",
    all: "All",
    page: "Page",
    selected: "Selected"
  },
  download: "Download .csv",
  summary: (lines: number, chars: number) => `${lines} lines · ${chars} characters`,
  note: "Email is excluded through meta.export: false; salary exports under a different header through meta.export: { header }. The scope reads the row models the screen shows — search to shrink \"filtered\", paginate to shrink \"page\", tick rows for \"selected\"."
};
const zhCopy: typeof enCopy = {
  caption: "作用于表格实例的四种导出范围",
  scopes: {
    filtered: "筛选后",
    all: "全部",
    page: "当前页",
    selected: "已选"
  },
  download: "下载 .csv",
  summary: (lines, chars) => `${lines} 行 · ${chars} 字符`,
  note: "Email 经 meta.export: false 被排除；salary 经 meta.export: { header } 改写导出表头。导出范围读取屏幕所见的行模型——搜索缩小 \"filtered\"，翻页缩小 \"page\"，勾选行得到 \"selected\"。"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const people = makePeople(60);

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("firstName", { header: "First name" }),
  helper.accessor("lastName", { header: "Last name" }),
  helper.accessor("email", {
    header: "Email",
    minSize: 200,
    meta: {
      truncate: true,
      export: false
    }
  }),
  helper.accessor("city", { header: "City", size: 110 }),
  helper.accessor("department", { header: "Department", size: 130 }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    meta: {
      align: "end",
      export: { header: "Annual salary" }
    }
  }),
  helper.accessor("active", { header: "Active", size: 90 })
];

const table = useDataTable({
  data: people,
  columns,
  getRowId: person => person.id,
  enableGlobalFilter: true,
  enableRowSelection: true,
  enablePagination: true,
  defaultPagination: { pageIndex: 0, pageSize: 15 }
});

type CsvScope = "filtered" | "all" | "page" | "selected";
const SCOPES: CsvScope[] = ["filtered", "all", "page", "selected"];

const currentScope = ref<CsvScope>("filtered");
const csv = ref("");

const exportScope = (scope: CsvScope) => {
  currentScope.value = scope;
  csv.value = toCsv(table, { scope });
};

const lineCount = computed(() => (csv.value === "" ? 0 : csv.value.split("\r\n").length));

const download = () => {
  if (csv.value === "") {
    return;
  }

  const url = URL.createObjectURL(new Blob([csv.value], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = `people-${currentScope.value}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-toolbar">
      <DataTableSearch :table="table as any" :width="220" />
      <button
        v-for="scope in SCOPES"
        :key="scope"
        class="pg-mini-btn"
        :data-active="scope === currentScope || undefined"
        type="button"
        @click="exportScope(scope)"
      >
        {{ copy.scopes[scope] }}
      </button>
      <button class="pg-mini-btn" type="button" :disabled="csv === ''" @click="download">
        {{ copy.download }}
      </button>
      <span v-if="csv !== ''" class="pg-note" style="margin: 0">
        {{ copy.summary(lineCount, csv.length) }}
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable :table="table" with-table-border striped highlight-on-hover tabular-nums />
    </div>

    <p class="pg-output">{{ csv === "" ? "→ " + copy.scopes[currentScope] : csv }}</p>

    <p class="pg-note">{{ copy.note }}</p>
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

.pg-mini-btn[data-active] {
  color: var(--pg-accent);
  background: color-mix(in srgb, var(--pg-accent) 18%, transparent);
  border-color: var(--pg-accent);
}

.pg-mini-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
