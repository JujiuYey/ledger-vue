# Recipes

Integration patterns that cross feature boundaries. Every feature's own semantics live in its guide; the runnable versions of most of these are the playground demos (`pnpm --filter ledger-vue-playground dev`).

## A server-driven table

All three modes to `"server"`, state observed through the trios, data refetched from the observed state — one watcher over every controlled slice, with a cancellation flag so the last request wins:

```vue
<script setup lang="ts">
import type { ColumnFiltersState, PaginationState, SortingState } from "@jujiuyey/ledger-vue";

import { DataTable } from "@jujiuyey/ledger-vue";
import { ref, watch } from "vue";

import { auditColumns } from "./audit-columns";

const sorting = ref<SortingState>([{ id: "createdAt", desc: true }]);
const columnFilters = ref<ColumnFiltersState>([]);
const pagination = ref<PaginationState>({ pageIndex: 0, pageSize: 50 });
const page = ref<{ rows: AuditEntry[]; total: number }>({ rows: [], total: 0 });
const loading = ref(true);

// The request is derived state: every input is a controlled slice.
watch([sorting, columnFilters, pagination], (_sources, _previous, onCleanup) => {
  let cancelled = false;

  onCleanup(() => {
    cancelled = true;
  });

  loading.value = true;

  void api.listAudit({
    sorting: sorting.value,
    filters: columnFilters.value,
    ...pagination.value
  }).then(result => {
    if (cancelled) {
      return;
    }

    page.value = result;
    loading.value = false;
  });
}, { immediate: true });
</script>

<template>
  <DataTable
    v-model:sorting="sorting"
    v-model:column-filters="columnFilters"
    v-model:pagination="pagination"
    style="flex: 1; min-height: 0"
    :columns="auditColumns"
    :data="page.rows"
    :get-row-id="entry => entry.id"
    sorting-mode="server"
    filter-mode="server"
    enable-pagination
    pagination-mode="server"
    :row-count="page.total"
    :loading="loading"
  />
</template>
```

