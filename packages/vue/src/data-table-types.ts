import type { HTMLAttributes, Ref } from "vue";
import type { RowData } from "@tanstack/vue-table";

import type { DataAttributes, DataTableElementProps } from "./element-props";
import type { DataTableStylesNames } from "./get-styles";
import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { LedgerSize } from "./size";
import type {
  DataTableHandle,
  HeaderGroup,
  LedgerTrProps,
  Row,
  TableInstance,
  UseDataTableOptions,
  VueContent
} from "./types";

/**
 * The root component's presentation props (docs/api.md), split out of the SFC because `.vue`
 * files export only their default component. Colors are plain CSS values in this edition
 * (a documented deviation: no theme resolver); `radius` takes a number (px), a named preset
 * (`"sm"` / `"md"` / `"lg"` / `"xl"`), or any CSS length.
 */
export interface DataTableBaseProps<TData extends RowData> {
  /* Styles API (docs/styling.md) */
  classNames?: Partial<Record<DataTableStylesNames, string>>;
  styles?: Partial<Record<DataTableStylesNames, Partial<CSSStyleDeclaration>>>;
  className?: string;
  style?: Record<string, string | number | undefined>;
  attributes?: Record<string, string | number | boolean>;

  // Table appearance (forwarded names; striped/hover are rendered by ledger itself
  // through the --ledger-row-bg pipeline so pinned cells always cover them)
  striped?: boolean | "odd" | "even";
  stripedColor?: string;
  highlightOnHover?: boolean;
  highlightOnHoverColor?: string;
  withTableBorder?: boolean;
  withColumnBorders?: boolean;
  withRowBorders?: boolean;
  /**
   * The closing line under the last row — and under a footer — for a table that stands alone
   * without a frame. The last row is otherwise left open, so this is off by default; the
   * `withTableBorder` frame closes the table itself and ignores it (docs/styling.md#borders).
   */
  withBottomBorder?: boolean;
  borderColor?: string;
  /**
   * Corner radius of the table box — header, body, and footer as one rounded, clipping box;
   * the `withTableBorder` frame follows it, so a framed table can be its own card.
   */
  radius?: number | string;
  /**
   * The table's size (docs/styling.md#size): the type, the cell padding, a row's height and
   * the size of every control drawn in a cell, as one size — `sm` by default. The two spacing
   * props override the size's padding when set.
   */
  size?: LedgerSize;
  verticalSpacing?: number;
  horizontalSpacing?: number;
  tabularNums?: boolean;
  /**
   * Pins the color scheme; omitted, the table follows the OS preference.
   */
  colorScheme?: "light" | "dark";

  /* Layout */
  tableMinWidth?: number | string;

  /* Scale */
  /**
   * Row virtualization ([virtualization.md](../docs/virtualization.md)): the body renders a
   * measured window of rows between two spacer rows.
   */
  virtualizedRows?: boolean | { estimateHeight?: number; overscan?: number };
  /**
   * Column virtualization ([virtualization.md](../docs/virtualization.md#column-virtualization)):
   * the center zone renders a windowed slice of columns between two spacer cols; pinned columns
   * stay mounted. Widths are the width engine's exact pixels, so there is nothing to estimate.
   */
  virtualizedColumns?: boolean | { overscan?: number };
  onEndReached?: () => void;
  endReachedOffset?: number;
  loadingMore?: boolean;
  /**
   * The last `onEndReached` load failed — replaces the trailing loader row with the message
   * (`true` uses `labels.loadMoreError`) and a retry button that fires `onEndReached` again.
   */
  loadMoreError?: boolean | VueContent;

  /* State presentation */
  loading?: boolean;
  emptyState?: VueContent;
  /**
   * Loading the data failed — shows an error panel over the body (`true` uses `labels.error`;
   * a node replaces the message). Takes precedence over the empty state.
   */
  error?: boolean | VueContent;
  /**
   * Renders a retry button in the error panel.
   */
  onRetry?: () => void;

  /* Chrome */
  /**
   * Renders the column header region. Turning it off takes the header's own affordances with
   * it — sort controls, filter popovers, resize handles, drag reordering — so name the table
   * some other way ([accessibility.md](../docs/accessibility.md)).
   */
  withColumnHeaders?: boolean;
  withPaginationBar?: boolean;
  pageSizeOptions?: number[];

  /* Row interaction */
  /**
   * A literal primary click on the row. Pointer-only by definition — reach for `onRowActivate`
   * when the intent is "the user chose this row", so the keyboard reaches it too.
   */
  onRowClick?: (row: Row<TData>, event: MouseEvent) => void;
  /**
   * The row was activated, whatever the input device: a primary click, or `Enter` on the
   * current row while `enableActiveRow` is on ([rows.md](../docs/rows.md#active-row)).
   */
  onRowActivate?: (row: Row<TData>, event: MouseEvent | KeyboardEvent) => void;
  onRowDoubleClick?: (row: Row<TData>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<TData>, event: MouseEvent) => void;

