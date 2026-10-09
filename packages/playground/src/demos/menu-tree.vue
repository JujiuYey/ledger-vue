<script setup lang="ts">
import type { ColumnDef, VueContent } from "@jujiuyey/ledger-vue";
import { createColumnHelper, DataTable } from "@jujiuyey/ledger-vue";
import { computed, h } from "vue";

import type { MenuItem } from "../data";
import { makeMenus } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    name: "Menu",
    kind: "Type",
    path: "Route",
    component: "Component",
    permission: "Permission",
    icon: "Icon",
    order: "Order",
    status: "Status",
    visible: "Visible",
    updatedAt: "Updated",
    enabled: "Enabled",
    disabled: "Disabled",
    shown: "Shown",
    hidden: "Hidden",
    kinds: {
      directory: "Folder",
      menu: "Menu",
      action: "Action"
    }
  },
  zh: {
    name: "菜单名称",
    kind: "类型",
    path: "路由路径",
    component: "组件",
    permission: "权限标识",
    icon: "图标",
    order: "排序",
    status: "状态",
    visible: "可见",
    updatedAt: "更新时间",
    enabled: "启用",
    disabled: "停用",
    shown: "显示",
    hidden: "隐藏",
    kinds: {
      directory: "目录",
      menu: "菜单",
      action: "按钮"
    }
  }
};

/* Mantine's Badge palette, mapped onto the playground's plain-CSS badge colors (app.css). */
const kindColor: Record<MenuItem["kind"], string> = {
  directory: "gray",
  menu: "blue",
  action: "yellow"
};

/* Directories carry no component, actions no route — a dimmed dash keeps the grid scannable. */
function codeOrDash(value: string | undefined): VueContent {
  if (value === undefined) {
    return h("span", { style: { color: "var(--pg-dimmed)" } }, "—");
  }

  return h("code", { class: "pg-code" }, value);
}

const helper = createColumnHelper<MenuItem>();

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makeMenus(lang.value));

const columns = computed((): Array<ColumnDef<MenuItem, any>> => [
  helper.accessor("name", {
    header: t.value.name,
    size: 240,
    meta: { filter: "text" }
  }),
  helper.accessor("kind", {
    header: t.value.kind,
    size: 110,
    cell: (context: { getValue: () => "menu" | "directory" | "action" }) =>
      h("span", { class: "pg-badge", "data-color": kindColor[context.getValue()] }, t.value.kinds[context.getValue()]),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(t.value.kinds).map(([value, label]) => {
          return { value, label };
        })
      }
    }
  }),
  helper.accessor("path", {
    header: t.value.path,
    size: 180,
    cell: context => codeOrDash(context.getValue())
  }),
  helper.accessor("component", {
    header: t.value.component,
    size: 240,
    cell: context => codeOrDash(context.getValue())
  }),
  helper.accessor("permission", {
    header: t.value.permission,
    size: 210,
    cell: context => codeOrDash(context.getValue())
  }),
  helper.accessor("icon", {
    header: t.value.icon,
    size: 110,
    cell: context => codeOrDash(context.getValue())
  }),
  helper.accessor("order", {
    header: t.value.order,
    size: 90,
    meta: { align: "end" }
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 100,
    cell: context =>
      h(
        "span",
        { class: "pg-badge", "data-color": context.getValue() === "enabled" ? "green" : "red" },
        context.getValue() === "enabled" ? t.value.enabled : t.value.disabled
      )
  }),
  helper.accessor("visible", {
    header: t.value.visible,
    size: 90,
    cell: context =>
      context.getValue()
        ? t.value.shown
        : h("span", { style: { color: "var(--pg-dimmed)" } }, t.value.hidden)
  }),
  helper.accessor("updatedAt", {
    header: t.value.updatedAt,
    size: 130,
    sortDescFirst: true
  })
]);
</script>

<template>
  <DataTable
    :labels="labels"
    highlight-on-hover
    tabular-nums
    :columns="columns"
    :data="data"
    :default-column-pinning="{ start: ['name'], end: [] }"
    :default-expanded="{ system: true, 'system-users': true }"
    style="flex: 1; min-height: 0"
    :get-row-id="menu => menu.id"
    :get-sub-rows="menu => menu.children"
  />
</template>
