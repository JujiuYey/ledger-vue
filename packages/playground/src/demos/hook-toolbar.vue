<script setup lang="ts">
import type { ColumnDef } from "@jujiuyey/ledger-vue";

import type { Person } from "../data";

import { createColumnHelper, DataTable, DataTableColumnsPanel, DataTablePagination, DataTableSearch, useDataTable } from "@jujiuyey/ledger-vue";
import { computed, h } from "vue";

import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: { columns: "Columns" },
  zh: { columns: "列设置" }
};

/* The shared person-column set — the React edition keeps it (with StatusBadge) in
   demos/columns.tsx; it is inlined here so this file reads on its own in the source drawer.
   The pg-badge palette has no teal swatch, so active takes green. */
const columnsCopy = {
  en: {
    name: "Name",
    email: "Email",
    role: "Role",
    status: "Status",
    age: "Age",
    balance: "Balance",
    joinedAt: "Joined",
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    name: "姓名",
    email: "邮箱",
    role: "角色",
    status: "状态",
    age: "年龄",
    balance: "余额",
    joinedAt: "入职日期",
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

const helper = createColumnHelper<Person>();

const t = useCopy(copy);
const columnT = useCopy(columnsCopy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makePeople(lang.value, 120));

const columns = computed((): Array<ColumnDef<Person, any>> => [
  helper.accessor("name", {
    header: columnT.value.name,
    size: 120,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: columnT.value.email,
    meta: { truncate: true, filter: "text" }
  }),
  helper.accessor("role", {
    header: columnT.value.role,
    size: 130,
    meta: { filter: "select" }
  }),
  helper.accessor("status", {
    header: columnT.value.status,
    size: 110,
    cell: (context: { getValue: () => "active" | "invited" | "suspended" }) => h("span", {
      class: "pg-badge",
      "data-color": statusColor[context.getValue()]
    }, columnT.value.statuses[context.getValue()]),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(columnT.value.statuses).map(([value, label]) => {
          return { value, label };
        })
      },
      // The CSV should carry the human label the Badge shows, not the enum value.
      export: { value: row => columnT.value.statuses[row.original.status] }
    }
  }),
  helper.accessor("age", {
    header: columnT.value.age,
    size: 90,
    meta: { align: "end", filter: "range" }
  }),
  helper.accessor("balance", {
    header: columnT.value.balance,
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("joinedAt", {
    header: columnT.value.joinedAt,
    size: 140,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
]);

const table = useDataTable({
  data,
  columns,
  getRowId: person => person.id,
  enableGlobalFilter: true,
  enablePagination: true,
  defaultPagination: { pageIndex: 0, pageSize: 15 }
});
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row" style="align-self: stretch; justify-content: space-between">
      <!-- No theme defaultProps in the Vue edition: every table and compound takes the shell's
          `labels` from useLangLabels(). -->
      <DataTableSearch :labels="labels" :table="table as any" :width="260" />

      <!-- The default slot IS the trigger — the panel never assumes what opens it. -->
      <DataTableColumnsPanel :labels="labels" :table="table as any">
        <button class="pg-button" type="button">{{ t.columns }}</button>
      </DataTableColumnsPanel>
    </div>

    <DataTable
      :labels="labels"
      :table="table as any"
      striped
      style="flex: 1; min-height: 0"
      :with-pagination-bar="false"
    />

    <DataTablePagination :labels="labels" :table="table as any" />
  </div>
</template>
