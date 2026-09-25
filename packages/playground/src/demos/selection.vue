<script setup lang="ts">
import type { ColumnDef, RowSelectionState } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";

import { createColumnHelper, DataTable, DataTableSelectionBar, toCsv, useDataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref } from "vue";

import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    mode: "Selection mode",
    multiple: "Bulk actions (multi)",
    single: "Assign an owner (single)",
    exportCsv: "Export selected as CSV",
    owner: (name: string) => `Current owner: ${name}`,
    noOwner: "No owner assigned yet (suspended members cannot be picked)"
  },
  zh: {
    mode: "选择模式",
    multiple: "批量操作（多选）",
    single: "指派负责人（单选）",
    exportCsv: "导出所选为 CSV",
    owner: (name: string) => `当前负责人：${name}`,
    noOwner: "尚未指派负责人（已停用的成员不可选）"
  }
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

const data = computed(() => makePeople(lang.value, 200));

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
    cell: (context: { getValue: () => "active" | "invited" | "suspended" }) =>
      h("span", {
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

function downloadCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const multiple = ref(true);
const rowSelection = ref<RowSelectionState>({});

const table = useDataTable({
  data,
  columns,
  getRowId: person => person.id,
  enableRowSelection: row => row.original.status !== "suspended",
  // The core reads feature switches at mount, but the adapter keeps reactive option values in
  // sync (the same path data/columns/slices take) — so the mode ref rides through and flipping
  // the segmented control really flips the column. The cast: the option's boolean type is the
  // mount-time contract.
  enableMultiRowSelection: multiple as unknown as boolean,
  enablePagination: true,
  defaultPagination: {
    pageIndex: 0,
    pageSize: 20
  },
  rowSelection,
  onRowSelectionChange: value => {
    rowSelection.value = value;
  }
});

const setMode = (value: string) => {
  multiple.value = value === "multiple";
  // Carrying a five-row selection into single-select mode would leave five radios
  // checked at once — the mode change is a fresh question.
  rowSelection.value = {};
};

const exportSelected = () => {
  downloadCsv(toCsv(table, {
    escapeFormulas: true,
    scope: "selected"
  }), "selected.csv");
};

const ownerName = computed(() => {
  const owner = Object.keys(rowSelection.value)[0];

  return data.value.find(person => person.id === owner)?.name;
});
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-seg" role="radiogroup" :aria-label="t.mode" style="width: 280px">
      <button type="button" :data-active="multiple || undefined" @click="setMode('multiple')">
        {{ t.multiple }}
      </button>

      <button type="button" :data-active="!multiple || undefined" @click="setMode('single')">
        {{ t.single }}
      </button>
    </div>

    <!-- No theme defaultProps in the Vue edition: the compound takes the shell's `labels` too.
        The `as any`: TableInstance<Person> is not seen assignable to the compound's
        TableInstance<any> prop — a known variance limitation. -->
    <DataTableSelectionBar v-if="multiple" :labels="labels" :table="table as any">
      <button class="pg-button" type="button" @click="exportSelected">
        {{ t.exportCsv }}
      </button>
    </DataTableSelectionBar>

    <span
      v-else
      :style="{ color: ownerName ? undefined : 'var(--pg-dimmed)' }"
      style="font-size: 13px"
    >
      {{ ownerName ? t.owner(ownerName) : t.noOwner }}
    </span>

    <DataTable
      :labels="labels"
      :table="table"
      highlight-on-hover
      style="flex: 1; min-height: 0"
    />
  </div>
</template>
