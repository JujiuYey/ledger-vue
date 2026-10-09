/**
 * `@jujiuyey/ledger-vue` — a Vue-native DataTable on TanStack Table + TanStack Virtual.
 *
 * The behavior layer speaks TanStack's language, the presentation layer speaks the stylesheet's
 * (docs/DESIGN.md). TanStack is an implementation dependency: everything a consumer needs is
 * re-exported here — never import from `@tanstack/*` directly.
 */

import type { VNode } from "vue";

import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState
} from "@tanstack/vue-table";

import type { DataTableProps } from "./data-table-types";
import type { DataTableStylesNames } from "./get-styles";

import DataTableSfc from "./data-table.vue";

import { DataTableColumnsPanel } from "./columns-panel";
import { dataTableClasses } from "./get-styles";
import { DataTablePagination } from "./pagination-bar";
import { DataTableSearch } from "./search";
import { DataTableSelectionBar } from "./selection-bar";

import type { DataTableEditingCell } from "./types";

/**
 * The consumer-facing type of `<DataTable>`: a generic functional signature so `TData`
 * infers from `data`/`columns`, with every `v-model:x` event on the props (the runtime SFC
 * declares them as emits; array-form runtime props cannot carry this surface, and the array
 * form exists because the props include types Vue's compiler cannot resolve to runtime
 * constructors — the behavior surface is routed through `useDataTable` verbatim instead).
 */
export interface DataTableComponent {
  classes: Record<DataTableStylesNames, string>;
  Search: typeof DataTableSearch;
  ColumnsPanel: typeof DataTableColumnsPanel;
  Pagination: typeof DataTablePagination;
  SelectionBar: typeof DataTableSelectionBar;
  <TData extends RowData>(
    props: DataTableProps<TData>
      & {
        class?: unknown;
        style?: unknown;
        "onUpdate:sorting"?: (value: SortingState) => void;
        "onUpdate:columnFilters"?: (value: ColumnFiltersState) => void;
        "onUpdate:globalFilter"?: (value: string) => void;
        "onUpdate:pagination"?: (value: PaginationState) => void;
        "onUpdate:rowSelection"?: (value: RowSelectionState) => void;
        "onUpdate:expanded"?: (value: ExpandedState) => void;
        "onUpdate:columnVisibility"?: (value: ColumnVisibilityState) => void;
        "onUpdate:columnPinning"?: (value: ColumnPinningState) => void;
        "onUpdate:columnOrder"?: (value: ColumnOrderState) => void;
        "onUpdate:columnSizing"?: (value: ColumnSizingState) => void;
        "onUpdate:grouping"?: (value: GroupingState) => void;
        "onUpdate:rowPinning"?: (value: RowPinningState) => void;
        "onUpdate:activeRowId"?: (value: string | null) => void;
        "onUpdate:editingCell"?: (value: DataTableEditingCell | null) => void;
        "onUpdate:editingRowId"?: (value: string | null) => void;
      }
  ): VNode;
}

/**
 * The root component, with the compound parts attached as statics for parity with the React
 * edition's `DataTable.Search` spelling — templates use the named exports below (dot notation
 * is not resolvable in Vue templates, a recorded deviation).
 */
const DataTable = DataTableSfc as unknown as DataTableComponent;

DataTable.classes = dataTableClasses;
DataTable.Search = DataTableSearch;
DataTable.ColumnsPanel = DataTableColumnsPanel;
DataTable.Pagination = DataTablePagination;
DataTable.SelectionBar = DataTableSelectionBar;

// Ordered by module path, which is what the lint rule sorts on — grouping the exports by concept
// is not available here, so the concepts are catalogued in the README instead.
export { DataTableColumnsPanel } from "./columns-panel";
export type { DataTableColumnsPanelProps } from "./columns-panel";
export { toCsv } from "./csv";

export type { ToCsvOptions } from "./csv";
export { DataTable };
export default DataTable;
export type { DataTableBaseProps, DataTableProps } from "./data-table-types";
export type { DataTableCssVariables, DataTableStylesNames } from "./get-styles";
export type { GetStyles, GetStylesOptions, GetStylesProps, GetStylesResult } from "./get-styles";
export { checkboxEditor, numberEditor, selectEditor, textEditor } from "./editors";
export type { DataTableElementProps } from "./element-props";
export type { DataAttributes } from "./data-attributes";
export { defaultIcons } from "./icons";
export type { DataTableIconComponent, DataTableIconProps, DataTableIcons } from "./icons";
export { defaultLabels, resolveLabels } from "./labels";
export type { DataTableLabels } from "./labels";
// TanStack surface, curated — knowledge and code transfer directly. Object types are
// pre-bound to the canonical feature set (`LedgerFeatures`), keeping their v8 arity.
export { createColumnHelper } from "./ledger-features";
export type { LedgerFeatures } from "./ledger-features";
export { DataTablePagination } from "./pagination-bar";

export type { DataTablePaginationProps } from "./pagination-bar";
export { DataTableSearch } from "./search";
export type { DataTableSearchProps } from "./search";
export { DataTableSelectionBar } from "./selection-bar";

export type { DataTableSelectionBarProps } from "./selection-bar";

export type {
  DataTableEditCommit,
  DataTableEditConfig,
  DataTableEditContext,
  DataTableEditingCell,
  DataTableEditMode,
  DataTableEditRenderer,
  DataTableEditTrigger,
  DataTableExportMeta,
  DataTableFilterConfig,
  DataTableFilterVariant,
  DataTableHandle,
  DataTableInstantEditConfig,
  DataTableInstantEditContext,
  DataTableInstantEditRenderer,
  DataTablePersistableSlice,
  DataTablePersistState,
  DataTableRowEditCommit,
  DataTableRowReorder,
  DataTableScrollOptions,
  LedgerCellEditor,
  LedgerEditingController,
  LedgerInstantEditingController,
  LedgerMeta,
  LedgerRowEditingController,
  LedgerRowEditor,
  TableInstance,
  UseDataTableOptions,
  VueContent
} from "./types";
export type { Cell, Column, ColumnDef, Header, HeaderGroup, Row } from "./types";
export { useDataTable } from "./use-data-table";
export type { LedgerSize, SizeScale } from "./size";

export { flexRender } from "@tanstack/vue-table";
export type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ColumnVisibilityState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState
} from "@tanstack/vue-table";
