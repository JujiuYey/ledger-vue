# Row selection

```vue
<DataTable
  enable-row-selection
  :get-row-id="row => row.id"
  :default-row-selection="{}"
  :on-row-selection-change="value => (selection = value)"
  …
/>
```

`enableRowSelection` (default `false`) injects a pinned checkbox column (see [columns.md](columns.md)) and accepts either a boolean or a **predicate** `(row) => boolean` — rows failing the predicate render a disabled checkbox and are excluded from every bulk operation:

```vue
<DataTable :enable-row-selection="row => row.original.status !== 'archived'" … />
```

**Always pair selection with `getRowId`.** `RowSelectionState` is keyed by row id; index-based ids silently corrupt the selection when rows are refetched, sorted, or filtered. A dev-mode warning fires when selection (or expansion) is enabled without it.

## Semantics

- **Multi-select** is the default. `enableMultiRowSelection: false` switches to single-select — cells render a **radio** (one choice at a time is what a radio means), all rendered rows share one group name so the platform's arrow-key navigation applies, toggling a row replaces the previous selection, and the header control disappears (select-all is meaningless there). Under virtualization only the mounted window is in that group.
- **Shift-click range** keeps TanStack v9's range-selection semantics (`enableRowRangeSelection`, default `true`; opt out via `tableOptions`): an ordinary click sets the anchor, a Shift-click selects or deselects the contiguous range to the target in the current view order (after sorting/filtering). The range respects the selection predicate — disabled rows inside it are skipped.
- **Select-all scope**: the header checkbox covers the **current page** while pagination is active (`enablePagination` or `paginationMode: "server"`), and **all filtered rows** otherwise. It shows an indeterminate state while partially selected.
- **Selection survives view changes**: because state is id-keyed, paging, sorting, and filtering never drop selected rows — a row selected on page 1 stays selected while you browse page 3. Render `DataTableSelectionBar` so the running total stays visible.
- Checkbox clicks stop propagation — selecting never triggers `onRowClick`.

## Overriding the injected column

The selection column is an ordinary `ColumnDef`, so `selectionColumn` merges over it — a wider column, a custom cell (a tooltip explaining why a row is disabled, say), a different header. The injected column is fixed at the width the table's `size` gives it (40px at `sm`, [styling.md](styling.md#size)), and every bound an override leaves unsaid stays there — so a `size` override alone is clamped straight back; raise `maxSize` alongside it to widen. Only `id` is reserved: it is how ledger recognizes its own column and keeps the centered layout, the stop-propagation covenant, and the exclusions from CSV export and the columns panel.

```vue
<script setup lang="ts">
import { h } from "vue";

// No component library rides along in this edition: the custom control is a native
// input, and a `title` carries the why-disabled hint — the same choice the drag
// handle's tooltip makes.
const selectionColumn = {
  maxSize: 56,
  size: 56,
  cell: ({ row }) =>
    h("input", {
      "aria-label": "Select row",
      checked: row.getIsSelected(),
      disabled: !row.getCanSelect(),
      title: row.getCanSelect() ? undefined : "Archived rows cannot be selected",
      type: "checkbox",
      onClick: event => {
        event.stopPropagation();
        row.toggleSelected((event.currentTarget as HTMLInputElement).checked);
      }
    })
};
</script>

<template>
  <DataTable
    :enable-row-selection="row => row.original.status !== 'archived'"
    :selection-column="selectionColumn"
    …
  />
</template>
```

A replacement `cell` builds its control from the public row API, as above. What the reserved `id` carries survives the swap — the centered layout, the stop-propagation covenant, the CSV and columns-panel exclusions — but the built-in control's own behavior does not: shift-click ranges, the single-select radio under `enableMultiRowSelection: false`, the sub-row indeterminate state, and the `labels.selectRow` wiring all live in ledger's default cell, so a custom cell re-provides what it needs.

`expanderColumn` does the same for the expander column ([rows.md](rows.md#masterdetail-panels)) — a different chevron, a wider gutter (its bounds are fixed at the width the table's `size` gives it, 40px at `sm`, the same way: raise `maxSize` alongside `size`), an "expand all" header of your own.

## The selection bar

`DataTableSelectionBar` — a named export; dot notation does not resolve in Vue templates — renders only while something is selected: the count, a clear action, and whatever bulk actions the page passes through the default slot. It carries its own `labels` / `icons` props (there is no app-theme default to inherit in this edition).

```vue
<DataTableSelectionBar :labels="labels" :table="table">
  <button type="button" @click="download('people.csv', toCsv(table, { scope: 'selected' }))">
    Export selected
  </button>
</DataTableSelectionBar>
```

The count comes from the full selection state, not from `getSelectedRowModel()` — deliberately, because that model resolves the state against the rows the table actually holds, which under server pagination is a single page. Counting it would drop everything selected on pages that are no longer loaded, and surviving exactly that is the point of id-keyed state. The corollary is that an id the data no longer holds still counts, which is one more reason selection requires a stable `getRowId`. `table.resetRowSelection()` backs the clear button; `toCsv(table, { scope: "selected" })` exports the selected rows the table has ([api.md](api.md#tocsv)).

## State and instance API

The `rowSelection` slice follows the standard trio with TanStack's `RowSelectionState` shape (`Record<rowId, true>`); `v-model:row-selection` rides the same trio through the component. The full TanStack selection API is available on the instance — `table.getSelectedRowModel().rows`, `row.getIsSelected()`, `row.toggleSelected()`, `table.toggleAllRowsSelected(false)`, and so on.

Sub-row selection cascading for tree data (`enableSubRowSelection`) is not surfaced as a first-class option; it passes through `tableOptions` untouched ([state.md](state.md)) — the injected checkbox does render the indeterminate state for a parent whose subtree is partially selected. Note the v9 semantics of `getIsSomeRowsSelected()` / `getIsSomePageRowsSelected()`: they now mean "at least one" and stay `true` at full selection.
