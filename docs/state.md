# State management

ledger's state model is TanStack's state, exposed the Vue way. Shapes are TanStack's **verbatim** (`SortingState`, `RowSelectionState`, …); the wiring follows the canonical controlled/uncontrolled contract instead of TanStack's `initialState` bag and `Updater` callbacks.

## The slice trio

Every state slice is independently controllable through three options:

```
x            — controlled value: the prop is the state; the table renders it and never diverges
defaultX     — uncontrolled initial value: the table owns the state from there on
onXChange(v) — observer: receives the RESOLVED next value (never an updater function)
```

Controlled and uncontrolled cannot be double-sourced — `x` wins whenever present, exactly like `value` / `defaultValue` on an input. In controlled mode the owner is the authority: moving `x` is it answering — accepted, normalized, or replaced — and **silence is a refusal** — the value on screen only moves when the prop moves, it never echoes a request the owner declined, and the next event departs from what is on screen. Internally TanStack's functional updaters are resolved before your callback sees them, and chained updates within one event resolve against fresh state — Vue's synchronous reactivity makes that ordering exact.

On the component, `v-model:x` is the `:x` + `@update:x` pair: the `update:x` events and the `onXChange` props are two spellings of one observer, both wired to the same slice. The value half additionally accepts a ref or getter (a `v-model` ref or a `computed` keeps the single `useDataTable` call reactive); the `defaultX` and handler halves stay plain.

`defaultX` is also what a **reset** returns to. Every TanStack slice reset API (`resetSorting()`, `resetPagination()`, `resetColumnOrder()`, …) restores `table.initialState`, which ledger seeds from that slice's `defaultX` or the fallback in the table below. So a reset lands on the state ledger or the application declared, not on TanStack's unrelated built-in defaults. Persisted values are excluded from that seeding on purpose: if a restored value became the reset target, a reset after a refresh would do nothing. `initialState` is ledger-managed and never reaches a read path; passing your own through `tableOptions.initialState` is overridden with a dev warning, per the merge rule below — the per-slice `defaultX` trio is the way in.

### Reading state

TanStack v9 removed `table.getState()`. The instance `useDataTable` returns is vue-table's enriched shape (`TableInstance<TData>`), and its read surfaces are the v9 ones, all reflecting the controlled slices verbatim:

- `table.atoms.<slice>.get()` — a per-slice snapshot, and the tracked read: inside a `computed` it re-runs when the slice moves, and in an event handler it is the current value. This is also how ledger's own internals read state — the core instance has **no `table.state`** (that member exists only on framework wrappers ledger does not build);
- `table.store` — the readonly flat store derived from the atoms;
- `table.Subscribe` — a render boundary; its function child receives the atoms, and only the atoms it reads are tracked.

v9 also removed the whole-state `onStateChange` option; the per-slice `onXChange` trio above is the only change surface — which is what ledger's contract prescribed all along.

### The slices

