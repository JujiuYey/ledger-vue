<script setup lang="ts">
import { computed, ref } from "vue";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import type { DataTableRowReorder, SortingState } from "@coldsmirk/ledger-vue";

import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.row-ordering.hint-${lang.value === "en" ? "en" : "zh"}`));

interface Step {
  id: string;
  taskIndex: number;
  owner: string;
  days: number;
}

const enCopy = {
  caption: "Release checklist — drag a handle (or focus it and press Space)",
  columns: { step: "#", task: "Task", owner: "Owner", days: "Days" },
  sort: "Sort by days",
  clearSort: "Clear sort",
  sortedNote: "Sorted — the handles are disabled until the visible order is the data order again.",
  lastMove: "Last move",
  noMove: "nothing yet",
  moved: (task: string, from: number, to: number) => `${task}: ${from + 1} → ${to + 1}`,
  tasks: [
    "Freeze the release branch",
    "Run the regression suite",
    "Update the changelog",
    "Build and sign the artifacts",
    "Publish to the registry",
    "Announce the release"
  ]
};
const zhCopy: typeof enCopy = {
  caption: "发布清单——拖动把手（或聚焦后按空格）",
  columns: { step: "#", task: "任务", owner: "负责人", days: "天数" },
  sort: "按天数排序",
  clearSort: "清除排序",
  sortedNote: "已排序——可见顺序回到数据顺序之前，把手处于禁用状态。",
  lastMove: "最近一次移动",
  noMove: "尚无移动",
  moved: (task, from, to) => `${task}：${from + 1} → ${to + 1}`,
  tasks: [
    "冻结发布分支",
    "跑回归测试",
    "更新变更日志",
    "构建并签名产物",
    "发布到制品仓库",
    "发布公告"
  ]
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const OWNERS = ["Ada", "Grace", "Linus", "Margaret", "Dennis", "Barbara"];

const steps = ref<Step[]>(enCopy.tasks.map((_unused, index) => ({
  days: (index % 3) + 1,
  id: `step-${index + 1}`,
  owner: OWNERS[index % OWNERS.length]!,
  taskIndex: index
})));

const taskLabel = (step: Step): string => copy.value.tasks[step.taskIndex] ?? "";

const sorting = ref<SortingState>([]);
const lastMove = ref<DataTableRowReorder<Step> | null>(null);

/* Columns recompute on language change only — the identity stays stable otherwise. */
const helper = createColumnHelper<Step>();

const columns = computed(() => [
  helper.display({
    id: "step",
    header: copy.value.columns.step,
    size: 56,
    meta: { align: "center" },
    cell: ({ row }) => row.index + 1
  }),
  helper.accessor(step => taskLabel(step), { id: "task", header: copy.value.columns.task }),
  helper.accessor("owner", { header: copy.value.columns.owner, size: 140 }),
  helper.accessor("days", {
    header: copy.value.columns.days,
    size: 100,
    meta: { align: "end" }
  })
]);

const handleRowReorder = (reorder: DataTableRowReorder<Step>) => {
  // Row order IS data order: apply the arrayMove to the local array.
  const next = [...steps.value];
  const [moved] = next.splice(reorder.fromIndex, 1);
  next.splice(reorder.toIndex, 0, moved!);
  steps.value = next;

  lastMove.value = reorder;
};

const toggleSort = () => {
  sorting.value = sorting.value.length === 0
    ? [{ id: "days", desc: true }]
    : [];
};
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.caption }}</p>

    <div class="pg-toolbar">
      <button class="pg-mini-btn" type="button" @click="toggleSort">
        {{ sorting.length === 0 ? copy.sort : copy.clearSort }}
      </button>
      <span class="pg-note" style="margin: 0">
        {{ copy.lastMove }}:
        <strong v-if="lastMove">{{ copy.moved(taskLabel(lastMove.row.original), lastMove.fromIndex, lastMove.toIndex) }}</strong>
        <template v-else>{{ copy.noMove }}</template>
      </span>
      <span v-if="sorting.length > 0" class="pg-note" style="margin: 0; color: var(--pg-accent)">
        {{ copy.sortedNote }}
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable
        v-model:sorting="sorting"
        :data="steps"
        :columns="columns"
        :get-row-id="step => step.id"
        :on-row-reorder="handleRowReorder"
        enable-row-ordering
        with-table-border
        with-row-borders
      />
    </div>

    <p class="pg-note">
      {{ lang === "en"
        ? "Keyboard: focus a handle, Space lifts, ↑/↓ move, Home/End jump, Space drops, Escape cancels. Filtering or searching would disable the handles the same way sorting does."
        : "键盘操作：聚焦把手后按 Space 提起、↑/↓ 移动、Home/End 跳转、Space 放下、Escape 取消。筛选或搜索同样会禁用把手。" }}
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
