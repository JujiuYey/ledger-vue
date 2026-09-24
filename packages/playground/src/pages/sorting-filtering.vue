<script setup lang="ts">
import { computed, ref } from "vue";

import {
  DataTable,
  DataTableSearch,
  createColumnHelper,
  useDataTable
} from "@coldsmirk/ledger-vue";
import type { ColumnFiltersState, SortingState } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.sorting-filtering.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  sorting: "Sorting",
  none: "none",
  filterHint: (count: number) => `${count} column filter${count === 1 ? "" : "s"} active`,
  caption: "All five filter variants, one per column"
};
const zhCopy: typeof enCopy = {
  sorting: "排序",
  none: "无",
  filterHint: count => `${count} 个列筛选生效`,
  caption: "五种筛选变体，每列一种"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const people = makePeople(200);

const helper = createColumnHelper<Person>();

const cityOptions = [...new Set(people.map(person => person.city))].sort();
const departmentOptions = [
  { value: "engineering", label: "Engineering" },
  { value: "design", label: "Design" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" }
];

const columns = [
  helper.accessor("firstName", {
    header: "First name",
    size: 130,
    meta: { filter: "text" }
  }),
  helper.accessor("lastName", {
    header: "Last name",
    size: 130,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: "Email",
    minSize: 200,
    meta: { truncate: true }
  }),
  helper.accessor("city", {
    header: "City",
    size: 120,
    meta: {
      filter: {
        variant: "select",
        options: cityOptions
      }
    }
  }),
  helper.accessor("department", {
    header: "Department",
    size: 140,
    meta: {
      filter: {
        variant: "multi-select",
        options: departmentOptions
      }
    }
  }),
  helper.accessor("age", {
    header: "Age",
    size: 100,
    meta: {
      align: "end",
      filter: "range"
    }
  }),
  helper.accessor("salary", {
    header: "Salary",
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: {
      align: "end",
      filter: "range"
    }
  }),
  helper.accessor("hiredAt", {
    header: "Hired",
    size: 140,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
];

/* Controlled sorting so the current rules can be read back under the table. */
const sorting = ref<SortingState>([{ id: "hiredAt", desc: true }]);
const columnFilters = ref<ColumnFiltersState>([]);

/*
 * A custom global filter fn, registered under an id: it searches the person fields that
 * matter instead of every leaf column. `tableOptions.globalFilterFn` accepts any string so
 * the registered id stays usable without a cast.
 */
const table = useDataTable({
  data: people,
  columns,
  getRowId: person => person.id,
  enableGlobalFilter: true,
  sorting,
  onSortingChange: value => {
    sorting.value = value;
  },
  columnFilters,
  onColumnFiltersChange: value => {
    columnFilters.value = value;
  },
  filterFns: {
    "person-everywhere": (row, _columnId, value) => {
      const term = String(value).trim().toLowerCase();

      if (term === "") {
        return true;
      }

      const person = row.original as Person;

      return [person.firstName, person.lastName, person.email, person.city]
        .some(field => field.toLowerCase().includes(term));
    }
  },
  tableOptions: { globalFilterFn: "person-everywhere" }
});
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-toolbar">
      <!-- The compounds type `table` as TableInstance<any>; v9's ColumnDef unions make the
           instance invariant, so a concrete one needs the cast until the props turn generic. -->
      <DataTableSearch :table="table as any" :width="260" />
      <span class="pg-note" style="margin: 0">
        {{ copy.sorting }}:
        <strong v-if="sorting.length > 0">{{ sorting.map(rule => `${rule.id} ${rule.desc ? "desc" : "asc"}`).join(", ") }}</strong>
        <template v-else>{{ copy.none }}</template>
        <template v-if="columnFilters.length > 0"> · {{ copy.filterHint(columnFilters.length) }}</template>
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable :table="table" with-table-border striped highlight-on-hover tabular-nums />
    </div>

    <p class="pg-note">
      {{ lang === "en"
        ? "The custom search matches names, email, and city only — the built-in global filter would probe every column's value. Shift-click a second header to append a sort rule; click a third time to clear."
        : "自定义搜索只匹配姓名、邮箱与城市——内置全局筛选会探测每一列的值。Shift 点击第二个表头追加排序规则；第三次点击清除。" }}
    </p>
  </section>
</template>
