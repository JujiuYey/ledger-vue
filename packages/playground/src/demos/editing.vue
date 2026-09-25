<script setup lang="ts">
import type { ColumnDef, DataTableEditCommit } from "@coldsmirk/ledger-vue";

import type { Product } from "../data";

import { checkboxEditor, createColumnHelper, DataTable, numberEditor, selectEditor, textEditor } from "@coldsmirk/ledger-vue";
import { computed, ref, watch } from "vue";

import { makeProducts } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    sku: "SKU (read-only)",
    name: "Product (required)",
    stock: "Stock (frozen off sale)",
    warehouse: "Bin (frozen off sale)",
    listed: "On sale (commits on click)",
    price: "Price (read-only)",
    nameRequired: "Product name cannot be empty",
    trigger: "Edit trigger",
    doubleClick: "Double-click to edit",
    click: "Single click to edit",
    lastCommit: "Last commit:",
    noCommit: "nothing yet",
    hint: "The commit is delayed 500ms to mimic a server; empty the product name to see validation block it; Tab moves to the next cell; F2 starts editing from the keyboard; stock and bin are read-only on delisted rows"
  },
  zh: {
    sku: "SKU（只读）",
    name: "品名（必填）",
    stock: "库存（下架不可改）",
    warehouse: "仓位（下架不可改）",
    listed: "上架（点击即提交）",
    price: "单价（只读）",
    nameRequired: "品名不能为空",
    trigger: "编辑触发方式",
    doubleClick: "双击进入编辑",
    click: "单击进入编辑",
    lastCommit: "最近一次提交：",
    noCommit: "尚无提交",
    hint: "模拟服务端 500ms 延迟；把品名清空可看到校验拦截；Tab 移动到相邻单元格；F2 从键盘开始编辑；下架商品的库存与仓位不可编辑"
  }
};

const helper = createColumnHelper<Product>();

/**
 * Off-sale stock is frozen: a per-row gate, not a per-column one.
 */
const onSale = (row: { original: Product }) => row.original.listed;

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = ref<Product[]>(makeProducts(lang.value, 30));
const lastCommit = ref<string | null>(null);

// The sample rows are generated per language, so switching starts the stock count over —
// pending edits included. (React's "adjust state when a prop changes" pattern, as a watcher.)
watch(lang, () => {
  data.value = makeProducts(lang.value, 30);
  lastCommit.value = null;
});

// `editTrigger` is a mount-time option in the Vue edition, so the segmented control remounts
// the table through :key and the switch takes effect live.
const trigger = ref<"double-click" | "click">("double-click");

const columns = computed((): Array<ColumnDef<Product, any>> => [
  helper.accessor("sku", { header: t.value.sku, size: 130 }),
  helper.accessor("name", {
    header: t.value.name,
    minSize: 180,
    meta: {
      edit: {
        render: textEditor(),
        validate: value => String(value).trim() === "" ? t.value.nameRequired : null
      }
    }
  }),
  helper.accessor("stock", {
    header: t.value.stock,
    size: 190,
    meta: {
      align: "end",
      edit: {
        render: numberEditor(),
        enabled: onSale
      }
    }
  }),
  helper.accessor("warehouse", {
    header: t.value.warehouse,
    size: 190,
    meta: {
      edit: {
        render: selectEditor(["A-01", "A-02", "B-01", "B-02", "C-01"]),
        enabled: onSale
      }
    }
  }),
  helper.accessor("listed", {
    header: t.value.listed,
    size: 190,
    meta: { align: "center", edit: { instant: checkboxEditor() } }
  }),
  helper.accessor("price", {
    header: t.value.price,
    size: 130,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  })
]);

const handleEditCommit = async (change: DataTableEditCommit<Product>) => {
  await new Promise(resolve => {
    setTimeout(resolve, 500);
  });

  const columnId = change.column.id as keyof Product;
  data.value = data.value.map(product => product.id === change.row.original.id
    ? { ...product, [columnId]: change.value }
    : product);
  lastCommit.value = `${change.row.original.sku}.${change.column.id}: ${String(change.previousValue)} → ${String(change.value)}`;
};
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row">
      <div class="pg-seg" role="radiogroup" :aria-label="t.trigger">
        <button
          type="button"
          :data-active="trigger === 'double-click' || undefined"
          @click="trigger = 'double-click'"
        >
          {{ t.doubleClick }}
        </button>

        <button
          type="button"
          :data-active="trigger === 'click' || undefined"
          @click="trigger = 'click'"
        >
          {{ t.click }}
        </button>
      </div>

      <span style="color: var(--pg-dimmed); font-size: 12px">
        {{ t.lastCommit }}<code class="pg-code">{{ lastCommit ?? t.noCommit }}</code>
      </span>
    </div>

    <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.hint }}</span>

    <DataTable
      :key="trigger"
      :labels="labels"
      :columns="columns"
      :data="data"
      :edit-trigger="trigger"
      enable-active-row
      tabular-nums
      style="flex: 1; min-height: 0"
      :get-row-id="product => product.id"
      :on-edit-commit="handleEditCommit"
    />
  </div>
</template>
