<script setup lang="ts">
import type { ColumnDef, Row } from "@coldsmirk/ledger-vue";

import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref } from "vue";

import { makeOrders } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    orderNo: "Order",
    customer: "Customer",
    channel: "Channel",
    status: "Status",
    quantity: "Items",
    amount: "Amount",
    placedAt: "Placed",
    total: (amount: string) => `Total ${amount}`,
    hint: "Hover a header for its filter and column menu (five filter variants); the total follows the filters; click the table or focus it and use ↑/↓/Home/End to move the current row, Enter to read the order number; right-click any row for its actions; cancelled orders are dimmed through rowProps and large amounts bolded through meta.cellProps.",
    current: (orderNo: string) => `Current order: ${orderNo}`,
    view: "View order",
    copyNo: "Copy order number",
    cancel: "Cancel order",
    cancelledTitle: "This order was cancelled",
    channels: {
      web: "Web",
      app: "App",
      store: "Store",
      phone: "Phone"
    },
    statuses: {
      pending: "Pending",
      paid: "Paid",
      shipped: "Shipped",
      completed: "Completed",
      cancelled: "Cancelled"
    }
  },
  zh: {
    orderNo: "订单号",
    customer: "客户",
    channel: "渠道",
    status: "状态",
    quantity: "件数",
    amount: "金额",
    placedAt: "下单日期",
    total: (amount: string) => `合计 ${amount}`,
    hint: "表头悬停出现筛选与列菜单（五种筛选变体）；合计随筛选联动；点击或聚焦表格后用 ↑/↓/Home/End 移动活动行，Enter 查看订单号；右键任意行打开操作菜单；已取消订单经 rowProps 变暗，大额金额经 meta.cellProps 加粗。",
    current: (orderNo: string) => `当前订单：${orderNo}`,
    view: "查看订单",
    copyNo: "复制订单号",
    cancel: "取消订单",
    cancelledTitle: "该订单已取消",
    channels: {
      web: "网页",
      app: "APP",
      store: "门店",
      phone: "电话"
    },
    statuses: {
      pending: "待支付",
      paid: "已支付",
      shipped: "已发货",
      completed: "已完成",
      cancelled: "已取消"
    }
  }
};

/* Mantine's Badge palette, mapped onto the playground's plain-CSS badge colors (app.css) —
   the palette has no violet swatch, so shipped takes blue alongside paid. */
const statusColor: Record<Order["status"], string> = {
  pending: "yellow",
  paid: "blue",
  shipped: "blue",
  completed: "green",
  cancelled: "gray"
};

const helper = createColumnHelper<Order>();

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makeOrders(lang.value, 200));

const activeOrder = ref<string | null>(null);

interface ContextMenuState {
  x: number;
  y: number;
  order: Order;
}

const contextMenu = ref<ContextMenuState | null>(null);

const columns = computed((): Array<ColumnDef<Order, any>> => [
  helper.accessor("orderNo", {
    header: t.value.orderNo,
    size: 150,
    meta: { filter: "text" }
  }),
  helper.accessor("customer", {
    header: t.value.customer,
    size: 130,
    meta: { filter: "text" }
  }),
  helper.accessor("channel", {
    header: t.value.channel,
    size: 110,
    cell: (context: { getValue: () => "web" | "app" | "store" | "phone" }) => t.value.channels[context.getValue()],
    meta: {
      filter: {
        variant: "select",
        options: Object.entries(t.value.channels).map(([value, label]) => {
          return { value, label };
        })
      }
    }
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 130,
    cell: (context: { getValue: () => "pending" | "paid" | "shipped" | "completed" | "cancelled" }) =>
      h(
        "span",
        { class: "pg-badge", "data-color": statusColor[context.getValue()] },
        t.value.statuses[context.getValue()]
      ),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(t.value.statuses).map(([value, label]) => {
          return { value, label };
        })
      }
    }
  }),
  helper.accessor("quantity", {
    header: t.value.quantity,
    size: 90,
    meta: { align: "end" }
  }),
  helper.accessor("amount", {
    header: t.value.amount,
    size: 130,
    cell: context => context.getValue().toFixed(2),
    footer: ({ table }) => {
      const sum = table
        .getFilteredRowModel()
        .rows
        .reduce((total, row) => total + row.getValue<number>("amount"), 0);

      return t.value.total(sum.toFixed(2));
    },
    meta: {
      align: "end",
      filter: "range",
      // Per-cell DOM props: large orders read heavier without a custom cell renderer.
      cellProps: cell => (cell.getValue() >= 900 ? { style: { fontWeight: 600 } } : undefined)
    }
  }),
  helper.accessor("placedAt", {
    header: t.value.placedAt,
    size: 150,
    sortDescFirst: true,
    meta: { filter: "date-range" }
  })
]);

