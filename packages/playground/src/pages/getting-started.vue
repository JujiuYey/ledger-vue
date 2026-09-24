<script setup lang="ts">
import { computed } from "vue";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.getting-started.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = { caption: "Sorted by salary out of the box (defaultSorting)" };
const zhCopy: typeof enCopy = { caption: "通过 defaultSorting 默认按薪资排序" };
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const people = makePeople(30);

const helper = createColumnHelper<Person>();

/* Raw TanStack column defs — sorting comes for free on every accessor column. */
const columns = [
  helper.accessor("firstName", { header: "First name" }),
  helper.accessor("lastName", { header: "Last name" }),
  helper.accessor("email", { header: "Email", minSize: 200, meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 90, meta: { align: "end" } }),
  helper.accessor("city", { header: "City", size: 120 }),
  helper.accessor("department", { header: "Department", size: 140 }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  })
];

const getRowId = (person: Person): string => person.id;
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-table-wrap">
      <DataTable
        :data="people"
        :columns="columns"
        :get-row-id="getRowId"
        :default-sorting="[{ id: 'salary', desc: true }]"
        with-table-border
        striped
        highlight-on-hover
        tabular-nums
      />
    </div>

    <p class="pg-note">
      {{ lang === "en"
        ? "One <DataTable> tag: presentation props (striped, borders, size) sit beside behavior options (defaultSorting, getRowId). The table fills this fixed-height wrapper and scrolls inside it."
        : "一个 <DataTable> 标签：外观属性（striped、边框、尺寸）与行为选项（defaultSorting、getRowId）并列。表格填满这个定高容器并在内部滚动。" }}
    </p>
  </section>
</template>
