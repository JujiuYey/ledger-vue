# API reference

The complete public surface of `@jujiuyey/ledger-vue`, as implemented. Feature semantics live in the guides; this page is the lookup table.

- [Entry points and re-exports](#entry-points-and-re-exports)
- [`UseDataTableOptions`](#usedatatableoptionstdata) (behavior — composable mode and sugar mode alike)
- [`DataTableProps`](#datatablepropstdata) (presentation)
- [Column `meta`](#column-meta)
- [Editing types](#editing-types)
- [Filter types](#filter-types)
- [Persistence types](#persistence-types)
- [Imperative handle](#imperative-handle)
- [Compound components](#compound-components)
- [`toCsv`](#tocsv)
- [Labels](#labels)
- [Icons](#icons)
- [`meta.ledger`](#metaledger)

## Entry points and re-exports

```vue
<script setup lang="ts">
import {
  DataTable,             // the root component (also the default export; + .Search / .ColumnsPanel
                         // / .Pagination / .SelectionBar statics and .classes — runtime only)
  useDataTable,          // options → bare TanStack vue-table instance
  toCsv,                 // CSV export over a table instance
  defaultLabels,         // English label set
  resolveLabels,         // partial labels → full set, merged over the defaults
  defaultIcons,          // vendored Lucide glyph set
  createColumnHelper,    // TanStack, re-exported
  flexRender             // TanStack, re-exported
} from "@jujiuyey/ledger-vue";

import { zhCN } from "@jujiuyey/ledger-vue/locales";
import "@jujiuyey/ledger-vue/styles.css";
</script>
```

Re-exported TanStack types (consumers never import `@tanstack/*`): `ColumnDef`, `Column`, `Row`, `Cell`, `Header`, `HeaderGroup` (each pre-bound to the canonical v9 feature set, keeping their v8 arity — `LedgerFeatures` is exported for advanced typing; `ColumnDef` re-attaches `enableResizing` by hand, since the resize interaction is ledger's own and TanStack's `columnResizingFeature` is unregistered), `RowData`, `SortingState`, `ColumnFiltersState`, `PaginationState`, `RowSelectionState`, `ExpandedState`, `ColumnVisibilityState`, `ColumnPinningState` (`{ start, end }`), `ColumnOrderState`, `ColumnSizingState`, `GroupingState`, `RowPinningState`, and the table instance as **`TableInstance`** (v9's enriched Vue shape — `Subscribe` and the per-slice reactive `atoms` included, reads go `table.atoms.<slice>.get()`, there is no `table.state` on the core instance). `createColumnHelper` is ledger's feature-bound wrapper: `createColumnHelper<Person>()`, exactly the v8 calling shape. Its methods are v9's — `accessor` / `display` / `group` / **`columns`**, the last being the variadic-tuple wrapper a `group`'s children need so each keeps its own `TValue` ([columns.md](columns.md#header-groups-and-footers)).

ledger-owned types: `DataTableProps`, `DataTableBaseProps`, `DataTableSearchProps`, `DataTableColumnsPanelProps`, `DataTablePaginationProps`, `DataTableSelectionBarProps`, `UseDataTableOptions`, `DataTableHandle`, `DataTableScrollOptions`, `DataTableLabels`, `DataTableIcons`, `DataTableIconProps`, `DataTableIconComponent`, `DataTableFilterVariant`, `DataTableFilterConfig`, `DataTableEditRenderer`, `DataTableEditConfig`, `DataTableEditContext`, `DataTableInstantEditRenderer`, `DataTableInstantEditConfig`, `DataTableInstantEditContext`, `DataTableEditCommit`, `DataTableEditingCell`, `DataTableEditTrigger`, `DataTableEditMode`, `DataTableRowEditCommit`, `DataTableRowReorder`, `DataTableExportMeta`, `DataTablePersistState`, `DataTablePersistableSlice`, `DataTableElementProps`, `DataAttributes`, `LedgerMeta`, `LedgerEditingController`, `LedgerInstantEditingController`, `LedgerRowEditingController`, `LedgerRowEditor`, `LedgerCellEditor`, `ToCsvOptions`, `VueContent`, `LedgerSize`, `SizeScale`, plus the styling-contract types `DataTableStylesNames`, `DataTableCssVariables`, `GetStyles`, `GetStylesOptions`, `GetStylesProps`, `GetStylesResult`. Value exports beyond the components: `toCsv`, `createColumnHelper`, `flexRender`, `defaultLabels`, `resolveLabels`, `defaultIcons`, and the editor factories `textEditor` / `numberEditor` / `selectEditor` / `checkboxEditor`.

Package exports: `.` (dual ESM+CJS with types), `./locales`, `./styles.css`, `./package.json`. Single peer: `vue` ^3.5.0. Direct dependencies: `@tanstack/vue-table` ^9.2 (with `@tanstack/table-core`), `@tanstack/vue-virtual` ^3.13, `@dnd-kit/dom` ^0.5 (the framework-agnostic core — no React packages), `reka-ui` (the ScrollArea viewport primitives), `clsx`.

## `UseDataTableOptions<TData>`

Accepted by `useDataTable(options)` and, flattened, by `<DataTable …>` in sugar mode. The sugar/hook XOR is not expressible in SFC props, so on the component every key is optional and an option-key partition routes the behavior keys into the composable when `table` is absent — a `table` prop wins instead, and the instance it holds must stay stable for the component's life (setup resolves it once).

### Data

| Option | Type | Notes |
| --- | --- | --- |
| `data` | `ReactiveInput<TData[]>` — plain value, ref, or getter | Keep the identity stable per snapshot; the ref/getter forms keep one composable call reactive |
| `columns` | `ReactiveInput<ColumnDef<TData, any>[]>` | Raw TanStack defs; keep the identity stable (a dev warning watches for churn) |
| `getRowId` | `(row, index, parent?) => string` | Stable ids — required in practice for selection/expansion/editing |
| `defaultColumn` | `Partial<ColumnDef<TData, unknown>>` | TanStack's column defaults |

### Feature switches

| Option | Default | Guide |
| --- | --- | --- |
| `enableSorting` | `true` | [sorting.md](sorting.md) |
| `enableMultiSort` | `true` (shift-click appends) | [sorting.md](sorting.md) |
| `enableSortingRemoval` | `true` (third click clears) | [sorting.md](sorting.md) |
| `enableColumnFilters` | `true` | [filtering.md](filtering.md) |
| `enableGlobalFilter` | `false` | [filtering.md](filtering.md) |
| `enablePagination` | `false` | [pagination.md](pagination.md) |
| `enableRowSelection` | `false` — `boolean \| (row) => boolean` | [selection.md](selection.md) |
| `enableMultiRowSelection` | `true`; `false` = single-select | [selection.md](selection.md) |
| `enableColumnResizing` | `false` (ledger-owned switch; TanStack's `columnResizingFeature` is unregistered — [sizing.md](sizing.md#resizing-interplay)) | [columns.md](columns.md) |
| `enableColumnPinning` | `true` | [pinning.md](pinning.md) |
| `enableColumnOrdering` | `false` (ledger-owned name) | [columns.md](columns.md) |
| `enableHiding` | `true` | [columns.md](columns.md) |
| `enableEditing` | `true` (columns still opt in via `meta.edit`) — `ReactiveInputOption<boolean>`: a running table answers a ref/getter flip | [editing.md](editing.md) |
| `enableActiveRow` | `false` (ledger-owned; keyboard-reachable current row) — `ReactiveInputOption<boolean>` | [rows.md](rows.md#active-row) |
| `enableRowOrdering` | `false` (ledger-owned; drag-handle reordering — inert without `onRowReorder`, flat data only) | [rows.md](rows.md#row-ordering) |
| `enableGrouping` | `false` | [grouping.md](grouping.md) |
| `enableRowPinning` | `false` | [pinning.md](pinning.md) |
| `enableCellSpanning` | `true` — defs opt in via `spanRows` / `spanColumns`; ignored while `virtualizedRows` / `virtualizedColumns` | [columns.md](columns.md#merged-cells) |

### Hierarchy and master–detail

| Option | Type | Guide |
| --- | --- | --- |
| `getSubRows` | `(row: TData) => TData[] \| undefined` | [rows.md](rows.md) |
| `renderDetailPanel` | `(row: Row<TData>) => VueContent` | [rows.md](rows.md) |
| `selectionColumn` / `expanderColumn` | `Partial<ColumnDef<TData, unknown>>` | Merged over the injected def; `id` is reserved ([selection.md](selection.md#overriding-the-injected-column)) |

### Row ordering

| Option | Type | Guide |
| --- | --- | --- |
| `onRowReorder` | `ReactiveHandler<(reorder: DataTableRowReorder<TData>) => void>` — `{ row, fromIndex, toIndex }`, `arrayMove` semantics over `data` | [rows.md](rows.md#row-ordering) |
| `rowDragColumn` | `Partial<ColumnDef<TData, unknown>>` | Overrides the injected handle column, on `selectionColumn`'s terms |

### Client/server split

| Option | Type / default | Guide |
| --- | --- | --- |
| `sortingMode` / `filterMode` / `paginationMode` | `"client" \| "server"`, default `"client"` | [state.md](state.md) |
| `rowCount` | `ReactiveInputOption<number>` — server-mode total; `pageCount` derived; the ref/getter forms move the pager after a fetch | [pagination.md](pagination.md) |

### Editing

| Option | Type / default | Guide |
| --- | --- | --- |
| `editTrigger` | `"double-click"` (default) `\| "click"` — `ReactiveInputOption` | [editing.md](editing.md) |
| `editMode` | `"cell"` (default) `\| "row"` — row-atomic editing with `onRowEditCommit`; `ReactiveInputOption` | [editing.md](editing.md#row-mode) |
| `onEditCommit` | `ReactiveHandler<(change: DataTableEditCommit<TData>) => void \| Promise<void>>` | [editing.md](editing.md) — cell mode |
| `onRowEditCommit` | `ReactiveHandler<(change: DataTableRowEditCommit<TData>) => void \| Promise<void>>` | [editing.md](editing.md#row-mode) — row mode, one call per row |

The composable runs once per component, where the React hook ran per render — so the reactive-critical keys above resolve per access and the handlers per invocation, and both identity and presence answer a runtime swap. A component that must swap a handler passes it through a ref (`ReactiveHandler`); the resolver uses `isRef`, never `toValue`, because a plain handler is itself a function.

### State slices

One trio per slice — `x` (controlled) / `defaultX` (uncontrolled) / `onXChange(resolvedValue)`; shapes verbatim TanStack v9 ([state.md](state.md)): `sorting`, `columnFilters`, `globalFilter`, `pagination`, `rowSelection`, `expanded`, `columnVisibility`, `columnPinning` (`{ start, end }`), `columnOrder`, `columnSizing`, `grouping`, `rowPinning` — plus the ledger-owned `editingCell` / `onEditingCellChange` and `editingRowId` / `onEditingRowIdChange` (editing has no meaningful default, so neither slice takes a `defaultX`; the pair you use follows `editMode`, [editing.md](editing.md)) and `activeRowId` / `defaultActiveRowId` / `onActiveRowIdChange` (with `enableActiveRow`, [rows.md](rows.md#active-row)). Every slice's value half additionally accepts a ref or getter, so a single `useDataTable` call stays reactive — `v-model:x` on `<DataTable>` lands here as a ref; the `defaultX` and handler halves stay plain.

### Persistence and escape hatch

| Option | Type | Notes |
| --- | --- | --- |
| `persistState` | [`DataTablePersistState`](#persistence-types) | [state.md](state.md#persisted-state) |
| `filterFns` | `Record<string, FilterFn>` | First-class registry (v9 slots): ids become valid `filterFn`/`globalFilterFn` strings, merged over the built-ins, read once at mount; ledger's two ids are reserved |
| `tableOptions` | `Partial<TableOptions>` with `globalFilterFn` widened to accept any string | Base layer; managed keys (`features` included) override with a dev warning |

## `DataTableProps<TData>`

`DataTableBaseProps` plus, flattened, `Partial<UseDataTableOptions<TData>>` and `{ table }` — the sugar/hook XOR expressed at runtime, not the type level (above). The component's generic call signature (`DataTableComponent`) puts every `onUpdate:x` event on the props, so `TData` infers from `data`/`columns` and `v-model:x` typechecks: `sorting`, `columnFilters`, `globalFilter`, `pagination`, `rowSelection`, `expanded`, `columnVisibility`, `columnPinning`, `columnOrder`, `columnSizing`, `grouping`, `rowPinning`, `activeRowId`, `editingCell`, `editingRowId`.

There are no Mantine base props in this edition: the styling channels are declared flat — `classNames` / `styles` (per selector), `className` / `style` (the root), `attributes` (spread onto the resolved elements). The React `vars` and `unstyled` channels are dropped: the color and radius props below write the same CSS variables directly, and the stylesheet is always on.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `table` | `TableInstance<TData>` | — | Hook mode; wins over the inline options, resolved once in setup — keep the instance stable for the component's life |
| `handleRef` | `Ref<DataTableHandle<TData> \| null>` | — | [Imperative handle](#imperative-handle); a plain template ref exposes the same object (`defineExpose`) — there is no ref-as-prop in Vue |
| `striped` | `boolean \| "odd" \| "even"` | `false` | `true` = `"odd"` |
| `stripedColor` | `string` (plain CSS color) | the stylesheet's stripe token | No theme resolver — `{ dark, light }` pairs are not accepted |
| `highlightOnHover` | `boolean` | `false` | |
| `highlightOnHoverColor` | `string` (plain CSS color) | the stylesheet's hover token | |
| `withTableBorder` | `boolean` | `false` | |
| `withColumnBorders` | `boolean` | `false` | |
| `withRowBorders` | `boolean` | `true` | Separators between rows — never under the last one ([styling.md](styling.md#borders)) |
| `withBottomBorder` | `boolean` | `false` | The closing line under the last row (and a footer) for a table without a frame ([styling.md](styling.md#borders)) |
| `borderColor` | `string` (plain CSS color) | the stylesheet's border token | |
| `radius` | `number` (px) \| `"sm" \| "md" \| "lg" \| "xl"` \| any CSS length | — | Rounds the table box (root and the header + body + footer frame) and clips to it; the `withTableBorder` frame follows. Presets resolve to 0.25 / 0.5 / 1 / 1.5rem; an unrecognized string lands verbatim ([styling.md](styling.md#appearance-props)) |
| `size` | `LedgerSize` (`"xs" \| "sm" \| "md" \| "lg" \| "xl"`) | `"sm"` | The type, the cell padding, a row's height and every control's size as one word ([styling.md](styling.md#size)) |
| `verticalSpacing` | `number` (px) | the size's | Overrides the size's block padding |
| `horizontalSpacing` | `number` (px) | the size's | Overrides the size's inline padding |
| `tabularNums` | `boolean` | `false` | |
| `colorScheme` | `"light" \| "dark"` | — (follows the OS preference) | Pins the scheme: writes `data-color-scheme` on the root |
| `tableMinWidth` | `number \| string` | — | Content-width floor ([sizing.md](sizing.md)) |
| `virtualizedRows` | `boolean \| { estimateHeight?: number; overscan?: number }` | `false` | Object defaults: the size's row height / 8 ([virtualization.md](virtualization.md)) |
| `virtualizedColumns` | `boolean \| { overscan?: number }` | `false` | Center-zone column window; overscan default 4, nothing to estimate ([virtualization.md](virtualization.md#column-virtualization)) |
| `onEndReached` | `() => void` | — | Deduped per `data` identity — a new array re-arms it ([virtualization.md](virtualization.md)) |
| `endReachedOffset` | `number` | `240` | px before the bottom |
| `loadingMore` | `boolean` | `false` | Trailing loader row |
| `loadMoreError` | `boolean \| VueContent` | — | Replaces the loader row with a message + retry ([rows.md](rows.md#loading-empty-and-error-states)) |
| `loading` | `boolean` | `false` | Skeletons (no rows) or overlay (rows present) |
| `emptyState` | `VueContent` | the state glyph + `labels.empty` / `labels.noResults` | Centered in the body; no-results shows while filters are active |
| `error` | `boolean \| VueContent` | — | Error panel over the body; precedence over empty ([rows.md](rows.md#loading-empty-and-error-states)) |
| `onRetry` | `() => void` | — | Adds the retry button to the error panel |
| `withColumnHeaders` | `boolean` | `true` | Renders the header region ([columns.md](columns.md#hiding-the-header)) |
| `withPaginationBar` | `boolean` | `true` | Renders only while pagination is enabled |
| `pageSizeOptions` | `number[]` | `[10, 20, 50, 100]` | |
| `onRowActivate` | `(row: Row<TData>, event: MouseEvent \| KeyboardEvent) => void` | — | Input-agnostic: click or `Enter` on the current row ([rows.md](rows.md)) |
| `onRowClick` / `onRowDoubleClick` / `onRowContextMenu` | `(row: Row<TData>, event: MouseEvent) => void` | — | Literal pointer events ([rows.md](rows.md)) |
| `rowProps` | `LedgerTrProps \| (row) => LedgerTrProps \| undefined` | — | DOM props per data row ([styling.md](styling.md#dom-props)) |
| `headerRowProps` / `footerRowProps` | `LedgerTrProps \| (headerGroup) => LedgerTrProps \| undefined` | — | DOM props per header / footer row |
| `viewportProps` | `HTMLAttributes & DataAttributes` | — | DOM props for the scroll viewport (`onScroll`, …); ledger's own scroll/keyboard handling composes rather than being replaced |
| `labels` | `Partial<DataTableLabels>` | `defaultLabels` | [i18n.md](i18n.md) |
| `icons` | `Partial<DataTableIcons>` | `defaultIcons` | Per-slot glyph replacement ([Icons](#icons)) |
| `aria-label` / `aria-labelledby` / `aria-describedby` | `string` | — | Declared hyphenated and routed to the ARIA table (`.ledger-main`), not the root wrapper |

The `Ledger*Props` element families are Vue's own HTML attribute types — `LedgerTrProps` is `HTMLAttributes`, and the cell families below are `TdHTMLAttributes` / `ThHTMLAttributes` — each intersected with `DataAttributes` through `DataTableElementProps` (static object or per-subject function).

Styles API selector names (`DataTableStylesNames`) and the CSS variable surface (`DataTableCssVariables`: root `--ledger-striped-color` / `--ledger-hover-color` / `--ledger-border-color` / `--ledger-radius` / `--ledger-font-size`) are catalogued in [styling.md](styling.md). `classNames` and `styles` keep the React edition's selector names; the merge contract lives in one pure function (`get-styles.ts`), the static class map ships as `DataTable.classes`, and the resolver types (`GetStyles` and friends) are exported for wrapper components that must resolve classes the same way the table does.

## Column `meta`

Declaration-merged into TanStack's `ColumnMeta` — see [columns.md](columns.md#the-meta-extension) for semantics:

```ts
interface ColumnMeta<TData, TValue> {
  label?: string;                   // plain-text name for the columns panel, CSV headers, filter/editor
                                    // field names; wins over a string `header`, defaults to it, then the id
  align?: "start" | "center" | "end";
  truncate?: boolean;
  filter?: DataTableFilterVariant | DataTableFilterConfig
         | ((column: Column<TData, TValue>) => VueContent);
  edit?: DataTableEditRenderer<TData, TValue> | DataTableEditConfig<TData, TValue>
       | DataTableInstantEditConfig<TData, TValue>;
  cellProps?: DataTableElementProps<LedgerTdProps, Cell<TData, TValue>>;
  headerCellProps?: DataTableElementProps<LedgerThProps, Header<TData, TValue>>;
  footerCellProps?: DataTableElementProps<LedgerThProps, Header<TData, TValue>>;
  export?: false | { header?: string; value?: (row: Row<TData>) => unknown };
  hiddenFrom?: "xs" | "sm" | "md" | "lg" | "xl" | (string & {});   // removed at and above the breakpoint
  visibleFrom?: "xs" | "sm" | "md" | "lg" | "xl" | (string & {});   // present only at and above the breakpoint
}
```

Breakpoints are ledger's own scale here (`xs` 36em, `sm` 48em, `md` 62em, `lg` 75em, `xl` 87em), or any CSS length / media condition the host's `matchMedia` accepts — carried verbatim, which is why the type stays open.

## Editing types

```ts
type DataTableEditTrigger = "double-click" | "click";
type DataTableEditMode = "cell" | "row";

type DataTableEditRenderer<TData, TValue> = (ctx: DataTableEditContext<TData, TValue>) => VueContent;
type DataTableInstantEditRenderer<TData, TValue> = (ctx: DataTableInstantEditContext<TData, TValue>) => VueContent;

// Both configs also carry the shared gate and validation — the session's, not the control's:
//   enabled?: (row: Row<TData>) => boolean;                        // per-row gate
//   validate?: (value: TValue, row: Row<TData>) => string | null;  // non-null blocks the commit
interface DataTableEditConfig<TData, TValue>        { render: DataTableEditRenderer<TData, TValue> }
interface DataTableInstantEditConfig<TData, TValue> { instant: DataTableInstantEditRenderer<TData, TValue> }

interface DataTableEditContext<TData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;
  setValue: (value: TValue) => void;
  commit: () => boolean | Promise<boolean>;  // false = validation/application commit failed; editor stays active
  cancel: () => void;
  error: string | null;
  pending: boolean;                          // a write is still out (the cell's; in row mode the row's)
  mode: DataTableEditMode;                   // which session hosts the editor — a renderer may adapt
  autoFocus: boolean;                        // take focus on mount: always in cell mode, entry column in row mode
  label: string;                             // localized accessible name (labels.editColumn over the column title)
  size: LedgerSize;                          // the cell's control size — the table's size a step down (styling.md#size)
}

interface DataTableInstantEditContext<TData, TValue> {
  row: Row<TData>;
  column: Column<TData, TValue>;
  value: TValue;                             // what the cell holds as far as the application knows
  commit: (value: TValue) => boolean | Promise<boolean>;  // one change, one commit; stages the row draft in row mode
  pending: boolean;
  error: string | null;
  label: string;
  size: LedgerSize;                          // the cell's control size (styling.md#size)
}

interface DataTableRowEditCommit<TData> {
  row: Row<TData>;
  values: Record<string, unknown>;           // every editable column, drafts merged in
  previousValues: Record<string, unknown>;
}

interface DataTableEditCommit<TData> {
  row: Row<TData>;
  column: Column<TData, unknown>;
  value: unknown;
  previousValue: unknown;
}

interface DataTableEditingCell { rowId: string; columnId: string }

// Row ordering (rows.md#row-ordering): indexes address the data array, arrayMove semantics.
interface DataTableRowReorder<TData> {
  row: Row<TData>;
  fromIndex: number;
  toIndex: number;
}
```

The shipped editors — `textEditor()`, `numberEditor()`, `selectEditor(options)`, and the instant `checkboxEditor()` — are exported renderer factories implemented on these public contexts ([editing.md](editing.md#the-shipped-editors)). All are native controls carrying the `ledger-input` / `ledger-checkbox` classes; `selectEditor`'s options are bare strings, `{ value, label?, disabled? }` records, or `{ group, items }` clusters.

## Filter types

```ts
type DataTableFilterVariant = "text" | "select" | "multi-select" | "range" | "date-range";

// Structural (not exported as a name): one option of a select / multi-select filter control.
type LedgerFilterOption
  = | string
    | { value: string; label?: string; disabled?: boolean; group?: string };

type DataTableFilterConfig =
  | { variant: "text"; placeholder?: string }
  | { variant: "select" | "multi-select";
      options?: LedgerFilterOption[];   // client mode derives from faceted values; server mode requires it
      placeholder?: string }
  | { variant: "range" | "date-range" };
```

Discriminated by `variant`, so each member carries exactly the keys its control reads: `options` belongs to the select family, and the bound inputs label themselves `filterRangeMin` / `filterRangeMax` rather than taking a `placeholder`. A configuration the renderer would ignore does not typecheck.

Registered filter functions (usable as `filterFn` ids anywhere): every TanStack built-in under its conventional name, plus `ledger-one-of` (strict scalar/array set membership) and `ledger-date-range` (inclusive local calendar-date range) — see [filtering.md](filtering.md#variants). The first-class `filterFns` option merges custom ids beneath the two reserved implementations. Raw `ColumnDef.filterFn` retains TanStack's strict id typing (registered ids and functions typecheck; v9 replaced `FilterFns` declaration merging with registry slots).

## Persistence types

```ts
type DataTablePersistableSlice
  = "sorting" | "columnFilters" | "globalFilter" | "pagination"
  | "columnVisibility" | "columnPinning" | "columnOrder" | "columnSizing" | "grouping";

interface DataTablePersistState {
  key: string;                                                   // one table per key
  slices?: DataTablePersistableSlice[];                          // default: sizing, visibility, order, pinning
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; // default: localStorage (guarded)
}
```

## Imperative handle

Received through `handleRef`, or through a plain template ref — `defineExpose` fills it with the same object (in Vue the template ref on the component IS the handle; there is no separate root-element ref):

```ts
interface DataTableHandle<TData> {
  table: TableInstance<TData>;
  viewport: HTMLDivElement | null;   // the body scroll viewport
  scrollToRow: (rowId: string, options?: DataTableScrollOptions) => void;
  scrollToIndex: (index: number, options?: DataTableScrollOptions) => void;  // the page's row model
  scrollToColumn: (columnId: string, options?: DataTableScrollOptions) => void;  // width-engine math; pinned targets no-op
  startEditing: (rowId: string, columnId?: string) => void;   // cell mode requires columnId; row mode focuses it
  stopEditing: (options?: { commit?: boolean }) => void;   // default commit: true
}

interface DataTableScrollOptions {
  align?: "start" | "center" | "end" | "auto";   // default "auto"
  behavior?: "auto" | "smooth";
}
```

Scrolling by id and scrolling by position are two methods rather than one parameter accepting both: `getRowId` may well return digits, and a table whose ids read `"5"` could not say which of the two a `string | number` meant.

## Compound components

All take the `table` instance, compose anywhere, and are individually styleable through their own `class`/`className` + `style` props and static classes (no theme keys in this edition — [styling.md](styling.md#app-wide-defaults)):

| Component | Props | Notes |
| --- | --- | --- |
| `DataTableSearch` | `{ table, debounce?: number /* 200 */, labels?, icons?, placeholder?, width?, class?, style? }` | Global filter input; clear/external reset cancels pending input ([filtering.md](filtering.md#global-filter)) |
| `DataTableColumnsPanel` | `{ table, popoverProps?, labels?, icons?, className?, style? }` — the default slot is the trigger | Order / visibility / pinning / width / grouping. The panel opens from the slot in a Popover (`popoverProps`: `placement?: "bottom-start" \| "bottom-end"`, `panelWidth?`, `panelMaxHeight?`, `panelStyle?`); without a trigger it renders bare ([columns.md](columns.md#the-columns-panel)) |
| `DataTablePagination` | `{ table, pageSizeOptions?, labels?, size?, className?, style? }` | Standalone bar ([pagination.md](pagination.md)); `size` the table's, `sm` unless said |
| `DataTableSelectionBar` | `{ table, labels?, icons?, class?, style? }` — the default slot is the bulk actions | Renders only while rows are selected ([selection.md](selection.md)) |

Each is also attached as a static on the `DataTable` object (`DataTable.Search`, …) for runtime parity with the React spelling — but dot notation is not resolvable in Vue templates, so template use goes through the named exports (`DataTableSearch`, …).

## `toCsv`

```ts
function toCsv<TData>(table: TableInstance<TData>, options?: ToCsvOptions): string;

interface ToCsvOptions {
  scope?: "filtered" | "all" | "page" | "selected";   // default "filtered" (after filters/sorting, before pagination)
  delimiter?: string;                                 // default ","
  withHeaders?: boolean;                              // default true
  escapeFormulas?: boolean;                           // default false — OWASP formula defusal for spreadsheet-bound exports
}
```

RFC 4180 quoting, CRLF line ends. Exports accessor columns only, in their current visible order (internal columns excluded); header text comes from `meta.label`, then string `header`s, falling back to column ids. Values serialize as: `Date` → ISO string, objects → JSON, `null`/`undefined` → empty. Scopes read the live row models — a server-paginated table can only export the rows it has, and `"page"` is identical to `"filtered"` when pagination is off.

Per-column control rides `meta.export`: `false` excludes the column entirely; `{ header, value }` overrides the exported title or derives the exported value from the row (the result flows through the same serialization).

`escapeFormulas` prefixes text a spreadsheet would evaluate as a formula (leading `=`, `+`, `-`, `@`, tab or CR — the OWASP CSV-injection set) with a `'`; it applies to header text and string-valued cells, while numeric cells keep their sign. Off by default because the quote is data to every non-spreadsheet consumer — turn it on for exports of untrusted data that feed Excel or LibreOffice.

## Labels

`DataTableLabels` (all keys and defaults in [i18n.md](i18n.md)); `defaultLabels` is the English set; `zhCN` ships from `@jujiuyey/ledger-vue/locales`; `labels` props take partials, and `resolveLabels(partial | undefined)` merges one over `defaultLabels` — the same helper ledger's own chrome resolves with.

## Icons

```ts
interface DataTableIconProps {
  size?: number;         // 12–16 in the controls, 40 in the empty/error indicators
  strokeWidth?: number;
}
type DataTableIconComponent = Component<DataTableIconProps>;

interface DataTableIcons {
  /* Header */
  sortAsc: DataTableIconComponent;
  sortDesc: DataTableIconComponent;
  sortable: DataTableIconComponent;        // neutral affordance while unsorted
  filterColumn: DataTableIconComponent;
  /* Rows — one chevron, rotated open by the stylesheet (groups and expand-all included) */
  expandRow: DataTableIconComponent;
  reorderRow: DataTableIconComponent;      // the row-ordering drag handle (the pointer ghost clones it with the row)
  /* States */
  empty: DataTableIconComponent;
  noResults: DataTableIconComponent;
  error: DataTableIconComponent;
  retry: DataTableIconComponent;
  /* Global search */
  search: DataTableIconComponent;
  /* Selection */
  clearSelection: DataTableIconComponent;
  /* Columns panel */
  resetColumns: DataTableIconComponent;
  reorderColumn: DataTableIconComponent;
  groupByColumn: DataTableIconComponent;   // toggle and grouped rest-state mark
  pinStart: DataTableIconComponent;
  unpin: DataTableIconComponent;
  pinEnd: DataTableIconComponent;
}
```

`defaultIcons` is the built-in set — Lucide glyphs with their path data vendored into the package (no icon-library dependency). Slots are named for the `DataTableLabels` key of the same affordance where one exists; `icons` props take partials, merged per slot. `lucide-vue-next` components satisfy `DataTableIconComponent` as-is — see [styling.md](styling.md#icons).

## `meta.ledger`

`table.options.meta.ledger` (typed `LedgerMeta<TData>`) carries ledger-private plumbing on TanStack's sanctioned extension point: the stable processed `columns` (the render layer's memo token — v9 re-resolves `table.options` per state tick), the `editing` controller (below), filter-set subscriptions (`filtering.subscribeColumnFilters` / `.subscribeGlobalFilter`) used to cancel debounced controls even on no-op resets, `editTrigger`, `enableEditing`, `onEditCommit`, `onRowEditCommit`, `renderDetailPanel`, `selectAllScope` (`"page" | "all"`), `activeRow` (`enabled` / `id` / `set`), `rowOrdering` (`enabled` / `orderable` / `onRowReorder` — [rows.md](rows.md#row-ordering)), `enableColumnOrdering`, `enableColumnResizing`, and `enablePagination`. Compound components read it; applications normally shouldn't write it. `tableOptions.meta` is merged beneath it — only the `ledger` key is reserved. The meta is a computed, so the handler identities and the reactive flags it carries (`editTrigger`, `enableEditing`, the edit-commit handlers, the row-ordering gate) stay current without the composable re-running.

`meta.ledger.editing` carries both modes at once; `mode` says which one is live. Both sessions live in the controller and the editors are views of them — an editor is unmounted by a hidden column or a virtual scroll at any moment, while the session is not ([architecture.md](architecture.md#load-bearing-internals)).

```ts
interface LedgerEditingController {
  mode: DataTableEditMode;                                 // "cell" | "row"
  cell: DataTableEditingCell | null;                       // cell mode: the cell being edited
  active: (rowId: string, columnId: string) => boolean;    // …and its session is still live
  start: (cell: DataTableEditingCell) => void;
  stop: (options?: { commit?: boolean }) => void;
  clear: () => void;
  commit: () => boolean | Promise<boolean>;                // the session's, not an editor's
  cancel: () => void;
  drafts: {
    pending: (rowId: string, columnId: string) => boolean;
    error: (rowId: string, columnId: string) => string | null;
    read: (rowId: string, columnId: string, source: unknown) => unknown;
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  moveTo: (backwards: boolean) => void;                    // Tab / Shift+Tab: commit, then move
  firstEditable: (rowId: string, skipInstant: boolean) => string | null;  // where F2 enters
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
  instant: LedgerInstantEditingController;                 // the instant-apply controls' transient edits
  row: LedgerRowEditingController;                         // inert while mode is "cell"
}

interface LedgerInstantEditingController {
  value: (rowId: string, columnId: string, source: unknown) => unknown;    // written (until the data moves past it), else source
  pending: (rowId: string, columnId: string) => boolean;                   // this cell's write is out
  error: (rowId: string, columnId: string) => string | null;
  commit: (rowId: string, columnId: string, value: unknown) => boolean | Promise<boolean>;  // one change, one commit
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
}

interface LedgerCellEditor {
  redraw: () => void;                                      // something the editor shows changed
}

interface LedgerRowEditingController {
  id: string | null;                                       // the row being edited
  active: (rowId: string) => boolean;                      // and its session is still live
  start: (rowId: string, options?: { focusColumnId?: string }) => void;
  stop: (options?: { commit?: boolean }) => void;           // commits or cancels the row atomically
  commit: () => boolean | Promise<boolean>;                 // the same, with the real result
  shouldFocus: (columnId: string) => boolean;
  drafts: {
    pending: (rowId: string) => boolean;                                   // a write for the row is still out
    error: (rowId: string, columnId: string) => string | null;
    read: (rowId: string, columnId: string, source: unknown) => unknown;   // pending, else written, else source
    write: (rowId: string, columnId: string, value: unknown) => void;
  };
  register: (columnId: string, editor: LedgerRowEditor) => () => void;
}

interface LedgerRowEditor {
  focus: () => void;
  redraw: () => void;                                      // something the editor shows changed in the session
}
```

`editing.instant` is not a session — an instant column commits on change, so there is nothing to open or close. What it holds is per *target* and any number can be live at once: the write still out, the failure it came back with, and the value the application now holds. It is addressed by row and column for the same reason the stores above are, and for one more: hiding the column, a breakpoint removing it, or a virtual scroll takes the control off the screen, and none of those are the write landing ([editing.md](editing.md#instant-editing)).

`moveTo` and `firstEditable` answer for the render that reached the screen rather than for the shared TanStack core, which carries whatever options pass ran last — committed or not. Vue has no discarded renders to defend against; the committed snapshot behind them stands on the invariant both editions share: everything a commit decides with must outlive the editor that sent it ([architecture.md](architecture.md#load-bearing-internals)). The keyboard entry points go through them, so a stale core cannot decide where the caret goes, that a cell is read-only, or that the row is not there. Both read the display order (`start + center + end`), and `moveTo` picks its destination after its commit succeeds rather than when the key was pressed.

The row-mode store is addressed by row and not by column alone: two rows' editors can be mounted at once while a switch settles, and each must read its own pending values or none. `read`, `pending` and `error` are what an editor renders — it holds no copy of any of them, because an editor is unmounted by a hidden column or a virtual scroll at any moment while the session is not (see [architecture.md](architecture.md#load-bearing-internals)). `id` is the row that actually rendered — `start` and `stop` request a change of the controlled `editingRowId` slice, and an application may answer with a different row or with none ([editing.md](editing.md#row-mode)).
