<script setup lang="ts">
import type { ColumnDef, LedgerSize } from "@coldsmirk/ledger-vue";

import type { Product } from "../data";

import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref } from "vue";

import { makeProducts } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    name: "Product",
    spec: "Spec",
    warehouse: "Bin",
    price: "Price",
    stock: "Stock",
    status: "Status",
    listed: "On sale",
    delisted: "Delisted",
    borders: "Borders",
    frame: "Frame + rows",
    grid: "Grid (spreadsheet)",
    horizontal: "Row lines only",
    rounded: "Rounded",
    closingLine: "Closing line",
    striped: "Stripes",
    hover: "Hover",
    size: "Size",
    loading: "Loading",
    empty: "No data",
    tintedHeader: "Tinted header",
    showHeader: "Show header"
  },
  zh: {
    name: "品名",
    spec: "规格",
    warehouse: "仓位",
    price: "单价",
    stock: "库存",
    status: "状态",
    listed: "在售",
    delisted: "下架",
    borders: "边框",
    frame: "外框 + 横线",
    grid: "网格（电子表格）",
    horizontal: "纯横线",
    rounded: "圆角",
    closingLine: "收口线",
    striped: "斑马纹",
    hover: "悬停高亮",
    size: "尺寸",
    loading: "加载中",
    empty: "空数据",
    tintedHeader: "表头底色",
    showHeader: "显示表头"
  }
};

const helper = createColumnHelper<Product>();

/* The five sizes, as the segmented control offers them. */
const SIZES: LedgerSize[] = ["xs", "sm", "md", "lg", "xl"];

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makeProducts(lang.value, 40));

const borders = ref("frame");
const rounded = ref(true);
const closingLine = ref(false);
const striped = ref(false);
const hover = ref(true);
const size = ref<LedgerSize>("sm");
const loading = ref(false);
const empty = ref(false);
const tintedHeader = ref(false);
const showHeader = ref(true);

const columns = computed((): Array<ColumnDef<Product, any>> => [
  helper.accessor("sku", { header: "SKU", size: 120 }),
  helper.accessor("name", { header: t.value.name, size: 180 }),
  helper.accessor("spec", { header: t.value.spec, size: 110 }),
  helper.accessor("warehouse", { header: t.value.warehouse, size: 100 }),
  helper.accessor("price", {
    header: t.value.price,
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("stock", {
    header: t.value.stock,
    size: 100,
    meta: { align: "end" }
  }),
  helper.accessor("listed", {
    header: t.value.status,
    size: 100,
    cell: context =>
      h(
        "span",
        { class: "pg-badge", "data-color": context.getValue() ? "green" : "gray" },
        context.getValue() ? t.value.listed : t.value.delisted
      )
  })
]);

/* The three border shapes, expressed by the Mantine border props. */
const borderPresets = computed(() => [
  { value: "frame", label: t.value.frame },
  { value: "grid", label: t.value.grid },
  { value: "horizontal", label: t.value.horizontal }
]);
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row" style="gap: 16px">
      <div class="pg-seg" role="radiogroup" :aria-label="t.borders">
        <button
          v-for="preset in borderPresets"
          :key="preset.value"
          type="button"
          :data-active="borders === preset.value || undefined"
          @click="borders = preset.value"
        >
          {{ preset.label }}
        </button>
      </div>

      <label class="pg-switch">
        <input v-model="rounded" type="checkbox">
        <span>{{ t.rounded }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="closingLine" type="checkbox">
        <span>{{ t.closingLine }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="striped" type="checkbox">
        <span>{{ t.striped }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="hover" type="checkbox">
        <span>{{ t.hover }}</span>
      </label>

      <div class="pg-seg" role="radiogroup" :aria-label="t.size">
        <button
          v-for="value in SIZES"
          :key="value"
          type="button"
          :data-active="size === value || undefined"
          @click="size = value"
        >
          {{ value }}
        </button>
      </div>

      <label class="pg-switch">
        <input v-model="loading" type="checkbox">
        <span>{{ t.loading }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="empty" type="checkbox">
        <span>{{ t.empty }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="tintedHeader" type="checkbox">
        <span>{{ t.tintedHeader }}</span>
      </label>

      <label class="pg-switch">
        <input v-model="showHeader" type="checkbox">
        <span>{{ t.showHeader }}</span>
      </label>
    </div>

    <!-- The header tint has no prop by design (it would not match a bare `<thead>`); it is a
        CSS variable an application sets, reached here through the Styles API's root slot.
        See app.css. -->
    <DataTable
      :labels="labels"
      tabular-nums
      :class-names="{ root: tintedHeader ? 'app-tinted-header' : '' }"
      :columns="columns"
      :data="empty ? [] : data"
      style="flex: 1; min-height: 0"
      :get-row-id="product => product.id"
      :highlight-on-hover="hover"
      :loading="loading"
      :radius="rounded ? 'md' : undefined"
      :size="size"
      :striped="striped"
      :with-bottom-border="closingLine"
      :with-column-borders="borders === 'grid'"
      :with-column-headers="showHeader"
      :with-table-border="borders !== 'horizontal'"
    />
  </div>
</template>
