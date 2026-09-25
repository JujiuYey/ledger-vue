<script setup lang="ts">
import type { ColumnDef, DataTableHandle } from "@coldsmirk/ledger-vue";

import type { LogEntry } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref, watch } from "vue";

import { makeLogs } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const PAGE = 10_000;
const TOTAL = 50_000;

const copy = {
  en: {
    time: "Time",
    level: "Level",
    actor: "Actor",
    action: "Action",
    target: "Target",
    ip: "Source IP",
    jumpLabel: "Jump to entry number",
    jump: "Jump and reveal",
    loaded: (loaded: string, total: string) => `${loaded} entries loaded — scrolling to the bottom appends more, up to ${total}`
  },
  zh: {
    time: "时间",
    level: "级别",
    actor: "操作人",
    action: "动作",
    target: "对象",
    ip: "来源 IP",
    jumpLabel: "跳转到第几条",
    jump: "跳转并定位",
    loaded: (loaded: string, total: string) => `已加载 ${loaded} 条日志（滚动到底部自动追加，上限 ${total} 条）`
  }
};

const levelColor: Record<LogEntry["level"], string> = {
  info: "blue",
  warn: "yellow",
  error: "red"
};

const helper = createColumnHelper<LogEntry>();

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

// The whole stream is generated once per language (unique ids); "loading more" reveals the
// next slice.
const all = computed(() => makeLogs(lang.value, TOTAL));
const visibleCount = ref(PAGE);
const loadingMore = ref(false);
const lineNumber = ref<number | string>(7500);
const activeRowId = ref<string | null>(null);
const pendingRowId = ref<string | null>(null);
// Templates unwrap refs in prop positions (`:handle-ref` would hand the table a bare null), so
// the imperative handle reaches the table through a template ref — the `defineExpose` shape.
const handle = ref<DataTableHandle<LogEntry> | null>(null);

const data = computed(() => all.value.slice(0, visibleCount.value));

const columns = computed((): Array<ColumnDef<LogEntry, any>> => [
  helper.accessor("time", {
    header: t.value.time,
    size: 170
  }),
  helper.accessor("level", {
    header: t.value.level,
    size: 90,
    cell: context => h("span", {
      class: "pg-badge",
      "data-color": levelColor[context.getValue()]
    }, context.getValue())
  }),
  helper.accessor("actor", {
    header: t.value.actor,
    size: 130
  }),
  helper.accessor("action", {
    header: t.value.action,
    size: 190
  }),
  helper.accessor("target", {
    header: t.value.target,
    minSize: 160
  }),
  helper.accessor("ip", {
    header: t.value.ip,
    size: 150
  })
]);

const loadMore = () => {
  if (loadingMore.value || visibleCount.value >= TOTAL) {
    return;
  }

  loadingMore.value = true;
  setTimeout(() => {
    visibleCount.value = Math.min(TOTAL, visibleCount.value + PAGE);
    loadingMore.value = false;
  }, 600);
};

const jumpToLine = () => {
  const index = Math.min(Math.max(Number(lineNumber.value) || 1, 1), TOTAL) - 1;
  const entry = all.value[index];

  if (!entry) {
    return;
  }

  // A row outside the loaded slice cannot be scrolled to yet — reveal enough of the stream
  // first and let the watcher below do the scrolling once the row actually exists.
  if (index >= visibleCount.value) {
    visibleCount.value = Math.min(TOTAL, (Math.floor(index / PAGE) + 1) * PAGE);
  }

  activeRowId.value = entry.id;
  pendingRowId.value = entry.id;
};

// `flush: "post"` is the React effect's timing: the scroll runs after the revealed rows are
// actually in the DOM.
watch([pendingRowId, data], () => {
  if (pendingRowId.value === null || data.value.every(entry => entry.id !== pendingRowId.value)) {
    return;
  }

  handle.value?.scrollToRow(pendingRowId.value, { align: "start" });
  pendingRowId.value = null;
}, { flush: "post" });
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row">
      <input
        v-model.number="lineNumber"
        :aria-label="t.jumpLabel"
        :max="TOTAL"
        :min="1"
        style="width: 120px; padding: 4px 10px; font: inherit; font-size: 13px; color: inherit; background: var(--pg-panel); border: 1px solid var(--pg-border); border-radius: 6px"
        type="number"
      >

      <button class="pg-button" type="button" @click="jumpToLine">{{ t.jump }}</button>

      <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.loaded(data.length.toLocaleString(), TOTAL.toLocaleString()) }}</span>
    </div>

    <DataTable
      ref="handle"
      v-model:active-row-id="activeRowId"
      :labels="labels"
      :columns="columns"
      :data="data"
      enable-active-row
      style="flex: 1; min-height: 0"
      tabular-nums
      virtualized-rows
      :get-row-id="entry => entry.id"
      :loading-more="loadingMore"
      :on-end-reached="loadMore"
    />
  </div>
</template>
