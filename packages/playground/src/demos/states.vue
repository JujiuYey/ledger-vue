<script setup lang="ts">
import type { ColumnDef, VueContent } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref } from "vue";

import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

/**
 * Every non-happy state and its recovery affordance in one place. Retrying "repairs" the
 * scenario so the retry buttons demonstrate an actual round trip, not a dead control.
 */
type Scenario = "normal" | "loading" | "empty" | "no-results" | "error" | "load-more-error";

const copy = {
  en: {
    name: "Name",
    role: "Role",
    status: "Status",
    email: "Email",
    joinedAt: "Joined",
    scenario: "Scenario",
    scenarios: {
      normal: "Normal",
      loading: "Loading",
      empty: "No data",
      "no-results": "No results",
      error: "Load failed",
      "load-more-error": "Load-more failed"
    },
    keepStale: "Keep stale rows",
    keepStaleHint: "On failure the old rows stay under the scrim",
    customEmpty: "Custom empty state",
    customEmptyHint: "The empty state is a ReactNode, not a string",
    recovered: (count: number) => `${count} successful retries — both "Retry" buttons put the scenario back to normal`,
    noMatch: "a name that does not exist",
    emptyTitle: "No members yet",
    emptyBody: "Invite a colleague and they will show up here.",
    emptyAction: "Invite a member"
  },
  zh: {
    name: "姓名",
    role: "角色",
    status: "状态",
    email: "邮箱",
    joinedAt: "入职日期",
    scenario: "场景",
    scenarios: {
      normal: "正常",
      loading: "加载中",
      empty: "空数据",
      "no-results": "无匹配",
      error: "加载失败",
      "load-more-error": "加载更多失败"
    },
    keepStale: "保留旧数据",
    keepStaleHint: "失败时旧数据留在遮罩下",
    customEmpty: "自定义空态",
    customEmptyHint: "空态是一块 ReactNode，不是一串文案",
    recovered: (count: number) => `重试成功 ${count} 次 —— 两处「重试」都会把场景恢复为正常`,
    noMatch: "一个不存在的名字",
    emptyTitle: "还没有成员",
    emptyBody: "邀请同事加入后，他们会出现在这里。",
    emptyAction: "邀请成员"
  }
};

/* The status badge of the shared person-column set — the React edition keeps it in
   demos/columns.tsx; it is inlined here so this file reads on its own in the source drawer.
   The pg-badge palette has no teal swatch, so active takes green. */
const badgeCopy = {
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

const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

const SCENARIOS: Scenario[] = ["normal", "loading", "empty", "no-results", "error", "load-more-error"];

const helper = createColumnHelper<Person>();

const t = useCopy(copy);
const badgeT = useCopy(badgeCopy);
const { lang } = useLang();
const labels = useLangLabels();

const scenario = ref<Scenario>("normal");
const keepStale = ref(true);
const customEmpty = ref(false);
const recoveries = ref(0);

const data = computed(() => makePeople(lang.value, 12));

const columns = computed((): Array<ColumnDef<Person, any>> => [
  // Two grow columns rather than one: a lone grow column absorbs the entire surplus, which on
  // a wide page turns an e-mail cell into half the table.
  helper.accessor("name", {
    header: t.value.name,
    minSize: 110
  }),
  helper.accessor("role", {
    header: t.value.role,
    size: 140
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 110,
    cell: (context: { getValue: () => "active" | "invited" | "suspended" }) =>
      h(
        "span",
        { class: "pg-badge", "data-color": statusColor[context.getValue()] },
        badgeT.value.statuses[context.getValue()]
      )
  }),
  helper.accessor("email", {
    header: t.value.email,
    minSize: 200,
    meta: { truncate: true }
  }),
  helper.accessor("joinedAt", {
    header: t.value.joinedAt,
    size: 130
  })
]);

const recover = () => {
  recoveries.value += 1;
  scenario.value = "normal";
};

const shownData = computed(() =>
  scenario.value === "empty" || (scenario.value === "error" && !keepStale.value) ? [] : data.value
);

/* The custom empty state is a node, not a string — the React edition's Stack/Text/Button
   as h() calls. */
const customEmptyState = computed((): VueContent =>
  h("div", { class: "pg-stack", style: { alignItems: "center", padding: "48px 16px" } }, [
    h("div", { style: { fontWeight: 600 } }, t.value.emptyTitle),
    h("span", { style: { color: "var(--pg-dimmed)", fontSize: "13px" } }, t.value.emptyBody),
    h("button", { class: "pg-button", type: "button", onClick: recover }, t.value.emptyAction)
  ])
);
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row" style="gap: 16px">
      <div class="pg-seg" role="radiogroup" :aria-label="t.scenario">
        <button
          v-for="value in SCENARIOS"
          :key="value"
          type="button"
          :data-active="scenario === value || undefined"
          @click="scenario = value"
        >
          {{ t.scenarios[value] }}
        </button>
      </div>

      <label class="pg-switch">
        <input v-model="keepStale" type="checkbox">
        <span>{{ t.keepStale }} <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.keepStaleHint }}</span></span>
      </label>

      <label class="pg-switch">
        <input v-model="customEmpty" type="checkbox">
        <span>{{ t.customEmpty }} <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.customEmptyHint }}</span></span>
      </label>

      <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.recovered(recoveries) }}</span>
    </div>

    <DataTable
      :labels="labels"
      :columns="columns"
      :data="shownData"
      enable-global-filter
      style="flex: 1; min-height: 0"
      :get-row-id="person => person.id"
      :global-filter="scenario === 'no-results' ? t.noMatch : ''"
      :loading="scenario === 'loading'"
      :error="scenario === 'error'"
      :load-more-error="scenario === 'load-more-error'"
      :empty-state="customEmpty ? customEmptyState : undefined"
      :on-end-reached="scenario === 'load-more-error' ? recover : undefined"
      :on-retry="recover"
    />
  </div>
</template>
