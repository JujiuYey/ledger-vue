<script setup lang="ts">
import type { ColumnDef, DataTableHandle } from "@jujiuyey/ledger-vue";

import { createColumnHelper, DataTable } from "@jujiuyey/ledger-vue";
import { computed, ref } from "vue";

import { useCopy, useLangLabels } from "../i18n";

/**
 * Column virtualization: a year of daily sales across 300 stores — 361 leaf columns, both axes
 * windowed. The month groups clamp to their rendered days as the window slides through them,
 * the pinned store column never leaves, and the month picker reaches an unrendered column
 * through `scrollToColumn`.
 */
const MONTH_DAYS = 30;
const STORE_COUNT = 300;

const copy = {
  en: {
    store: "Store",
    storeName: (index: number) => `Store ${String(index + 1).padStart(3, "0")}`,
    month: (month: number) => `M${month + 1}`,
    monthLong: (month: number) => `Month ${month + 1}`,
    day: (day: number) => `D${day + 1}`,
    jumpLabel: "Jump to month",
    matrix: (columns: string, rows: string) => `${columns} columns × ${rows} rows — only the visible window of each axis is in the DOM`
  },
  zh: {
    store: "门店",
    storeName: (index: number) => `门店 ${String(index + 1).padStart(3, "0")}`,
    month: (month: number) => `${month + 1} 月`,
    monthLong: (month: number) => `${month + 1} 月`,
    day: (day: number) => `${day + 1} 日`,
    jumpLabel: "跳转到月份",
    matrix: (columns: string, rows: string) => `${columns} 列 × ${rows} 行——两个轴都只有可见窗口在 DOM 里`
  }
};

interface Store {
  id: string;
  index: number;
}

const STORES: Store[] = Array.from({ length: STORE_COUNT }, (_, index) => {
  return {
    id: `store-${index + 1}`,
    index
  };
});

/* Deterministic figures — the demo re-renders identically in both languages. */
function salesOf(store: number, month: number, day: number) {
  return ((store * 31 + month * 97 + day * 13) % 900) + 100;
}

const helper = createColumnHelper<Store>();

const t = useCopy(copy);
const labels = useLangLabels();
// Templates unwrap refs in prop positions (`:handle-ref` would hand the table a bare null), so
// the imperative handle reaches the table through a template ref — the `defineExpose` shape.
const handle = ref<DataTableHandle<Store> | null>(null);
const month = ref<string | null>(null);

const columns = computed((): Array<ColumnDef<Store, any>> => [
  helper.accessor(store => t.value.storeName(store.index), {
    id: "store",
    header: t.value.store,
    size: 120
  }),
  ...Array.from({ length: 12 }, (_, monthIndex) => helper.group({
    id: `m${monthIndex}`,
    header: t.value.month(monthIndex),
    columns: helper.columns(Array.from({ length: MONTH_DAYS }, (_, dayIndex) => helper.accessor(
      store => salesOf(store.index, monthIndex, dayIndex),
      {
        id: `m${monthIndex}-d${dayIndex}`,
        header: t.value.day(dayIndex),
        size: 76,
        meta: { align: "end" as const }
      }
    )))
  }))
]);

const monthOptions = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    return {
      label: t.value.monthLong(index),
      value: String(index)
    };
  })
);

const jumpToMonth = (value: string | null) => {
  month.value = value;

  if (value !== null) {
    // An instant jump: a discrete leap renders its window synchronously, so the month is
    // there the moment it lands — smooth-scrolling twenty thousand pixels through windows
    // that render behind the animation is theater with a blank stage.
    handle.value?.scrollToColumn(`m${value}-d0`, { align: "start" });
  }
};

const onMonthChange = (event: Event) => {
  jumpToMonth((event.target as HTMLSelectElement).value || null);
};
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row">
      <select
        :aria-label="t.jumpLabel"
        :value="month ?? ''"
        style="width: 140px; padding: 4px 10px; font: inherit; font-size: 13px; color: inherit; background: var(--pg-panel); border: 1px solid var(--pg-border); border-radius: 6px"
        @change="onMonthChange"
      >
        <option value="">{{ t.jumpLabel }}</option>
        <option
          v-for="option in monthOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.matrix((12 * MONTH_DAYS + 1).toLocaleString(), STORE_COUNT.toLocaleString()) }}</span>
    </div>

    <DataTable
      ref="handle"
      :labels="labels"
      :columns="columns"
      :data="STORES"
      :default-column-pinning="{ end: [], start: ['store'] }"
      style="flex: 1; min-height: 0"
      tabular-nums
      virtualized-columns
      virtualized-rows
      :get-row-id="store => store.id"
    />
  </div>
</template>
