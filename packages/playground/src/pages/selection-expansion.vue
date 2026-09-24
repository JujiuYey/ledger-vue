<script setup lang="ts">
import { computed, h, ref } from "vue";

import {
  createColumnHelper,
  DataTable,
  DataTableSelectionBar,
  useDataTable
} from "@coldsmirk/ledger-vue";
import type { Row, RowSelectionState, VueContent } from "@coldsmirk/ledger-vue";

import type { Person, TreeNode } from "../data";
import { makePeople, makeTree } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.selection-expansion.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  multiCaption: "Multi-select with a selection bar (inactive members are not selectable)",
  singleCaption: "Single select — the checkboxes become a radio group",
  owner: (name: string) => `Current owner: ${name}`,
  noOwner: "No owner assigned yet (inactive members cannot be picked)",
  archive: "Archive selected",
  archived: (count: number) => `Archived ${count} row${count === 1 ? "" : "s"} (selection cleared)`,
  nothingArchived: "Select rows, then archive them here.",
  treeCaption: "Tree data: getSubRows + the injected expander column (the header expands everything)",
  detailCaption: "Master-detail: renderDetailPanel turns the expanded area into a detail panel",
  personColumns: {
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    age: "Age",
    city: "City",
    department: "Department",
    salary: "Salary"
  },
  treeColumns: {
    name: "Name",
    kind: "Kind",
    size: "Size"
  },
  detail: {
    email: "Email",
    city: "City",
    department: "Department",
    salary: "Salary",
    hiredAt: "Hired",
    rating: "Rating"
  }
};
const zhCopy: typeof enCopy = {
  multiCaption: "多选 + 选择栏（未激活成员不可选）",
  singleCaption: "单选——复选框变成单选组",
  owner: name => `当前负责人：${name}`,
  noOwner: "尚未指派负责人（未激活成员不可选）",
  archive: "归档所选",
  archived: count => `已归档 ${count} 行（清空选择）`,
  nothingArchived: "勾选行后在这里归档。",
  treeCaption: "树形数据：getSubRows + 注入的展开列（表头可展开全部）",
  detailCaption: "主从视图：renderDetailPanel 把展开区变成详情面板",
  personColumns: {
    firstName: "名",
    lastName: "姓",
    email: "邮箱",
    age: "年龄",
    city: "城市",
    department: "部门",
    salary: "薪资"
  },
  treeColumns: {
    name: "名称",
    kind: "类型",
    size: "大小"
  },
  detail: {
    email: "邮箱",
    city: "城市",
    department: "部门",
    salary: "薪资",
    hiredAt: "入职日期",
    rating: "评分"
  }
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const helper = createColumnHelper<Person>();

const personColumns = [
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

/* ---- 1. multi-select with the selection bar ---- */

const roster = makePeople(87);
const lastAction = ref<string | null>(null);

const selectionTable = useDataTable({
  data: roster,
  columns: personColumns,
  getRowId: person => person.id,
  enableRowSelection: row => row.original.active,
  enablePagination: true,
  defaultPagination: { pageIndex: 0, pageSize: 12 }
});

const archiveSelected = () => {
  const count = Object.values(selectionTable.atoms.rowSelection.get()).filter(Boolean).length;

  if (count === 0) {
    return;
  }

  lastAction.value = copy.value.archived(count);
  selectionTable.resetRowSelection();
};

/* ---- 2. single select ---- */

const candidates = makePeople(24).map((person, index) => ({ ...person, id: `c-${index + 1}` }));
const rowSelection = ref<RowSelectionState>({});

const owner = computed(() => {
  const id = Object.keys(rowSelection.value).find(key => rowSelection.value[key]);

  return id === undefined ? null : candidates.find(person => person.id === id) ?? null;
});

const isSelectable = (row: Row<Person>): boolean => row.original.active;

/* ---- 3. tree data ---- */

const tree = makeTree();

const treeHelper = createColumnHelper<TreeNode>();

const treeColumns = computed(() => [
  treeHelper.accessor("name", { header: copy.value.treeColumns.name, minSize: 200 }),
  treeHelper.accessor("kind", { header: copy.value.treeColumns.kind, size: 100 }),
  treeHelper.accessor("size", {
    header: copy.value.treeColumns.size,
    size: 120,
    cell: info => info.getValue<number>().toLocaleString("en-US"),
    meta: { align: "end" }
  })
]);

/* ---- 4. master-detail ---- */

const details = makePeople(40);

const renderDetail = (row: Row<Person>): VueContent =>
  h("div", { class: "pg-detail" }, [
    h("span", null, [`${copy.value.detail.email}: `, h("strong", null, row.original.email)]),
    h("span", null, [`${copy.value.detail.city}: `, h("strong", null, row.original.city)]),
    h("span", null, [`${copy.value.detail.department}: `, h("strong", null, row.original.department)]),
    h("span", null, [`${copy.value.detail.salary}: `, h("strong", null, row.original.salary.toLocaleString("en-US"))]),
    h("span", null, [`${copy.value.detail.hiredAt}: `, h("strong", null, row.original.hiredAt)]),
    h("span", null, [`${copy.value.detail.rating}: `, h("strong", null, row.original.rating.toFixed(1))])
  ]);
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.multiCaption }}</p>

    <div class="pg-toolbar">
      <DataTableSelectionBar :table="selectionTable as any">
        <button class="pg-accent-btn" type="button" @click="archiveSelected">{{ copy.archive }}</button>
      </DataTableSelectionBar>
      <span v-if="lastAction" class="pg-note" style="margin: 0">{{ lastAction }}</span>
      <span v-else class="pg-note" style="margin: 0">{{ copy.nothingArchived }}</span>
    </div>

    <div class="pg-table-wrap">
      <DataTable :table="selectionTable" with-table-border highlight-on-hover />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.singleCaption }}</p>

    <div class="pg-toolbar">
      <span class="pg-note" style="margin: 0">
        <template v-if="owner">{{ copy.owner(`${owner.firstName} ${owner.lastName}`) }}</template>
        <template v-else>{{ copy.noOwner }}</template>
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable
        v-model:row-selection="rowSelection"
        :data="candidates"
        :columns="personColumns"
        :get-row-id="person => person.id"
        :enable-row-selection="isSelectable"
        :enable-multi-row-selection="false"
        :default-pagination="{ pageIndex: 0, pageSize: 12 }"
        enable-pagination
        with-table-border
        highlight-on-hover
      />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.treeCaption }}</p>

    <div class="pg-table-wrap">
      <DataTable
        :data="tree"
        :columns="treeColumns"
        :get-row-id="node => node.id"
        :get-sub-rows="node => node.children"
        :default-expanded="{ src: true }"
        with-table-border
        tabular-nums
      />
    </div>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.detailCaption }}</p>

    <div class="pg-table-wrap">
      <DataTable
        :data="details"
        :columns="personColumns"
        :get-row-id="person => person.id"
        :render-detail-panel="renderDetail"
        with-table-border
        highlight-on-hover
        tabular-nums
      />
    </div>
  </section>
</template>

<style>
/* Rendered through cell renderers, so the rules cannot be scoped to the page component. */
.pg-detail {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--pg-dimmed);
}

.pg-detail strong {
  font-weight: 600;
  color: var(--pg-text);
}

.pg-accent-btn {
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--pg-text);
  cursor: pointer;
  background: color-mix(in srgb, var(--pg-accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--pg-accent) 40%, transparent);
  border-radius: 6px;
}

.pg-accent-btn:hover {
  background: color-mix(in srgb, var(--pg-accent) 24%, transparent);
}
</style>