// Per-row DOM props: a state attribute for E2E selectors plus the dimming that goes with it.
const rowProps = (row: Row<Order>) =>
  row.original.status === "cancelled"
    ? {
        "data-cancelled": true,
        style: { opacity: 0.55 },
        title: t.value.cancelledTitle
      }
    : undefined;

const activate = (row: Row<Order>) => {
  activeOrder.value = row.original.orderNo;
};

const openContextMenu = (row: Row<Order>, event: MouseEvent) => {
  event.preventDefault();
  contextMenu.value = {
    x: event.clientX,
    y: event.clientY,
    order: row.original
  };
};

const closeContextMenu = () => {
  contextMenu.value = null;
};

const menuActivate = () => {
  if (contextMenu.value) {
    activeOrder.value = contextMenu.value.order.orderNo;
    closeContextMenu();
  }
};

const menuCopy = () => {
  void navigator.clipboard?.writeText(contextMenu.value?.order.orderNo ?? "");
  closeContextMenu();
};
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <span style="color: var(--pg-dimmed); font-size: 12px">
      {{ activeOrder === null ? t.hint : t.current(activeOrder) }}
    </span>

    <!-- `onRowContextMenu` is the literal pointer event, so the app owns preventDefault and the
        menu's placement — ledger neither renders a menu nor assumes you want one. The Mantine
        Menu becomes a fixed-position dropdown over a click-away overlay. -->
    <template v-if="contextMenu">
      <div class="menu-overlay" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />

      <div
        class="menu-dropdown"
        role="menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      >
        <div class="menu-label">{{ contextMenu.order.orderNo }}</div>

        <button class="menu-item" role="menuitem" type="button" @click="menuActivate">
          {{ t.view }}
        </button>

        <button class="menu-item" role="menuitem" type="button" @click="menuCopy">
          {{ t.copyNo }}
        </button>

        <button
          class="menu-item menu-cancel"
          role="menuitem"
          type="button"
          :disabled="contextMenu.order.status === 'cancelled'"
          @click="closeContextMenu"
        >
          {{ t.cancel }}
        </button>
      </div>
    </template>

    <DataTable
      :labels="labels"
      :columns="columns"
      :data="data"
      enable-active-row
      enable-pagination
      striped
      tabular-nums
      style="flex: 1; min-height: 0"
      :default-pagination="{ pageIndex: 0, pageSize: 20 }"
      :default-sorting="[{ id: 'placedAt', desc: true }]"
      :get-row-id="order => order.id"
      :row-props="rowProps"
      :on-row-activate="activate"
      :on-row-context-menu="openContextMenu"
    />
  </div>
</template>

<style scoped>
/* The context menu's own chrome — scoped here because it belongs to this demo, not the shell. */
.menu-overlay {
  position: fixed;
  z-index: 998;
  inset: 0;
}

.menu-dropdown {
  position: fixed;
  z-index: 999;
  min-width: 180px;
  padding: 6px;
  font-size: 13px;
  background: var(--pg-panel);
  border: 1px solid var(--pg-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
}

.menu-label {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--pg-dimmed);
}

.menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  text-align: start;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 6px;
}

.menu-item:hover:not(:disabled) {
  background: var(--pg-hover);
}

.menu-cancel {
  color: #c92a2a;
}

.menu-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
