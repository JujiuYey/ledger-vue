<script setup lang="ts">
import type { ColumnDef, Row, VueContent } from "@jujiuyey/ledger-vue";

import type { Order } from "../data";

import { createColumnHelper, DataTable } from "@jujiuyey/ledger-vue";
import { computed, h } from "vue";

import { makeOrders } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    orderNo: "Order",
    customer: "Customer",
    status: "Status",
    quantity: "Items",
    amount: "Amount",
    placedAt: "Placed",
    product: "Product",
    unitPrice: "Unit price",
    lineQuantity: "Qty",
    subtotal: "Subtotal",
    total: (count: number, amount: string) => `${count} line items, ${amount} in total`,
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
    status: "状态",
    quantity: "件数",
    amount: "金额",
    placedAt: "下单日期",
    product: "商品",
    unitPrice: "单价",
    lineQuantity: "数量",
    subtotal: "小计",
    total: (count: number, amount: string) => `共 ${count} 项，合计 ${amount}`,
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
   the palette has no violet/teal swatches, so shipped takes blue and completed green. */
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

const data = computed(() => makeOrders(lang.value, 40, 53));

// The React edition's `OrderItems` component, as a render function over the same copy — the
// detail panel is plain content inside a synthetic display row.
const renderOrderItems = (row: Row<Order>): VueContent => {
  const order = row.original;

  return h("div", { class: "order-detail" }, [
    h("table", { class: "order-detail-table" }, [
      h("thead", [
        h("tr", [
          h("th", t.value.product),
          h("th", { class: "order-detail-num" }, t.value.unitPrice),
          h("th", { class: "order-detail-num" }, t.value.lineQuantity),
          h("th", { class: "order-detail-num" }, t.value.subtotal)
        ])
      ]),
      h(
        "tbody",
        order.items.map(item => h("tr", { key: item.id }, [
          h("td", item.product),
          h("td", { class: "order-detail-num" }, item.unitPrice.toFixed(2)),
          h("td", { class: "order-detail-num" }, String(item.quantity)),
          h("td", { class: "order-detail-num" }, (item.unitPrice * item.quantity).toFixed(2))
        ]))
      )
    ]),
    h("p", { class: "order-detail-total" }, t.value.total(order.items.length, order.amount.toFixed(2)))
  ]);
};

const columns = computed((): Array<ColumnDef<Order, any>> => [
  helper.accessor("orderNo", { header: t.value.orderNo, size: 160 }),
  helper.accessor("customer", { header: t.value.customer, size: 130 }),
  helper.accessor("status", {
    header: t.value.status,
    size: 120,
    cell: (context: { getValue: () => Order["status"] }) =>
      h("span", { class: "pg-badge", "data-color": statusColor[context.getValue()] }, t.value.statuses[context.getValue()])
  }),
  helper.accessor("quantity", {
    header: t.value.quantity,
    size: 100,
    meta: { align: "end" }
  }),
  helper.accessor("amount", {
    header: t.value.amount,
    size: 140,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("placedAt", { header: t.value.placedAt, size: 140 })
]);
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <DataTable
      :labels="labels"
      :columns="columns"
      :data="data"
      tabular-nums
      style="flex: 1; min-height: 0"
      :get-row-id="order => order.id"
      :render-detail-panel="renderOrderItems"
    />
  </div>
</template>

<style scoped>
/* The detail panel's own chrome — scoped here because it belongs to this demo, not the shell.
   Mantine's Table defaults (md horizontal spacing, 4px vertical, hairline separators) restyled
   in plain CSS. */
.order-detail {
  min-width: 0;
}

.order-detail-table {
  width: 60%;
  border-collapse: collapse;
}

.order-detail-table th,
.order-detail-table td {
  padding: 4px 16px;
  text-align: start;
}

.order-detail-table th {
  font-weight: 500;
}

.order-detail-table thead tr {
  border-bottom: 1px solid var(--pg-border);
}

.order-detail-table tbody tr + tr {
  border-top: 1px solid var(--pg-border);
}

.order-detail-table th.order-detail-num,
.order-detail-table td.order-detail-num {
  text-align: end;
}

.order-detail-total {
  margin: 10px 0 0;
  font-size: 14px;
  font-weight: 600;
}
</style>