  /* DOM escape hatches (docs/styling.md#dom-props) */
  /**
   * DOM props for every data row — static, or per row. Synthetic rows (detail panels, loader
   * and skeleton rows) have no `Row` subject and never receive them.
   */
  rowProps?: DataTableElementProps<LedgerTrProps, Row<TData>>;
  /**
   * DOM props for every header row — static, or per header group (grouped columns render one
   * row per level).
   */
  headerRowProps?: DataTableElementProps<LedgerTrProps, HeaderGroup<TData>>;
  /**
   * DOM props for every footer row — static, or per footer group.
   */
  footerRowProps?: DataTableElementProps<LedgerTrProps, HeaderGroup<TData>>;
  /**
   * DOM props for the internal scroll viewport — `onScroll`, `data-*`, extra styles. ledger
   * owns its scroll listener, its overscroll behavior and (with `enableActiveRow`) its
   * keyboard handling; those compose rather than being replaced.
   */
  viewportProps?: HTMLAttributes & DataAttributes;

  labels?: Partial<DataTableLabels>;

  /**
   * Replacements for the chrome's glyphs, merged over the defaults per slot (docs/styling.md#icons).
   */
  icons?: Partial<DataTableIcons>;

  /**
   * Imperative handle: `{ table, viewport, scrollToRow, scrollToIndex, scrollToColumn, startEditing, stopEditing }`.
   * A template ref on the component exposes the same object (`defineExpose`).
   */
  handleRef?: Ref<DataTableHandle<TData> | null>;
}

/**
 * The full root props. The React edition's sugar/hook XOR (`{ table }` XOR the behavior
 * options) is not expressible in SFC props, so every key is optional and the OPTION_KEYS
 * partition below routes sugar-mode props into `useDataTable` when `table` is absent.
 */
export type DataTableProps<TData extends RowData = RowData> = DataTableBaseProps<TData>
  & Partial<UseDataTableOptions<TData>>
  & { table?: TableInstance<TData> };

/**
 * Option-key partition — sugar mode splits behavior options from presentation props. The
 * compile-time exhaustiveness check of the React edition (`satisfies` + `AssertNever`) has no
 * SFC counterpart for the array-form `defineProps`, so the list lives next to the types it
 * names; additions to `UseDataTableOptions` must land here too.
 */
export const DATA_TABLE_OPTION_KEYS = [
  "data",
  "columns",
  "getRowId",
  "enableSorting",
  "enableMultiSort",
  "enableSortingRemoval",
  "enableColumnFilters",
  "enableGlobalFilter",
  "enablePagination",
  "enableRowSelection",
  "enableMultiRowSelection",
  "enableColumnResizing",
  "enableColumnPinning",
  "enableColumnOrdering",
  "enableHiding",
  "enableEditing",
  "enableGrouping",
  "enableRowPinning",
  "enableCellSpanning",
  "getSubRows",
  "renderDetailPanel",
  "selectionColumn",
  "expanderColumn",
  "enableRowOrdering",
  "onRowReorder",
  "rowDragColumn",
  "sortingMode",
  "filterMode",
  "paginationMode",
  "rowCount",
  "editTrigger",
  "editMode",
  "onEditCommit",
  "onRowEditCommit",
  "editingRowId",
  "onEditingRowIdChange",
  "enableActiveRow",
  "activeRowId",
  "defaultActiveRowId",
  "onActiveRowIdChange",
  "sorting",
  "defaultSorting",
  "onSortingChange",
  "columnFilters",
  "defaultColumnFilters",
  "onColumnFiltersChange",
  "globalFilter",
  "defaultGlobalFilter",
  "onGlobalFilterChange",
  "pagination",
  "defaultPagination",
  "onPaginationChange",
  "rowSelection",
  "defaultRowSelection",
  "onRowSelectionChange",
  "expanded",
  "defaultExpanded",
  "onExpandedChange",
  "columnVisibility",
  "defaultColumnVisibility",
  "onColumnVisibilityChange",
  "columnPinning",
  "defaultColumnPinning",
  "onColumnPinningChange",
  "columnOrder",
  "defaultColumnOrder",
  "onColumnOrderChange",
  "columnSizing",
  "defaultColumnSizing",
  "onColumnSizingChange",
  "grouping",
  "defaultGrouping",
  "onGroupingChange",
  "rowPinning",
  "defaultRowPinning",
  "onRowPinningChange",
  "editingCell",
  "onEditingCellChange",
  "persistState",
  "defaultColumn",
  "filterFns",
  "tableOptions"
] as const;
