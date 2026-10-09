# Sorting

Sorting is on by default (`enableSorting`, default `true`); individual columns opt out with `enableSorting: false` on their `ColumnDef`.

## Interaction

- The whole header label is a button. Clicking cycles **unsorted → ascending → descending → unsorted** (the removal step is `enableSortingRemoval`, default `true`).
- **Shift-click appends** a column to the existing sort instead of replacing it (`enableMultiSort`, default `true`). While more than one column is sorted, each sorted header shows its 1-based order badge next to the direction chevron.
- The indicator is invisible on unsorted columns until the header is hovered or focused, then fully visible once sorted — sortable columns stay quiet until relevant.
- Sorted headers expose `aria-sort="ascending" | "descending"`.

## Per-column behavior

All of TanStack's column-level sorting knobs apply unchanged on the `ColumnDef`:

```ts
helper.accessor("createdAt", {
  header: "Created",
  sortFn: "datetime",      // TanStack v9 name (was sortingFn)
  sortDescFirst: true,     // first click sorts newest-first
  sortUndefined: "last"    // missing values sink to the bottom
});
```

`invertSorting` and custom `sortFn` functions are equally available. Every built-in sorting function ships pre-registered on ledger's feature set, so the string ids (`"alphanumeric"`, `"datetime"`, …) and the `"auto"` default all resolve ([state.md](state.md#the-feature-set-and-fn-registries)); a custom sort is passed as a function on the def. Niche table-level tuning (`maxMultiSortColCount`, `isMultiSortEvent`) goes through `tableOptions` — see [state.md](state.md).

## State

The sorting slice follows the standard trio — TanStack's `SortingState` shape verbatim, callbacks receiving resolved values. On the component, `v-model:sorting` is the `:sorting` + `@update:sorting` pair; the composable takes `sorting` / `defaultSorting` / `onSortingChange`, and its slice value additionally accepts a ref or getter so the one composable call stays reactive:

```vue
<script setup lang="ts">
import type { SortingState } from "@jujiuyey/ledger-vue";
import { ref } from "vue";

// controlled; or defaultSorting for uncontrolled
const sorting = ref<SortingState>([{ id: "createdAt", desc: true }]);
</script>

<template>
  <DataTable v-model:sorting="sorting" … />
</template>
```

## Server mode

`sortingMode: "server"` tells the table the rows arrive pre-sorted: ledger sets TanStack's `manualSorting` — the client sorted-row model passes rows through untouched. The interaction and state surface are unchanged — observe `onSortingChange` (or `@update:sorting`), refetch, and hand back new `data`:

```vue
<DataTable
  sorting-mode="server"
  v-model:sorting="sorting"
  :data="rowsFromServer"
  …
/>
```

With server pagination active, a sorting change also resets `pageIndex` to 0 — the deterministic reset policy described in [state.md](state.md).
