<script setup lang="ts">
import type { ColumnDef } from "@jujiuyey/ledger-vue";

import type { Region } from "../data";

import { createColumnHelper, DataTable } from "@jujiuyey/ledger-vue";
import { computed } from "vue";

import { makeRegions } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    region: "Region (the header expands everything)",
    revenue: "Revenue",
    share: "Share of region"
  },
  zh: {
    region: "区域（表头可展开全部）",
    revenue: "营收",
    share: "占本区域"
  }
};

const helper = createColumnHelper<Region>();

/**
 * Every node's share is read against its own top-level region, so children sum to 100%.
 */
function shareOfRoot(row: { id: string; original: Region }, roots: Region[]): number {
  const rootId = row.id.split(".", 1)[0];
  const root = roots[Number(rootId)] ?? roots[0];

  return root && root.revenue > 0 ? row.original.revenue / root.revenue : 0;
}

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makeRegions(lang.value));

const columns = computed((): Array<ColumnDef<Region, any>> => [
  helper.accessor("name", {
    header: t.value.region,
    minSize: 200
  }),
  helper.accessor("revenue", {
    header: t.value.revenue,
    size: 140,
    cell: context => context.getValue().toLocaleString(),
    meta: { align: "end" }
  }),
  helper.display({
    id: "share",
    header: t.value.share,
    size: 120,
    cell: context => `${(shareOfRoot(context.row, data.value) * 100).toFixed(1)}%`,
    meta: { align: "end" }
  })
]);
</script>

<template>
  <DataTable
    :labels="labels"
    :columns="columns"
    :data="data"
    :default-expanded="{ 'r-1': true }"
    style="flex: 1; min-height: 0; max-width: 760px"
    :get-row-id="region => region.id"
    :get-sub-rows="region => region.children"
    tabular-nums
  />
</template>