| Slice | Shape (TanStack) | Uncontrolled fallback |
| --- | --- | --- |
| `sorting` | `SortingState` | `[]` |
| `columnFilters` | `ColumnFiltersState` | `[]` |
| `globalFilter` | `string` | `""` |
| `pagination` | `PaginationState` | `{ pageIndex: 0, pageSize: 20 }` |
| `rowSelection` | `RowSelectionState` | `{}` |
| `expanded` | `ExpandedState` | `{}` |
| `columnVisibility` | `ColumnVisibilityState` | `{}` |
| `columnPinning` | `ColumnPinningState` | `{ start: [], end: [] }` |
| `columnOrder` | `ColumnOrderState` | `[]` |
| `columnSizing` | `ColumnSizingState` | `{}` |
| `grouping` | `GroupingState` | `[]` |
| `rowPinning` | `RowPinningState` | `{ top: [], bottom: [] }` |
| `editingCell` | `DataTableEditingCell \| null` (ledger-owned) | `null` — and no `defaultEditingCell`: a default editing cell is meaningless |
| `editingRowId` | `string \| null` (ledger-owned, `editMode: "row"`) | `null` ([editing.md](editing.md#row-mode)) |
| `activeRowId` | `string \| null` (ledger-owned) | `null` ([rows.md](rows.md#active-row)) |

## Client/server modes

`sortingMode` / `filterMode` / `paginationMode` (each `"client" | "server"`, default `"client"`) replace TanStack's opaque `manualX` flags with the industry terms:

| Mode set to `"server"` | ledger does | You do |
| --- | --- | --- |
| `sortingMode` | sets `manualSorting` — the sorted row model passes rows through | observe `onSortingChange`, refetch |
| `filterMode` | sets `manualFiltering` — the filtered **and faceted** row models pass rows through | observe filter callbacks, refetch; provide explicit `options` on select-family filters |
| `paginationMode` | sets `manualPagination`, forwards `rowCount` (TanStack derives `pageCount`) | observe `onPaginationChange`, refetch the page, pass `rowCount` |

### The auto-reset policy

In **client** mode TanStack's defaults stand (e.g. a filter change resets `pageIndex`). In **server** mode ledger keeps TanStack's upstream page reset disabled and performs the one equivalent deterministic reset itself: a `columnFilters`, `globalFilter`, or `sorting` change resets `pageIndex` to 0 (never on mount — the reset rides a watcher that does not fire during setup — and a no-op when already 0). The deterministic reset follows `tableOptions.autoResetAll ?? tableOptions.autoResetPageIndex ?? true`: `autoResetAll` wins when present; otherwise `autoResetPageIndex: false` disables it. Because TanStack otherwise gives `autoResetAll` priority and can queue a reset to `initialState.pagination`, server mode consumes that global option and forwards its non-pagination effects through `autoResetExpanded` and `autoResetSorting`; ledger's zero reset therefore remains authoritative.

## The feature set and fn registries

TanStack v9 wires features, row-model factories, and the `filterFns` / `sortFns` / `aggregationFns` registries through a required `features` option. Ledger assembles that object itself (`ledger-features.ts`): every stock feature except `columnResizingFeature` (the resize interaction is ledger's own — [sizing.md](sizing.md)) and `cellSelectionFeature` (deferred until its design round — [DESIGN.md](DESIGN.md)), all client row models (registered statically — the `*Mode` translations decide at runtime whether they process rows or pass them through), and **every built-in fn registered under its conventional name** — v9 resolves string ids, `'auto'` included, only against registered functions, and ledger's contract is that every capability of a raw `ColumnDef` keeps working.

Custom filter functions register through the first-class `filterFns` option (their ids become valid `filterFn` / `globalFilterFn` strings); the reserved `ledger-one-of` and `ledger-date-range` ids win with a dev warning if redefined. The registry wires code, not reactive state — it is read once at mount. Custom `sortFns` / `aggregationFns` ids remain reachable by passing the function directly on the `ColumnDef`.

## `tableOptions` — the escape hatch

Everything `useTable` accepts can be passed through `tableOptions`. It is the **base layer**: ledger-managed keys (`features`, `state`, the `on*Change` wiring, `manualX` translations, injected columns, …) override it, and each collision logs a dev-mode warning naming the first-class option to use instead. `manualSorting` and `sortingMode` can never silently fight — the mode wins, audibly.

```ts
const table = useDataTable({
  data,
  columns,
  tableOptions: {
    groupedColumnMode: false,
    keepPinnedRows: false,
    enableRowRangeSelection: false,
    autoResetAll: false
  }
});
```

`tableOptions.meta` is honored — ledger merges its own namespace on top, reserving only `meta.ledger`. `tableOptions.atoms` (v9's external-atoms ownership) passes through untouched — an atom you register for a slice outranks ledger's controlled `state` for that slice, so only reach for it when you deliberately take a slice away from the trio contract.

## `meta.ledger` and the bare instance

`useDataTable` returns the **bare TanStack instance** (`TableInstance<TData>`, vue-table's enriched shape: reactive `atoms` plus `Subscribe`) — no ledger wrapper type, so composable mode loses nothing and every TanStack API works. The composable runs **once per component**: the reactive-critical inputs (`data`, `columns`, every state-slice value, `rowCount`, the editing gates) accept a ref or getter and are read per access, so the single call stays reactive the way a re-render is in React; handlers stay plain functions (or ride a ref when they must swap at runtime). The instance itself must stay stable for the component's life — never re-create it in a computed or a loop; reactivity flows through the options' refs, not through re-running the composable.

Ledger-private configuration and controllers ride `table.options.meta.ledger` (TanStack's sanctioned extension point, typed via declaration merging as `LedgerMeta<TData>`): the stable processed `columns` (the render layer's token — v9 re-resolves `table.options` per state tick, so `options.columns` identity is no signal), the editing controller, filter-set subscriptions used by debounced controls, `editTrigger`, `enableEditing`, `onEditCommit`, `onRowEditCommit`, `renderDetailPanel`, the select-all scope, the active-row controller, `enableColumnOrdering`, `rowOrdering`, `enableColumnResizing`, and `enablePagination`. Compound components and advanced consumers may read it; treat it as read-mostly plumbing.

## The imperative handle

`handleRef` (a plain `Ref<DataTableHandle<TData> | null>`) receives a `DataTableHandle`; a template ref on the component exposes the same object (`defineExpose`), which is the usual spelling — a `:handle-ref` binding would hand the component the ref's unwrapped current value, so the template-ref form is the one demos use:

```vue
<script setup lang="ts">
import type { DataTableHandle } from "@jujiuyey/ledger-vue";
import { ref } from "vue";

const handle = ref<DataTableHandle<Person> | null>(null);
</script>

<template>
  <DataTable ref="handle" … />
</template>
```

`{ table, viewport, scrollToRow(rowId, options), scrollToIndex(index, options), scrollToColumn(columnId, options), startEditing(rowId, columnId), stopEditing({ commit? }) }` — see [api.md](api.md#imperative-handle).

## Persisted state

`persistState` snapshots chosen slices to storage and restores them on mount:

```vue
<script setup lang="ts">
import type { DataTablePersistState } from "@jujiuyey/ledger-vue";

// layout set: sizing, visibility, order, pinning
const peoplePersistence: DataTablePersistState = { key: "people-table" };

const auditPersistence: DataTablePersistState = {
  key: "audit-table",
  slices: ["sorting", "columnFilters", "pagination", "columnVisibility"],
  storage: sessionStorage
};
</script>

<template>
  <DataTable :persist-state="peoplePersistence" … />
</template>
```

- `key` namespaces one table per entry (`ledger:<key>`); `storage` defaults to `localStorage` (guarded — persistence degrades to a no-op where storage is unavailable or throws).
- Persistable slices: `sorting`, `columnFilters`, `globalFilter`, `pagination`, `columnVisibility`, `columnPinning`, `columnOrder`, `columnSizing`, `grouping`. The default set is the **layout** four: `columnSizing`, `columnVisibility`, `columnOrder`, `columnPinning`.
- Hydration happens once, synchronously, feeding the **uncontrolled** side — the first render already shows the restored layout, restored values outrank `defaultX`, and a controlled slice always wins over both.
- Writes are debounced (250 ms), with the latest pending value flushed on real disposal — Vue has no simulated unmounts, so there is nothing to defer past. Swapping the `storage` backend under the same key re-targets the pending write to the new backend (e.g. a consent flow upgrading an in-memory backend to `localStorage`). Storage content is treated as a trust boundary: each slice and its nested TanStack fields are shape-checked on read, and a stale or corrupt slice degrades to its default instead of crashing the table.

## Dev-mode guard rails

Warnings are development-only and fire once per session each:

| Guard | Trigger |
| --- | --- |
| `getRowId` missing | selection or expansion enabled without stable row ids |
| Column identity churn | `columns` has a new identity on almost every reactive tick |
| `tableOptions` collision | a ledger-managed key passed through the escape hatch |
| Reserved filter function | `filterFns` redefines `ledger-one-of` or `ledger-date-range` |
| Pagination + `onEndReached` | the two paging models configured together |
| Unconstrained virtualization | `virtualizedRows` while the viewport cannot scroll |
| Reordering with header groups | `enableColumnOrdering` ignored under grouped headers |
| Server select-filter without options | select-family filter in server `filterMode` with no `options` |
| `table` plus behavior options | hook mode (`table` prop) configured together with sugar-mode options (`data`, `sorting`, …) — SFC props cannot express the XOR the composable's shape carries, so the misuse warns instead |
