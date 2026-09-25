<script setup lang="ts">
import type { ColumnDef, VueContent } from "@coldsmirk/ledger-vue";
import { createColumnHelper, DataTable, DataTableColumnsPanel, useDataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref } from "vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    statusCopy: "Status (copy)",
    actions: "Actions",
    columns: "Columns",
    barePanel: "The bare panel in a drawer",
    hint: "The ⚙ in the last header opens the columns panel: drag to reorder, tick to show or hide, pin to either side, type a width (clear it to go back to auto), reset. Header cells themselves also drag to reorder and resize from their right edge (double-click to fit). The layout is written to localStorage and survives a reload."
  },
  zh: {
    statusCopy: "状态（副本列）",
    actions: "操作",
    columns: "列设置",
    barePanel: "抽屉里的裸面板",
    hint: "表头右上角 ⚙ 打开列设置：拖拽改序、勾选显隐、三态钉列、填宽度（清空即回自适应）、重置。列头本身也能拖着重排、拖右缘改宽（双击复位）。布局写入 localStorage，刷新后保留。"
  }
};

/* The shared person column set (the React edition's columns.tsx), inlined so the demo reads on
   its own in the source drawer. */
const personCopy = {
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

/* Mantine's Badge palette (teal / blue / red), mapped onto the playground's plain-CSS colors. */
const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

function statusBadge(status: Person["status"]): VueContent {
  return h("span", { class: "pg-badge", "data-color": statusColor[status] }, tp.value.statuses[status]);
}

const helper = createColumnHelper<Person>();

// The panel ships no trigger of its own, so the demo brings the gear: Lucide's `settings`
// glyph, vendored verbatim (lucide-static v1.34.0, ISC) — the same source and stroke language
// as the library's built-in icons.
function cogIcon(): VueContent {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      fill: "none",
      height: 16,
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      viewBox: "0 0 24 24",
      width: 16
    },
    [
      h("path", {
        d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
      }),
      h("circle", { cx: "12", cy: "12", r: "3" })
    ]
  );
}

const t = useCopy(copy);
const tp = useCopy(personCopy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makePeople(lang.value, 80));

const personColumns = computed((): Array<ColumnDef<Person, any>> => [
  helper.accessor("name", {
    header: tp.value.name,
    size: 120,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: tp.value.email,
    meta: { truncate: true, filter: "text" }
  }),
  helper.accessor("role", {
    header: tp.value.role,
    size: 130,
    meta: { filter: "select" }
  }),
  helper.accessor("status", {
    header: tp.value.status,
    size: 110,
    cell: context => statusBadge(context.getValue()),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(tp.value.statuses).map(([value, label]) => {
          return { value, label };
        })
      },
      // The CSV should carry the human label the Badge shows, not the enum value.
      export: { value: row => tp.value.statuses[row.original.status] }
    }
  }),
  helper.accessor("age", {
    header: tp.value.age,
    size: 90,
    meta: { align: "end", filter: "range" }
  }),
  helper.accessor("balance", {
    header: tp.value.balance,
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("joinedAt", {
    header: tp.value.joinedAt,
    size: 140,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
]);

const columns = computed((): Array<ColumnDef<Person, any>> => [
  ...personColumns.value,
  helper.accessor("status", {
    id: "status-copy",
    header: t.value.statusCopy,
    size: 150,
    cell: context => statusBadge(context.getValue())
  }),
  helper.display({
    id: "actions",
    size: 92,
    enableHiding: false,
    // The header below is a render function, so plain-text surfaces (the columns panel) read
    // the column's name from meta.label instead of falling back to the raw id.
    meta: { label: t.value.actions },
    // A display column can never sort, so its header renders as a plain box — the one place a
    // trigger can live, since a sortable header IS a button and would end up nesting one. The
    // cell needs room for the title AND the cog: the label scaffolding clips its content.
    header: ({ table }) =>
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: "2px",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "nowrap"
          }
        },
        [
          t.value.actions,

          h(
            DataTableColumnsPanel,
            {
              // Remount on a language flip: the panel resolves its labels once at setup.
              key: lang.value,
              table,
              labels: labels.value
            },
            {
              // The scoped trigger hands over `toggle`; the popover anchor also toggles on
              // unstopped clicks, so the handler stops propagation before toggling.
              default: ({ toggle }: { toggle: () => void }) =>
                h(
                  "button",
                  {
                    type: "button",
                    "aria-label": t.value.columns,
                    style: {
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "22px",
                      height: "22px",
                      padding: "0",
                      color: "var(--pg-dimmed)",
                      cursor: "pointer",
                      background: "none",
                      border: "0",
                      borderRadius: "4px"
                    },
                    onClick: (event: MouseEvent) => {
                      event.stopPropagation();
                      toggle();
                    }
                  },
                  cogIcon()
                )
            }
          )
        ]
      ),
    cell: () =>
      h(
        "button",
        {
          type: "button",
          style: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            padding: "0",
            font: "inherit",
            color: "var(--pg-dimmed)",
            cursor: "pointer",
            background: "none",
            border: "0",
            borderRadius: "4px"
          },
          onClick: (event: MouseEvent) => event.stopPropagation()
        },
        "…"
      )
  })
]);

const table = useDataTable<Person>({
  data,
  columns,
  getRowId: person => person.id,
  enableColumnOrdering: true,
  enableColumnResizing: true,
  defaultColumnPinning: { start: ["name"], end: ["actions"] },
  persistState: { key: "playground-pinning" }
});

const drawerOpened = ref(false);
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row" style="align-self: stretch; flex-wrap: nowrap; justify-content: space-between">
      <p style="flex: 1; margin: 0; font-size: 12px; color: var(--pg-dimmed)">{{ t.value.hint }}</p>

      <button class="pg-button" type="button" @click="drawerOpened = true">{{ t.value.barePanel }}</button>
    </div>

    <DataTable
      :table="table"
      :labels="labels.value"
      :table-min-width="1280"
      style="flex: 1; min-height: 0"
    />
  </div>

  <!-- The React edition hosts the bare panel in a Mantine Drawer (right, sm, padding 0); the
      plain-CSS counterpart is an overlay plus a fixed sheet. The very same component, no
      trigger: it assumes nothing about what hosts it. The panel brings its own heading, so the
      sheet does not add a second one. -->
  <template v-if="drawerOpened">
    <div
      style="position: fixed; inset: 0; z-index: 200; background: rgb(0 0 0 / 32%)"
      @click="drawerOpened = false"
    />

    <aside
      style="position: fixed; inset-block: 0; inset-inline-end: 0; z-index: 201; width: 380px; overflow-y: auto; background: var(--pg-panel); box-shadow: -4px 0 24px rgb(0 0 0 / 10%)"
    >
      <DataTableColumnsPanel :key="lang" :table="table" :labels="labels.value" />
    </aside>
  </template>
</template>