Notes: a filter or sorting change resets `pageIndex` to 0 for you ([state.md](state.md#the-auto-reset-policy)); select-family filters need explicit `options` in server mode; the previous page stays on screen until the response lands (`page` is only written on success), so the `loading` overlay draws over live rows rather than a gap. A query library — TanStack Query's Vue adapter, say — replaces the watcher without touching a single ledger prop.

## Cursor-based infinite loading

Server data + `onEndReached` instead of pagination ([virtualization.md](virtualization.md#infinite-loading)):

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

const pages = ref<{ rows: LogEntry[]; nextCursor: string | null }[]>([]);
const fetching = ref(false);
const exhausted = ref(false);

const rows = computed(() => pages.value.flatMap(page => page.rows));

async function fetchNextPage() {
  if (fetching.value || exhausted.value) {
    return;
  }

  fetching.value = true;
  const cursor = pages.value.at(-1)?.nextCursor ?? null;
  const page = await api.logsAfter(cursor);   // { rows, nextCursor: string | null }
  pages.value = [...pages.value, page];
  exhausted.value = page.nextCursor === null;
  fetching.value = false;
}
</script>

<template>
  <DataTable
    virtualized-rows
    style="flex: 1; min-height: 0"
    :columns="columns"
    :data="rows"
    :get-row-id="row => row.id"
    sorting-mode="server"
    :on-end-reached="fetchNextPage"
    :loading-more="fetching"
  />
</template>
```

## Syncing state to the URL

The trios are plain controlled props, so URL state slots straight in — the History API is enough, no router required:

```vue
<script setup lang="ts">
import type { SortingState } from "@jujiuyey/ledger-vue";

import { ref } from "vue";

const initial = new URLSearchParams(location.search).get("sort");

// Read once at setup; every change rewrites the parameter in place.
const sorting = ref<SortingState>(initial ? JSON.parse(initial) : []);

function setSorting(next: SortingState) {
  const params = new URLSearchParams(location.search);

  if (next.length === 0) {
    params.delete("sort");
  } else {
    params.set("sort", JSON.stringify(next));
  }

  history.replaceState(null, "", `?${params}`);
  sorting.value = next;
}
</script>

<template>
  <DataTable :sorting="sorting" :on-sorting-change="setSorting" … />
</template>
```

The same shape works for any slice (a real router — vue-router's query, say — replaces the History calls without touching the ledger side); keep URL-encoded slices controlled and let the rest stay uncontrolled.

## A CSV download button

```vue
<script setup lang="ts">
import { DataTableSelectionBar, toCsv, useDataTable } from "@jujiuyey/ledger-vue";

const table = useDataTable({ /* … */ });

function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <DataTableSelectionBar :table="table">
    <button type="button" @click="downloadCsv('selected.csv', toCsv(table, { scope: 'selected' }))">
      导出所选
    </button>
  </DataTableSelectionBar>
</template>
```

(The BOM keeps Excel happy with UTF-8.) `scope: "filtered"` exports the current view; `"all"` the unfiltered set; for spreadsheet-bound exports of untrusted data add `escapeFormulas: true` — see [api.md](api.md#tocsv).

## Fuzzy global search

Register a custom filter function on the first-class registry and point the global filter at its id:

```vue
<script setup lang="ts">
import { rankItem } from "@tanstack/match-sorter-utils";   // app-side dependency, deliberately not bundled

const filterFns = {
  fuzzy: (row, columnId, value, addMeta) => {
    const rank = rankItem(row.getValue(columnId), value);
    addMeta({ rank });
    return rank.passed;
  }
};
</script>

<template>
  <DataTable
    enable-global-filter
    :filter-fns="filterFns"
    :table-options="{ globalFilterFn: 'fuzzy' }"
    …
  />
</template>
```

`filterFns` merges over the built-ins (registries wire code, so they are read once at mount); only the reserved `ledger-one-of` and `ledger-date-range` ids cannot be replaced. `tableOptions.globalFilterFn` deliberately accepts any string so a registered custom id typechecks; on a raw `ColumnDef.filterFn`, pass the function directly (v9 replaced the old `FilterFns` declaration merging with registry slots).

## A row-actions column

A `display` column, propagation-stopped like every injected control ([rows.md](rows.md#row-interaction)) — and no component library needed to build one, `h()` over native buttons carries it:

```ts
import { h } from "vue";

import { createColumnHelper } from "@jujiuyey/ledger-vue";

const helper = createColumnHelper<Person>();

const actionsColumn = helper.display({
  id: "actions",
  size: 96,
  enableSorting: false,
  enableHiding: false,
  cell: ({ row }) =>
    h("div", { style: { display: "flex", gap: "4px" }, onClick: event => event.stopPropagation() }, [
      h("button", { type: "button", onClick: () => edit(row.original) }, "编辑"),
      h("button", { type: "button", onClick: () => remove(row.original) }, "删除")
    ])
});
```

Pin it to the end (`:default-column-pinning="{ start: [], end: ['actions'] }"` — v9's `ColumnPinningState` requires both arrays) to keep actions visible under horizontal scroll. A dropdown of your own (a Teleport popover) replaces the two buttons when a row grows more actions.

## Optimistic inline editing

Commit locally first, reconcile with the server, and let a rejection put the cell back into editing ([editing.md](editing.md)):

```ts
import type { DataTableEditCommit } from "@jujiuyey/ledger-vue";

async function commitEdit({ row, column, value, previousValue }: DataTableEditCommit<Person>) {
  people.value = people.value.map(person =>
    person.id === row.original.id ? { ...person, [column.id]: value } : person);
  try {
    await api.patchPerson(row.original.id, { [column.id]: value });
  } catch (error) {
    people.value = people.value.map(person =>
      person.id === row.original.id ? { ...person, [column.id]: previousValue } : person);
    throw error;   // rejection re-opens the editor with the message
  }
}
```

`people` is a `ref<Person[]>`; bind the handler with `:on-edit-commit="commitEdit"`.

## Playground demo map

Ordered simple → complex, each themed as a real business scene. Every page runs in English or
Simplified Chinese — the switch in the header swaps the app's own copy, the generated sample
data, and the `labels` the library renders with, so it doubles as a live [i18n](i18n.md) demo.
**View source** opens the demo's own file plus the local modules it imports; the copy for both
languages sits at the top of each file, which is also the pattern to copy — column defs must be
rebuilt (`computed` over the copy object) or a locale switch leaves the old headers standing.

| Demo (`packages/playground/src/demos/`) | Scene | Exercises |
| --- | --- | --- |
| `basic` | Staff roster | the minimal table: raw column defs + data, sorting, hover, a responsive column pair |
| `appearance` | Price list | the three border shapes (frame + rows / grid / horizontal-only), stripes, spacing, loading, empty state, the header tint recipe |
| `states` | Every unhappy path | loading, empty, no-results, error + retry, load-more error, a custom empty state |
| `orders` | Order desk | all five filter variants, pagination, footer totals, the active row, `onRowActivate`, `onRowContextMenu`, `rowProps` / `meta.cellProps` |
| `selection` | Bulk actions | multi-select, shift ranges, selection bar, CSV export, per-row selectability, single-select via `enableMultiRowSelection` |
| `editing` | Stock count | all four editors, validation, async commits, a per-row edit gate |
| `row-editing` | Employee records | row mode: atomic commits, an actions column driving the controller through `meta.ledger` |
| `row-ordering` | Release checklist | drag-handle reordering, the keyboard lift, handles disabling under sorting, the `arrayMove` handler |
| `master-detail` | Order line items | detail panels (nested line-item table) |
| `tree` | Revenue by region | sub-rows, indentation, expand-all |
| `menu-tree` | Menu administration | a business tree: many columns, pinned tree column, horizontal scroll |
| `spanning` | Revenue report | `spanRows` / `spanColumns`, a fixed-size document rather than an elastic table |
| `grouped-headers` | Quarterly store report | `helper.group` / `helper.columns`, a footer row, `headerCellProps` / `footerCellProps` |
| `pinning` | Wide table | `DataTableColumnsPanel` (header cog + bare panel in a drawer), pinning, resize, drag reorder, `persistState` |
| `grouping` | Sales performance | grouping + aggregation, row pinning |
| `virtualized` | Audit log | 50k rows, virtualization, infinite loading, `scrollToRow`, adaptive height |
| `column-virtualization` | Sales matrix | 361 columns windowed on both axes, month groups clamping, `scrollToColumn` |
| `server-side` | Server-backed table | `sortingMode` / `filterMode` / `paginationMode` on `"server"`, `rowCount`, a race-guarded fetch |
| `hook-toolbar` | Custom toolbar | hook mode + compound components (`DataTableSearch` / `DataTableColumnsPanel` / `DataTablePagination`) |
