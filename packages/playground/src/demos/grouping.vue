<script setup lang="ts">
import type { ColumnDef, VueContent } from "@coldsmirk/ledger-vue";
import { createColumnHelper, DataTable, DataTableColumnsPanel, useDataTable } from "@coldsmirk/ledger-vue";
import { computed, h } from "vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    role: "Role (groupable from the panel)",
    name: "Name",
    status: "Status",
    balance: "Balance (summed per group)",
    columns: "Columns",
    hint: "Grouped by role to start with; the first two rows are pinned under the header (rowPinning). The grouping switch lives in the columns panel and only appears for columns that allow it."
  },
  zh: {
    role: "角色（列设置里可分组）",
    name: "姓名",
    status: "状态",
    balance: "余额（分组求和）",
    columns: "列设置",
    hint: "默认按角色分组；前两行被钉在表头下方（rowPinning）。分组开关在列设置面板里，只对可分组的列出现。"
  }
};

/* The status badge copy of the shared person columns (the React edition's columns.tsx), inlined
   so the demo reads on its own in the source drawer. */
const statusCopy = {
  en: {
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

/* Mantine's Badge palette (teal / blue / red), mapped onto the playground's plain-CSS colors. */
const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

const ts = useCopy(statusCopy);

function statusBadge(status: Person["status"]): VueContent {
  return h("span", { class: "pg-badge", "data-color": statusColor[status] }, ts.value.statuses[status]);
}

const helper = createColumnHelper<Person>();

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makePeople(lang.value, 60));

const columns = computed((): Array<ColumnDef<Person, any>> => [
  helper.accessor("role", { header: t.value.role, size: 240 }),
  helper.accessor("name", {
    header: t.value.name,
    size: 140,
    enableGrouping: false
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 120,
    enableGrouping: false,
    cell: context => statusBadge(context.getValue())
  }),
  helper.accessor("balance", {
    header: t.value.balance,
    size: 200,
    enableGrouping: false,
    aggregationFn: "sum",
    cell: context => context.getValue().toFixed(2),
    aggregatedCell: context =>
      h("span", { style: { fontWeight: 600 } }, `Σ ${Number(context.getValue()).toFixed(2)}`),
    meta: { align: "end" }
  })
]);

const table = useDataTable<Person>({
  data,
  columns,
  getRowId: person => person.id,
  enableGrouping: true,
  enableRowPinning: true,
  defaultExpanded: true,
  defaultGrouping: ["role"],
  defaultRowPinning: { top: ["p-1", "p-2"], bottom: [] }
});
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row" style="align-self: stretch; flex-wrap: nowrap; justify-content: space-between">
      <p style="flex: 1; margin: 0; font-size: 12px; color: var(--pg-dimmed)">{{ t.hint }}</p>

      <!-- The default slot IS the trigger: the panel opens from it in a popover. The anchor also
          toggles on unstopped clicks, so the handler stops propagation before toggling. -->
      <!-- as any: compounds type `table` as TableInstance<any> (known limitation) -->
        <DataTableColumnsPanel :key="lang" :table="table as any" :labels="labels">
        <template #default="{ toggle }">
          <button class="pg-button" type="button" @click.stop="toggle()">{{ t.columns }}</button>
        </template>
      </DataTableColumnsPanel>
    </div>

    <DataTable
      :table="table"
      :labels="labels"
      tabular-nums
      style="flex: 1; min-height: 0"
    />
  </div>
</template>
