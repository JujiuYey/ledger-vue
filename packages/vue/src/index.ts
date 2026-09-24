/**
 * `@coldsmirk/ledger-vue` — a Vue-native DataTable on TanStack Table + TanStack Virtual.
 *
 * The behavior layer speaks TanStack's language, the presentation layer speaks the stylesheet's
 * (docs/DESIGN.md). TanStack is an implementation dependency: everything a consumer needs is
 * re-exported here — never import from `@tanstack/*` directly.
 */

import DataTableSfc from "./data-table.vue";
import { DataTableColumnsPanel } from "./columns-panel";
import { dataTableClasses } from "./get-styles";
import { DataTablePagination } from "./pagination-bar";
import { DataTableSearch } from "./search";
import { DataTableSelectionBar } from "./selection-bar";

/**
 * The root component, with the compound parts attached as statics for parity with the React
 * edition's `DataTable.Search` spelling — templates use the named exports below (dot notation
 * is not resolvable in Vue templates, a recorded deviation).
 */
const DataTable = DataTableSfc as typeof DataTableSfc & {
  classes: typeof dataTableClasses;
  Search: typeof DataTableSearch;
  ColumnsPanel: typeof DataTableColumnsPanel;
  Pagination: typeof DataTablePagination;
  SelectionBar: typeof DataTableSelectionBar;
};

DataTable.classes = dataTableClasses;
DataTable.Search = DataTableSearch;
DataTable.ColumnsPanel = DataTableColumnsPanel;
DataTable.Pagination = DataTablePagination;
DataTable.SelectionBar = DataTableSelectionBar;

// Ordered by module path, which is what the lint rule sorts on — grouping the exports by concept
// is not available here, so the concepts are catalogued in docs/api.md instead.
export { DataTableColumnsPanel } from "./columns-panel";
export type { DataTableColumnsPanelProps } from "./columns-panel";
export { toCsv } from "./csv";

export type { ToCsvOptions } from "./csv";
export { DataTable };
export default DataTable;
export type {
  DataTableBaseProps,
  DataTableCssVariables,
  DataTableProps,
  DataTableStylesNames
} from "./data-table-types";
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
