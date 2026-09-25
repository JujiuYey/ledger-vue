<script setup lang="ts">
import type { ColumnDef, DataTableRowReorder } from "@coldsmirk/ledger-vue";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import { computed, ref } from "vue";

import { useCopy, useLangLabels } from "../i18n";

/**
 * Row ordering: the handle column lifts a row, the indicator shows where it lands, and
 * `onRowReorder` hands the application the `arrayMove` it applies to its own data — row order
 * IS data order. Sort any column to watch the handles disable (their tooltip says why), clear
 * the sort to get them back. The keyboard drives the same session: focus a handle, Space lifts,
 * ↑/↓ move, Home/End jump, Space drops, Escape cancels.
 */
const copy = {
  en: {
    step: "#",
    task: "Task",
    owner: "Owner",
    days: "Days",
    lastMove: "Last move:",
    noMove: "nothing yet",
    moved: (task: string, from: number, to: number) => `${task}: ${from + 1} → ${to + 1}`,
    hint: "Drag a handle (or focus it and press Space) to change the release order. Sorting or filtering disables the handles — the visible order stops being the data order.",
    tasks: [
      "Freeze the release branch",
      "Run the regression suite",
      "Update the changelog",
      "Build and sign the artifacts",
      "Publish to the registry",
      "Announce the release"
    ]
  },
  zh: {
    step: "#",
    task: "任务",
    owner: "负责人",
    days: "天数",
    lastMove: "最近一次移动：",
    noMove: "尚无移动",
    moved: (task: string, from: number, to: number) => `${task}：${from + 1} → ${to + 1}`,
    hint: "拖动把手（或聚焦后按 Space）调整发布顺序。排序或筛选会禁用把手——可见顺序不再是数据顺序。",
    tasks: [
      "冻结发布分支",
      "跑回归测试",
      "更新变更日志",
      "构建并签名产物",
      "发布到制品仓库",
      "发布公告"
    ]
  }
};

interface Step {
  id: string;
  /**
   * Index into the bilingual task list — the row text follows the language switch while the
   * array order stays the application's own.
   */
  taskIndex: number;
  owner: string;
  days: number;
}

const OWNERS = ["Ada", "Grace", "Linus", "Margaret", "Dennis", "Barbara"];

const INITIAL_STEPS: Step[] = copy.en.tasks.map((_, index) => {
  return {
    days: (index % 3) + 1,
    id: `step-${index + 1}`,
    owner: OWNERS[index % OWNERS.length]!,
    taskIndex: index
  };
});

const helper = createColumnHelper<Step>();

const t = useCopy(copy);
const labels = useLangLabels();

const steps = ref<Step[]>(INITIAL_STEPS);
const lastMove = ref<DataTableRowReorder<Step> | null>(null);

const columns = computed((): Array<ColumnDef<Step, any>> => [
  // Position is derived from the array, so it renews itself after every move.
  helper.display({
    id: "step",
    header: t.value.step,
    size: 48,
    meta: { align: "center", label: t.value.step },
    cell: ({ row }) => row.index + 1
  }),
  // A resolved accessor rather than a raw field: the translated text is what sorting
  // compares, what CSV exports, and what the reorder announcements name a row by.
  helper.accessor(step => t.value.tasks[step.taskIndex] ?? "", { id: "task", header: t.value.task }),
  helper.accessor("owner", { header: t.value.owner, size: 140 }),
  helper.accessor("days", {
    header: t.value.days,
    size: 90,
    meta: { align: "end" }
  })
]);

const handleRowReorder = (reorder: DataTableRowReorder<Step>) => {
  const next = [...steps.value];
  const [moved] = next.splice(reorder.fromIndex, 1);
  next.splice(reorder.toIndex, 0, moved!);

  steps.value = next;
  lastMove.value = reorder;
};
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <p style="margin: 0">
      {{ t.lastMove }}

      <code v-if="lastMove" class="pg-code">{{ t.moved(t.tasks[lastMove.row.original.taskIndex] ?? "", lastMove.fromIndex, lastMove.toIndex) }}</code>
      <span v-else style="color: var(--pg-dimmed)">{{ t.noMove }}</span>
    </p>

    <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.hint }}</span>

    <DataTable
      :labels="labels"
      :columns="columns"
      :data="steps"
      enable-row-ordering
      with-row-borders
      style="flex: 1; min-height: 0"
      :get-row-id="step => step.id"
      :on-row-reorder="handleRowReorder"
    />
  </div>
</template>
