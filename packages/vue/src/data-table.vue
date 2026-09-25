<script setup lang="ts" generic="TData extends RowData">
import type { MaybeRefOrGetter, Ref, VNodeChild } from "vue";
import type { Virtualizer } from "@tanstack/vue-virtual";
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
import type { ColumnWindowView } from "./use-column-window";
import type {
  Column,
  DataTableEditingCell,
  DataTableHandle,
  DataTableScrollOptions,
  Row,
  TableInstance,
  VueContent
} from "./types";

/**
 * The root component (docs/api.md): adaptive sizing (the root is a flex column that fills its
 * parent; the internal scroller is the only elastic region), CSS-variable column geometry,
 * infinite loading, pinned-edge shadows, the built-in pagination bar, and the imperative
 * handle. The full Styles API rides `get-styles.ts` (provided to the tree under its own key —
 * the render context carries no `getStyles` field).
 *
 * Sugar mode (`data`/`columns` inline) and hook mode (`table`) render through the same core;
 * the OPTION_KEYS partition routes sugar-mode props into `useDataTable` when `table` is
 * absent. Controlled slices resolve through BOTH halves of the Vue contract: the
 * `onXChange` props, and the `update:x` events `v-model:x` compiles to.
 */
import { computed, reactive, ref, toValue, useId, watch, watchEffect } from "vue";
import type { FunctionalComponent } from "vue";

import { isInternalColumn } from "./build-columns";
import { LedgerButton, LedgerSpinner } from "./controls";
import { provideDataTableContext, type DataTableContextValue } from "./context";
import { DATA_TABLE_OPTION_KEYS, type DataTableProps } from "./data-table-types";
import { mergeElementProps } from "./element-props";
import { announcedRowName, resolveVirtualDisplayIndex, type DisplaySnapshot } from "./display-snapshot";
import { isDev, warnOnce } from "./env";
import { createGetStyles, provideGetStyles, type GetStyles } from "./get-styles";
import { resolveIcons } from "./icons";
import { resolveLabels } from "./labels";
import { ledgerCommands } from "./ledger-commands";
import { DEFAULT_PAGE_SIZE_OPTIONS, PaginationBar } from "./pagination-bar";
import { RowReorderScope, useRowReorder } from "./row-reorder";
import { DEFAULT_SIZE, SIZES, type LedgerSize } from "./size";
import { countDisplayRows, TableBody, type VirtualizationConfig } from "./table-body";
import { TableFooter, tableHasFooter, visibleFooterGroups } from "./table-footer";
import { TableHeader } from "./table-header";
import { useColumnWidths } from "./use-column-widths";
import { DEFAULT_COLUMN_OVERSCAN, useColumnWindow } from "./use-column-window";
import { useDataTable } from "./use-data-table";
import { columnAfterVar, columnStartVar, columnWidthVar, toPx } from "./utils";

// ------------------------------------------------------------------------------------------------
// Props and events
// ----------------------------------------------------------------------------------------------

// The full surface is declared (array form — the intersection type is too large for the SFC
// compiler's type extraction) and cast to the typed shape. Every key optional: sugar mode and
// hook mode share the one declaration.
const props = defineProps({
  // Hyphenated keys: declared (not fallthrough) so the ARIA name reaches the role="table"
  // element, and read back under the same keys.
  "aria-label": { type: null },
  "aria-labelledby": { type: null },
  "aria-describedby": { type: null },
  classNames: { type: null },
  styles: { type: null },
  className: { type: null },
  style: { type: null },
  attributes: { type: null },
  striped: { type: Boolean, default: undefined },
  stripedColor: { type: null },
  highlightOnHover: { type: Boolean, default: undefined },
  highlightOnHoverColor: { type: null },
  withTableBorder: { type: Boolean, default: undefined },
  withColumnBorders: { type: Boolean, default: undefined },
  withRowBorders: { type: Boolean, default: undefined },
  withBottomBorder: { type: Boolean, default: undefined },
  borderColor: { type: null },
  radius: { type: null },
  size: { type: null },
  verticalSpacing: { type: null },
  horizontalSpacing: { type: null },
  tabularNums: { type: Boolean, default: undefined },
  colorScheme: { type: null },
  tableMinWidth: { type: null },
  virtualizedRows: { type: [Boolean, Object], default: undefined },
  virtualizedColumns: { type: [Boolean, Object], default: undefined },
  onEndReached: { type: null },
  endReachedOffset: { type: null },
  loadingMore: { type: Boolean, default: undefined },
  loadMoreError: { type: null },
  loading: { type: Boolean, default: undefined },
  emptyState: { type: null },
  error: { type: null },
  onRetry: { type: null },
  withColumnHeaders: { type: Boolean, default: undefined },
  withPaginationBar: { type: Boolean, default: undefined },
  pageSizeOptions: { type: null },
  onRowClick: { type: null },
  onRowActivate: { type: null },
  onRowDoubleClick: { type: null },
  onRowContextMenu: { type: null },
  rowProps: { type: null },
  headerRowProps: { type: null },
  footerRowProps: { type: null },
  viewportProps: { type: null },
  labels: { type: null },
  icons: { type: null },
  handleRef: { type: null },
  table: { type: null },
  data: { type: null },
  columns: { type: null },
  getRowId: { type: null },
  enableSorting: { type: Boolean, default: undefined },
  enableMultiSort: { type: Boolean, default: undefined },
  enableSortingRemoval: { type: Boolean, default: undefined },
  enableColumnFilters: { type: Boolean, default: undefined },
  enableGlobalFilter: { type: Boolean, default: undefined },
  enablePagination: { type: Boolean, default: undefined },
  enableRowSelection: { type: [Boolean, Function], default: undefined },
  enableMultiRowSelection: { type: Boolean, default: undefined },
  enableColumnResizing: { type: Boolean, default: undefined },
  enableColumnPinning: { type: Boolean, default: undefined },
  enableColumnOrdering: { type: Boolean, default: undefined },
  enableHiding: { type: Boolean, default: undefined },
  enableEditing: { type: Boolean, default: undefined },
  enableGrouping: { type: Boolean, default: undefined },
  enableRowPinning: { type: Boolean, default: undefined },
  enableCellSpanning: { type: Boolean, default: undefined },
  getSubRows: { type: null },
  renderDetailPanel: { type: null },
  selectionColumn: { type: null },
  expanderColumn: { type: null },
  sortingMode: { type: null },
  filterMode: { type: null },
  paginationMode: { type: null },
  rowCount: { type: null },
  editTrigger: { type: null },
  editMode: { type: null },
  onEditCommit: { type: null },
  onRowEditCommit: { type: null },
  enableActiveRow: { type: Boolean, default: undefined },
  enableRowOrdering: { type: Boolean, default: undefined },
  onRowReorder: { type: null },
  rowDragColumn: { type: null },
  sorting: { type: null },
  defaultSorting: { type: null },
  onSortingChange: { type: null },
  columnFilters: { type: null },
  defaultColumnFilters: { type: null },
  onColumnFiltersChange: { type: null },
  globalFilter: { type: null },
  defaultGlobalFilter: { type: null },
  onGlobalFilterChange: { type: null },
  pagination: { type: null },
  defaultPagination: { type: null },
  onPaginationChange: { type: null },
  rowSelection: { type: null },
  defaultRowSelection: { type: null },
  onRowSelectionChange: { type: null },
  expanded: { type: null },
  defaultExpanded: { type: null },
  onExpandedChange: { type: null },
  columnVisibility: { type: null },
  defaultColumnVisibility: { type: null },
  onColumnVisibilityChange: { type: null },
  columnPinning: { type: null },
  defaultColumnPinning: { type: null },
  onColumnPinningChange: { type: null },
  columnOrder: { type: null },
  defaultColumnOrder: { type: null },
  onColumnOrderChange: { type: null },
  columnSizing: { type: null },
  defaultColumnSizing: { type: null },
  onColumnSizingChange: { type: null },
  grouping: { type: null },
  defaultGrouping: { type: null },
  onGroupingChange: { type: null },
  rowPinning: { type: null },
  defaultRowPinning: { type: null },
  onRowPinningChange: { type: null },
  activeRowId: { type: null },
  defaultActiveRowId: { type: null },
  onActiveRowIdChange: { type: null },
  editingCell: { type: null },
  onEditingCellChange: { type: null },
  editingRowId: { type: null },
  onEditingRowIdChange: { type: null },
  persistState: { type: null },
  defaultColumn: { type: null },
  filterFns: { type: null },
  tableOptions: { type: null }
}) as unknown as DataTableProps<TData>;

/**
 * The `v-model:x` half of every controlled slice. The `onXChange` props stay the canonical
 * callbacks (resolved values, never updaters); these events carry the same resolved value to
 * whatever `v-model:x` compiled to.
 */
const emit = defineEmits<{
  "update:sorting": [value: SortingState];
  "update:columnFilters": [value: ColumnFiltersState];
  "update:globalFilter": [value: string];
  "update:pagination": [value: PaginationState];
  "update:rowSelection": [value: RowSelectionState];
  "update:expanded": [value: ExpandedState];
  "update:columnVisibility": [value: ColumnVisibilityState];
  "update:columnPinning": [value: ColumnPinningState];
  "update:columnOrder": [value: ColumnOrderState];
  "update:columnSizing": [value: ColumnSizingState];
  "update:grouping": [value: GroupingState];
  "update:rowPinning": [value: RowPinningState];
  "update:activeRowId": [value: string | null];
  "update:editingCell": [value: DataTableEditingCell | null];
  "update:editingRowId": [value: string | null];
}>();

// The OPTION_KEYS partition (data-table-types.ts) is realized by the explicit options object
// above: behavior keys route into `useDataTable` (sugar mode) or their `v-model` halves,
// presentation keys stay on the component.

// ------------------------------------------------------------------------------------------------
// Mode routing — hook instance, or the sugar options partitioned into useDataTable
// ----------------------------------------------------------------------------------------------

const table = props.table
  ? props.table
  : useDataTable<TData>({
      data: () => toValue(props.data!),
      columns: () => toValue(props.columns!),
      getRowId: props.getRowId,
      enableSorting: props.enableSorting,
      enableMultiSort: props.enableMultiSort,
      enableSortingRemoval: props.enableSortingRemoval,
      enableColumnFilters: props.enableColumnFilters,
      enableGlobalFilter: props.enableGlobalFilter,
      enablePagination: props.enablePagination,
      enableRowSelection: props.enableRowSelection,
      enableMultiRowSelection: props.enableMultiRowSelection,
      enableColumnResizing: props.enableColumnResizing,
      enableColumnPinning: props.enableColumnPinning,
      enableColumnOrdering: props.enableColumnOrdering,
      enableHiding: props.enableHiding,
      enableEditing: props.enableEditing,
      enableGrouping: props.enableGrouping,
      enableRowPinning: props.enableRowPinning,
      enableCellSpanning: props.enableCellSpanning,
      getSubRows: props.getSubRows,
      renderDetailPanel: props.renderDetailPanel,
      selectionColumn: props.selectionColumn,
      expanderColumn: props.expanderColumn,
      sortingMode: props.sortingMode,
      filterMode: props.filterMode,
      paginationMode: props.paginationMode,
      rowCount: () => toValue(props.rowCount),
      editTrigger: props.editTrigger,
      editMode: props.editMode,
      onEditCommit: props.onEditCommit,
      onRowEditCommit: props.onRowEditCommit,
      enableActiveRow: props.enableActiveRow,
      enableRowOrdering: props.enableRowOrdering,
      onRowReorder: props.onRowReorder,
      rowDragColumn: props.rowDragColumn,
      sorting: () => toValue(props.sorting),
      defaultSorting: props.defaultSorting,
      onSortingChange: value => {
        emit("update:sorting", value);
        props.onSortingChange?.(value);
      },
      columnFilters: () => toValue(props.columnFilters),
      defaultColumnFilters: props.defaultColumnFilters,
      onColumnFiltersChange: value => {
        emit("update:columnFilters", value);
        props.onColumnFiltersChange?.(value);
      },
      globalFilter: () => toValue(props.globalFilter),
      defaultGlobalFilter: props.defaultGlobalFilter,
      onGlobalFilterChange: value => {
        emit("update:globalFilter", value);
        props.onGlobalFilterChange?.(value);
      },
      pagination: () => toValue(props.pagination),
      defaultPagination: props.defaultPagination,
      onPaginationChange: value => {
        emit("update:pagination", value);
        props.onPaginationChange?.(value);
      },
      rowSelection: () => toValue(props.rowSelection),
      defaultRowSelection: props.defaultRowSelection,
      onRowSelectionChange: value => {
        emit("update:rowSelection", value);
        props.onRowSelectionChange?.(value);
      },
      expanded: () => toValue(props.expanded),
      defaultExpanded: props.defaultExpanded,
      onExpandedChange: value => {
        emit("update:expanded", value);
        props.onExpandedChange?.(value);
      },
      columnVisibility: () => toValue(props.columnVisibility),
      defaultColumnVisibility: props.defaultColumnVisibility,
      onColumnVisibilityChange: value => {
        emit("update:columnVisibility", value);
        props.onColumnVisibilityChange?.(value);
      },
      columnPinning: () => toValue(props.columnPinning),
      defaultColumnPinning: props.defaultColumnPinning,
      onColumnPinningChange: value => {
        emit("update:columnPinning", value);
        props.onColumnPinningChange?.(value);
      },
      columnOrder: () => toValue(props.columnOrder),
      defaultColumnOrder: props.defaultColumnOrder,
      onColumnOrderChange: value => {
        emit("update:columnOrder", value);
        props.onColumnOrderChange?.(value);
      },
      columnSizing: () => toValue(props.columnSizing),
      defaultColumnSizing: props.defaultColumnSizing,
      onColumnSizingChange: value => {
        emit("update:columnSizing", value);
        props.onColumnSizingChange?.(value);
      },
      grouping: () => toValue(props.grouping),
      defaultGrouping: props.defaultGrouping,
      onGroupingChange: value => {
        emit("update:grouping", value);
        props.onGroupingChange?.(value);
      },
      rowPinning: () => toValue(props.rowPinning),
      defaultRowPinning: props.defaultRowPinning,
      onRowPinningChange: value => {
        emit("update:rowPinning", value);
        props.onRowPinningChange?.(value);
      },
      activeRowId: () => toValue(props.activeRowId),
      defaultActiveRowId: props.defaultActiveRowId,
      onActiveRowIdChange: value => {
        emit("update:activeRowId", value);
        props.onActiveRowIdChange?.(value);
      },
      editingCell: () => toValue(props.editingCell),
      onEditingCellChange: value => {
        emit("update:editingCell", value);
        props.onEditingCellChange?.(value);
      },
      editingRowId: () => toValue(props.editingRowId),
      onEditingRowIdChange: value => {
        emit("update:editingRowId", value);
        props.onEditingRowIdChange?.(value);
      },
      persistState: props.persistState,
      defaultColumn: props.defaultColumn,
      filterFns: props.filterFns,
      tableOptions: props.tableOptions
    });

const erasedTable = table as TableInstance<any>;

// The React edition's sugar/hook XOR is compile-time; here it is a dev-time check: behavior
// options beside `table` would be silently dead — the hook instance owns the behavior.
if (isDev && props.table) {
  const deadKeys = DATA_TABLE_OPTION_KEYS.filter(
    key => props[key as keyof DataTableProps<TData>] !== undefined
  );

  if (deadKeys.length > 0) {
    warnOnce(
      "hook-mode-behavior-options",
      `Behavior options are ignored in hook mode (the table prop owns the behavior): ${deadKeys.join(", ")}.`
    );
  }
}

// ------------------------------------------------------------------------------------------------
// Styles API — resolved once, provided to the tree
// ----------------------------------------------------------------------------------------------

const resolvedGetStyles = computed(() => createGetStyles({
  classNames: props.classNames,
  styles: props.styles,
  className: props.className,
  style: props.style,
  attributes: props.attributes
}));
const getStyles: GetStyles = (selector, options) => resolvedGetStyles.value(selector, options);
provideGetStyles(getStyles);

const labels = computed(() => resolveLabels(props.labels));
const icons = computed(() => resolveIcons(props.icons));

/* ---- viewport ---- */
const viewportRef = ref<HTMLDivElement | null>(null);
const headerViewportRef = ref<HTMLDivElement | null>(null);
const footerViewportRef = ref<HTMLDivElement | null>(null);

// ---- the width engine (docs/sizing.md) ----
// Display order is pinned-aware (start + center + end) — header groups and row cells
// already render in it, so the colgroup and every width/offset must follow the same order.
const startLeafColumns = computed(() => {
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();
  table.atoms.columnPinning.get();

  return table.getStartVisibleLeafColumns();
});
const endLeafColumns = computed(() => {
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();
  table.atoms.columnPinning.get();

  return table.getEndVisibleLeafColumns();
});
const centerLeafColumns = computed(() => {
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();
  table.atoms.columnPinning.get();

  return table.getCenterVisibleLeafColumns();
});
const displayColumns = computed<Column<TData, unknown>[]>(() => [
  ...startLeafColumns.value,
  ...centerLeafColumns.value,
  ...endLeafColumns.value
]);
// Fresh numbers, never memoized off the signature: pinning the current first column changes
// neither order nor composition, yet moves the zone boundary.
const pinnedStartCount = computed(() => startLeafColumns.value.length);
const pinnedEndCount = computed(() => endLeafColumns.value.length);
const ledgerColumns = computed(() => table.options.meta?.ledger?.columns);
const visibleLeafColumns = computed(() => {
  void ledgerColumns.value; // definition swaps are covered by the meta identity

  return displayColumns.value;
});
const size = computed(() => props.size ?? DEFAULT_SIZE);
const scale = computed(() => SIZES[size.value]);
const columnWidthsResult = useColumnWidths(
  erasedTable,
  computed(() => visibleLeafColumns.value as unknown as Column<any, unknown>[]),
  viewportRef,
  () => props.tableMinWidth,
  computed(() => scale.value.injectedWidth)
);
const columnWidths = computed<{ byId: Record<string, number>; total: number }>(() =>
  toValue(columnWidthsResult as MaybeRefOrGetter<{ byId: Record<string, number>; total: number }>));

/* ---- virtualization config ---- */
const virtualization = computed<VirtualizationConfig | null>(() => {
  const value = props.virtualizedRows;

  if (!value) {
    return null;
  }

  return {
    estimateHeight: typeof value === "object" && value.estimateHeight !== undefined
      ? value.estimateHeight
      : scale.value.rowHeight,
    overscan: typeof value === "object" && value.overscan !== undefined ? value.overscan : 8
  };
});
const virtualEnabled = computed(() => virtualization.value !== null);

/* ---- column window (docs/virtualization.md#column-virtualization) ---- */
const columnVirtualizationEnabled = props.virtualizedColumns === true || typeof props.virtualizedColumns === "object";
const centerColumnIds = computed(() =>
  visibleLeafColumns.value
    .slice(pinnedStartCount.value, visibleLeafColumns.value.length - pinnedEndCount.value)
    .map(column => column.id));
const pinnedWidths = computed(() => {
  let start = 0;
  let end = 0;

  for (const [index, column] of visibleLeafColumns.value.entries()) {
    if (index < pinnedStartCount.value) {
      start += columnWidths.value.byId[column.id] ?? 0;
    } else if (index >= visibleLeafColumns.value.length - pinnedEndCount.value) {
      end += columnWidths.value.byId[column.id] ?? 0;
    }
  }

  return { start, end };
});
const columnWindowRange = useColumnWindow({
  enabled: columnVirtualizationEnabled,
  overscan: typeof props.virtualizedColumns === "object" && props.virtualizedColumns.overscan !== undefined
    ? props.virtualizedColumns.overscan
    : DEFAULT_COLUMN_OVERSCAN,
  viewport: () => viewportRef.value,
  centerColumnIds,
  widths: computed(() => columnWidths.value.byId),
  pinnedStartWidth: computed(() => pinnedWidths.value.start),
  pinnedEndWidth: computed(() => pinnedWidths.value.end)
});
const displayIndexById = computed(() =>
  new Map(visibleLeafColumns.value.map((column, index) => [column.id, index] as const)));
const columnWindow = computed<ColumnWindowView | null>(() => {
  const range = columnWindowRange.value;

  if (range === null) {
    return null;
  }

  return {
    ...range,
    centerCount: centerColumnIds.value.length,
    displayIndexById: displayIndexById.value,
    pinnedEndCount: pinnedEndCount.value,
    pinnedStartCount: pinnedStartCount.value,
    totalLeafCount: visibleLeafColumns.value.length
  };
});

// Normalized once: the prop defaults to true, so an absent value must not read as "off" at
// any of its three use sites (the context, the ARIA row numbering, the render).
const columnHeadersVisible = computed(() => props.withColumnHeaders !== false);
const filterMode = computed<"client" | "server">(() => table.options.manualFiltering ? "server" : "client");

/* The documented single TData erasure (context.ts) — the render layer below is `any`-bound. */
const ledger = computed(() => table.options.meta?.ledger);
const editing = computed(() => ledger.value?.editing);
const activeRowEnabled = computed(() => ledger.value?.activeRow.enabled === true);
const activeRowId = computed(() => ledger.value?.activeRow.id ?? null);
const setActiveRow = computed(() => ledger.value?.activeRow.set);
const subscribeColumnFilters = computed(() => ledger.value?.filtering.subscribeColumnFilters);
const commands = computed(() => ledgerCommands(ledger.value));
const selectionCommands = computed(() => commands.value?.selection);
const expansionCommands = computed(() => commands.value?.expansion);

const instanceId = useId();

// ---- column geometry: the width engine resolves every column to exact integer pixels,
// written as CSS variables (a resize updates variables, never re-renders rows) ----
const columnVars = computed<Record<string, string>>(() => {
  const varsMap: Record<string, string> = {};
  let leftOffset = 0;

  for (const column of visibleLeafColumns.value) {
    const width = columnWidths.value.byId[column.id] ?? 0;
    varsMap[columnWidthVar(column.id)] = `${width}px`;

    if (column.getIsPinned() === "start") {
      varsMap[columnStartVar(column.id)] = `${leftOffset}px`;
      leftOffset += width;
    }
  }

  let rightOffset = 0;

  for (let index = visibleLeafColumns.value.length - 1; index >= 0; index -= 1) {
    const column = visibleLeafColumns.value[index]!;

    if (column.getIsPinned() === "end") {
      varsMap[columnAfterVar(column.id)] = `${rightOffset}px`;
      rightOffset += columnWidths.value.byId[column.id] ?? 0;
    }
  }

  return varsMap;
});

// The one colgroup all three synced tables share. Under a column window the hidden center
// runs collapse into two spacer cols with the exact widths the missing columns add up to, so
// the table keeps its full scroll width and the pinned offsets stay honest.
interface ColSpec {
  key: string;
  spacer: boolean;
  width: string | undefined;
}

const colgroupSpec = computed<ColSpec[]>(() => {
  const leaf = (column: Column<any, unknown>): ColSpec => ({
    key: column.id,
    spacer: false,
    width: `var(${columnWidthVar(column.id)})`
  });

  const windowValue = columnWindow.value;

  if (windowValue === null) {
    return visibleLeafColumns.value.map(column => leaf(column as unknown as Column<any, unknown>));
  }

  const cols: ColSpec[] = [];

  for (const column of visibleLeafColumns.value.slice(0, pinnedStartCount.value)) {
    cols.push(leaf(column as unknown as Column<any, unknown>));
  }

  if (windowValue.start > 0) {
    cols.push({ key: "ledger:spacer-leading", spacer: true, width: toPx(windowValue.leadingSpace) });
  }

  for (const column of visibleLeafColumns.value
    .slice(pinnedStartCount.value + windowValue.start, pinnedStartCount.value + windowValue.end)) {
    cols.push(leaf(column as unknown as Column<any, unknown>));
  }

  if (windowValue.end < windowValue.centerCount) {
    cols.push({ key: "ledger:spacer-trailing", spacer: true, width: toPx(windowValue.trailingSpace) });
  }

  if (pinnedEndCount.value > 0) {
    for (const column of visibleLeafColumns.value.slice(-pinnedEndCount.value)) {
      cols.push(leaf(column as unknown as Column<any, unknown>));
    }
  }

  return cols;
});

/* ---- data flags ---- */
const rowsLength = computed(() => {
  table.atoms.pagination.get();
  table.atoms.sorting.get();
  table.atoms.columnFilters.get();
  table.atoms.globalFilter.get();
  table.atoms.grouping.get();
  table.atoms.expanded.get();
  table.atoms.rowPinning.get();

  return table.getRowModel().rows.length;
});
const errorActive = computed(() => Boolean(props.error) && !props.loading);
const isEmpty = computed(() => !props.loading && !errorActive.value && rowsLength.value === 0);
// Zero rows with an active filter is "nothing matched", not "no data" — a different message.
const filtersActive = computed(() => {
  const columnFilters = table.atoms.columnFilters.get();
  const globalFilter = table.atoms.globalFilter.get();

  return columnFilters.length > 0 || globalFilter !== "";
});
const paginationEnabled = computed(() => ledger.value?.enablePagination === true);
const skeletonRowCount = computed(() => Math.min(Math.max(table.atoms.pagination.get().pageSize, 3), 12));

/* ---- infinite loading ---- */
// Keyed on the data's identity, not its length: a server-side filter or sort can hand back a
// different page of the same size, and a length guard would then never re-arm. Consumers
// already keep `data` referentially stable per snapshot (docs/api.md), so a new array is
// exactly "new data".
const lastEndReachedData = ref<unknown>(null);
const currentData = computed(() => table.options.data);
const hasEndReachedHandler = computed(() => Boolean(props.onEndReached));

const maybeFireEndReached = () => {
  const element = viewportRef.value;

  // clientHeight 0 = not laid out yet; distance math would fire a phantom page load.
  if (!element || element.clientHeight === 0 || !props.onEndReached || props.loading || props.loadingMore) {
    return;
  }

  if (lastEndReachedData.value === currentData.value) {
    return;
  }

  const distance = element.scrollHeight - element.scrollTop - element.clientHeight;

  if (distance <= (props.endReachedOffset ?? 240)) {
    lastEndReachedData.value = currentData.value;
    props.onEndReached();
  }
};

watch(
  [currentData, viewportRef, () => props.loading, () => props.loadingMore, hasEndReachedHandler],
  (_values, _previous, onCleanup) => {
    // Next frame: the virtualizer's first measurement commit must settle before the
    // "content shorter than the viewport" check can mean anything.
    const frame = requestAnimationFrame(() => maybeFireEndReached());

    onCleanup(() => cancelAnimationFrame(frame));
  }
);

// Retry re-arms the once-per-data guard — the failed attempt consumed it.
const retryLoadMore = () => {
  lastEndReachedData.value = null;
  props.onEndReached?.();
};

/* ---- pinned-edge shadows ---- */
const scrollEdges = ref({ start: false, end: false });

const updateScrollEdges = () => {
  const element = viewportRef.value;

  if (!element) {
    return;
  }

  const max = element.scrollWidth - element.clientWidth;
  const offset = Math.abs(element.scrollLeft);
  const next = { start: offset > 1, end: max > 1 && offset < max - 1 };

  if (scrollEdges.value.start !== next.start || scrollEdges.value.end !== next.end) {
    scrollEdges.value = next;
  }
};

/* ---- the header and footer viewports mirror the body's horizontal scroll ---- */
const hasFooter = computed(() => {
  // Layout slices — explicit atom reads keep the footer's presence reactive.
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();

  return tableHasFooter(erasedTable);
});
// No header region means no header rows — every aria-rowindex downstream counts from 0.
const headerRowCount = computed(() => {
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();

  return columnHeadersVisible.value ? table.getHeaderGroups().length : 0;
});
const withDetailPanels = computed(() => Boolean(ledger.value?.renderDetailPanel));
const rowPinningActive = table.options.enableRowPinning === true;

/**
 * The zones this draw reads, in the shape the handlers answer from. Each read is
 * TanStack-memoized, so holding them costs nothing per scroll step.
 */
const NO_ARIA_ROWS: Array<Row<TData>> = [];
const pageRows = computed(() => {
  table.atoms.pagination.get();
  table.atoms.sorting.get();
  table.atoms.columnFilters.get();
  table.atoms.globalFilter.get();
  table.atoms.grouping.get();
  table.atoms.expanded.get();

  return table.getRowModel().rows;
});
const topRows = computed(() => {
  if (!rowPinningActive) {
    return NO_ARIA_ROWS;
  }

  table.atoms.rowPinning.get();
  table.atoms.expanded.get();

  return table.getTopRows();
});
const bottomRows = computed(() => {
  if (!rowPinningActive) {
    return NO_ARIA_ROWS;
  }

  table.atoms.rowPinning.get();
  table.atoms.expanded.get();

  return table.getBottomRows();
});
const centerRows = computed(() => {
  if (rowPinningActive) {
    table.atoms.rowPinning.get();
    table.atoms.expanded.get();

    return table.getCenterRows();
  }

  return pageRows.value;
});
// Counting, not building: this runs on every render of a component the virtualizer also
// re-renders, and three throwaway arrays per scroll step is the same O(rows) cost twice over.
const logicalDisplayRowCount = computed(() =>
  rowPinningActive
    ? countDisplayRows(topRows.value, withDetailPanels.value)
      + countDisplayRows(centerRows.value, withDetailPanels.value)
      + countDisplayRows(bottomRows.value, withDetailPanels.value)
    : countDisplayRows(pageRows.value, withDetailPanels.value));

/**
 * The leading DATA column of the display order — what names a row to a screen reader. The
 * injected columns hold controls, not identity. The first column that can actually name a row:
 * a leading display column (a row number, an actions cluster) has no accessor and would leave
 * every announcement nameless.
 */
const leadingColumn = computed<Column<TData, unknown> | null>(() =>
  visibleLeafColumns.value.find(column => !isInternalColumn(column.id) && column.accessorFn !== undefined) ?? null);

/**
 * One object so every handler answers from the same display binding. Keyed on the row models
 * themselves — sorting, filtering or paging moves the current row, changes the total, and can
 * take it off the page altogether.
 */
const displaySnapshot = computed<DisplaySnapshot<TData>>(() => ({
  bottomRows: bottomRows.value,
  centerRows: centerRows.value,
  leadingColumn: leadingColumn.value,
  ordered: rowPinningActive ? [...topRows.value, ...centerRows.value, ...bottomRows.value] : centerRows.value,
  pageRows: pageRows.value,
  topRows: topRows.value,
  withDetailPanels: withDetailPanels.value
}));

const bodyAriaRowCount = computed(() =>
  props.loading && logicalDisplayRowCount.value === 0
    ? skeletonRowCount.value
    : logicalDisplayRowCount.value + (props.loadMoreError || props.loadingMore ? 1 : 0));
// The rendered rows, not every mirrored header level — `aria-rowcount` must match the DOM.
const footerRowCount = computed(() => {
  table.atoms.columnOrder.get();
  table.atoms.columnVisibility.get();

  return visibleFooterGroups(erasedTable).length;
});
const ariaRowCount = computed(() => headerRowCount.value + bodyAriaRowCount.value + footerRowCount.value);
const footerAriaRowIndexStart = computed(() => headerRowCount.value + bodyAriaRowCount.value + 1);

const mirrorBodyScrollLeft = () => {
  const element = viewportRef.value;

  if (!element) {
    return;
  }

  for (const mirror of [headerViewportRef.value, footerViewportRef.value]) {
    if (mirror && mirror.scrollLeft !== element.scrollLeft) {
      // Assigned inside the scroll event, before paint — all regions move in the same frame.
      mirror.scrollLeft = element.scrollLeft;
    }
  }
};

watch([viewportRef, columnVars, hasFooter], () => {
  updateScrollEdges();
  mirrorBodyScrollLeft();
});

// A dominantly horizontal wheel over the header or footer belongs to the body scroller;
// vertical-leaning wheels bubble on so the page keeps scrolling naturally. Native
// non-passive listeners: preventDefault needs them.
watch([headerViewportRef, footerViewportRef], (_values, _previous, onCleanup) => {
  const regions = [headerViewportRef.value, footerViewportRef.value].filter(
    (region): region is HTMLDivElement => region !== null
  );

  if (regions.length === 0) {
    return;
  }

  const forwardWheel = (event: WheelEvent) => {
    const element = viewportRef.value;

    if (!element || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
      return;
    }

    element.scrollLeft += event.deltaX;
    // Consumed — without this the delta would also scroll a horizontal ancestor.
    event.preventDefault();
  };

  for (const region of regions) {
    region.addEventListener("wheel", forwardWheel, { passive: false });
  }

  onCleanup(() => {
    for (const region of regions) {
      region.removeEventListener("wheel", forwardWheel);
    }
  });
});

const handleScrollPositionChange = () => {
  mirrorBodyScrollLeft();
  maybeFireEndReached();
  updateScrollEdges();
};

/* ---- imperative handle ---- */
const virtualizerRef = ref<Virtualizer<HTMLDivElement, Element> | null>(null);
const handleVirtualizerChange = (value: Virtualizer<HTMLDivElement, Element> | null) => {
  virtualizerRef.value = value;
};

const scrollRowIntoView = (rowId: string, options?: DataTableScrollOptions) => {
  const virtualizer = virtualizerRef.value;

  if (virtualizer) {
    const index = resolveVirtualDisplayIndex(displaySnapshot.value, rowId);

    if (index !== null) {
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? "auto",
        behavior: options?.behavior
      });
    }

    return;
  }

  const selector = `[data-row-id="${typeof CSS === "undefined" ? rowId.replaceAll("\"", String.raw`\"`) : CSS.escape(rowId)}"]`;
  const rowElement = viewportRef.value?.querySelector<HTMLElement>(`:scope ${selector}`);

  rowElement?.scrollIntoView({
    behavior: options?.behavior,
    block: options?.align === undefined || options.align === "auto" ? "nearest" : options.align
  });
};

/**
 * The index counts through the page's own row model — the rows the table holds, before the
 * display order interleaves pinned rows and detail panels around them.
 */
const scrollIndexIntoView = (index: number, options?: DataTableScrollOptions) => {
  const rowId = displaySnapshot.value.pageRows[index]?.id;

  if (rowId !== undefined) {
    scrollRowIntoView(rowId, options);
  }
};

/**
 * Pure width-engine math, no DOM measurement: the column's center-zone offset from the same
 * prefix numbers the window uses, against the strip the pinned overlays leave visible. Works
 * with or without a column window — the target column need not be rendered to be reachable.
 */
const scrollColumnIntoView = (columnId: string, options?: DataTableScrollOptions) => {
  const element = viewportRef.value;
  const index = displayIndexById.value.get(columnId);

  if (!element || index === undefined) {
    return;
  }

  // Pinned columns are sticky — always in view, nothing to scroll.
  if (index < pinnedStartCount.value || index >= visibleLeafColumns.value.length - pinnedEndCount.value) {
    return;
  }

  let offset = 0;

  for (let i = pinnedStartCount.value; i < index; i += 1) {
    offset += columnWidths.value.byId[visibleLeafColumns.value[i]!.id] ?? 0;
  }

  const width = columnWidths.value.byId[columnId] ?? 0;
  const strip = Math.max(0, element.clientWidth - pinnedWidths.value.start - pinnedWidths.value.end);
  const current = Math.abs(element.scrollLeft);
  const align = options?.align ?? "auto";
  let target: number;

  switch (align) {
    case "start": {
      target = offset;

      break;
    }

    case "end": {
      target = offset + width - strip;

      break;
    }

    case "center": {
      target = offset + (width - strip) / 2;

      break;
    }

    default: {
      if (offset >= current && offset + width <= current + strip) {
        return;
      }

      target = offset < current ? offset : offset + width - strip;
    }
  }

  target = Math.max(0, target);
  // RTL viewports scroll into negative territory; the math above is direction-agnostic.
  const rtl = getComputedStyle(element).direction === "rtl";
  element.scrollTo({ behavior: options?.behavior, left: rtl ? -target : target });
};

/**
 * The imperative handle. Exposed to template refs (`defineExpose`) AND assigned to the
 * `handleRef` prop when one is given.
 */
const handle: DataTableHandle<TData> = {
  table,
  get viewport() {
    return viewportRef.value;
  },
  scrollToRow: scrollRowIntoView,
  scrollToIndex: scrollIndexIntoView,
  scrollToColumn: scrollColumnIntoView,
  startEditing: (rowId, columnId) => {
    const editingValue = table.options.meta?.ledger?.editing;

    if (!editingValue) {
      return;
    }

    if (editingValue.mode === "row") {
      editingValue.row.start(rowId, columnId === undefined ? undefined : { focusColumnId: columnId });
    } else if (columnId === undefined) {
      warnOnce("start-editing-column", "startEditing needs a columnId in cell mode.");
    } else {
      editingValue.start({ rowId, columnId });
    }
  },
  stopEditing: (stopOptions) => {
    const editingValue = table.options.meta?.ledger?.editing;

    if (editingValue?.mode === "row") {
      editingValue.row.stop(stopOptions);
    } else {
      editingValue?.stop(stopOptions);
    }
  }
};

defineExpose(handle);

watchEffect(() => {
  if (props.handleRef) {
    props.handleRef.value = handle;
  }
});

/* ---- active row keyboard (docs/rows.md): the body viewport is the focus stop ---- */
const activeRowAnnouncerRef = ref<HTMLSpanElement | null>(null);
const rowNavigationHintId = `${instanceId}-row-navigation`;
// The keyboard model describes the element that actually takes focus — a description is read
// out for the focused node, and the ARIA table never is one. `aria-describedby` is a global
// property that any element may carry: `generic` prohibits an accessible *name*, not a
// description, and referencing an id adds no role and owns nothing. The consumer's own
// description stays on the table; theirs on the viewport keeps the first read there.
const viewportDescribedBy = computed(() => {
  const consumer = (props.viewportProps as Record<string, unknown> | undefined)?.["aria-describedby"];

  return activeRowEnabled.value
    ? [consumer, rowNavigationHintId].filter(Boolean).join(" ")
    : (consumer as string | undefined);
});

// Runs once per change of the current row rather than once per render: the row lookup is a
// scan, and this component re-renders on every scroll step of a virtualized table.
const announceActiveRow = () => {
  const target = activeRowAnnouncerRef.value;

  if (!target) {
    return;
  }

  if (activeRowId.value === null) {
    target.textContent = "";

    return;
  }

  const { ordered, leadingColumn: leading } = displaySnapshot.value;
  const index = ordered.findIndex(row => row.id === activeRowId.value);

  if (index === -1) {
    target.textContent = "";

    return;
  }

  // Through the leading column's own accessor, never `row.getValue`: that resolves the column
  // through `row.table` — the shared core — and reads a cache the row only rebuilds when the
  // data changes (use-committed-table.ts).
  const row = ordered[index] as Row<TData>;
  const value = leading === null ? "" : String(leading.accessorFn?.(row.original, row.index) ?? "");

  target.textContent = labels.value.currentRow(value === "" ? activeRowId.value! : value, index + 1, ordered.length);
};

watch([activeRowId, activeRowEnabled, displaySnapshot, labels], () => {
  if (activeRowEnabled.value) {
    announceActiveRow();
  }
  // The snapshot is the dependency in its own right, not the row id: sorting, filtering or
  // paging changes the current row's position, the total, and even whether it is still on the
  // page, and hiding or reordering a column can rename the row without moving it.
});

const handleActiveRowKeyDown = (event: KeyboardEvent) => {
  if (!activeRowEnabled.value || !setActiveRow.value) {
    return;
  }

  // Keys inside an interactive child (an editor, a checkbox, the retry button) belong to it.
  if ((event.target as HTMLElement).closest("input, button, select, textarea, a, [contenteditable]")) {
    return;
  }

  // F2 is the one key here that needs no row list. The row it acts on is the active-row slice,
  // and where it opens is the editing controller's answer for the render that reached the
  // screen. There is no cell cursor, so the row's first editable cell is the entry point —
  // the cell to edit in cell mode, the cell to focus in row mode (docs/architecture.md).
  if (event.key === "F2") {
    const editingValue = editing.value;

    if (!editingValue || activeRowId.value === null) {
      return;
    }

    const rowMode = editingValue.mode === "row";
    const target = editingValue.firstEditable(activeRowId.value, !rowMode);

    if (target === null) {
      return;
    }

    event.preventDefault();

    if (rowMode) {
      editingValue.row.start(activeRowId.value, { focusColumnId: target });
    } else {
      editingValue.start({ rowId: activeRowId.value, columnId: target });
    }

    return;
  }

  const rows = displaySnapshot.value.ordered;

  if (rows.length === 0) {
    return;
  }

  const currentIndex = activeRowId.value === null ? -1 : rows.findIndex(row => row.id === activeRowId.value);

  const moveTo = (index: number) => {
    const row = rows[Math.min(Math.max(index, 0), rows.length - 1)];

    if (row) {
      setActiveRow.value?.(row.id);
      scrollRowIntoView(row.id);
    }
  };

  switch (event.key) {
    case "ArrowDown": {
      event.preventDefault();
      moveTo(currentIndex + 1);

      break;
    }

    case "ArrowUp": {
      event.preventDefault();
      moveTo(currentIndex - 1);

      break;
    }

    case "Home": {
      event.preventDefault();
      moveTo(0);

      break;
    }

    case "End": {
      event.preventDefault();
      moveTo(rows.length - 1);

      break;
    }

    case "Enter": {
      const row = currentIndex >= 0 ? rows[currentIndex] : null;

      // Only `onRowActivate` is input-agnostic. `onRowClick` stays literal — synthesizing a
      // MouseEvent for it would make its own type signature a lie.
      if (row && props.onRowActivate) {
        event.preventDefault();
        props.onRowActivate(row as Row<TData>, event);
      }

      break;
    }

    // The WAI-APG grid pattern's dedicated edit key. Enter is spoken for here (it activates
    // the row), which is exactly the overload F2 exists to resolve.
    // No default
  }
};

/* ---- dev guard rails ---- */
if (paginationEnabled.value && props.onEndReached) {
  warnOnce(
    "pagination-and-end-reached",
    "enablePagination and onEndReached are configured together — pagination and infinite loading are mutually exclusive."
  );
}

watch([virtualEnabled, viewportRef, rowsLength], (_values, _previous, onCleanup) => {
  if (!virtualEnabled.value || !viewportRef.value || rowsLength.value <= 50) {
    return;
  }

  // Next frame: judged only after the virtualizer's first measurement commit has painted,
  // otherwise the still-empty tbody reads as "content fits" and false-alarms.
  const frame = requestAnimationFrame(() => {
    const element = viewportRef.value;

    if (element && element.clientHeight > 0 && element.scrollHeight <= element.clientHeight + 4) {
      warnOnce(
        "virtualized-unconstrained",
        "virtualizedRows is set but the viewport is unconstrained (its height equals the content height) — give the table or an ancestor a definite height."
      );
    }
  });

  onCleanup(() => cancelAnimationFrame(frame));
});

/* ---- render-facing resolutions ---- */
const stripedMode = computed(() => props.striped === true ? "odd" : props.striped || undefined);

// Named radius presets (Mantine's getRadius scale) resolve here; any other string is a plain
// CSS length and passes through.
const RADIUS_PRESETS: Record<string, string> = {
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
  xl: "1.5rem"
};
// The size's type (docs/styling.md#size) — the classic input heights' type scale.
const FONT_SIZES: Record<LedgerSize, string> = {
  xs: "12px",
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px"
};

const resolveRadius = (radius: number | string | undefined): string | undefined => {
  if (radius === undefined) {
    return undefined;
  }

  return typeof radius === "number" ? `${radius}px` : (RADIUS_PRESETS[radius] ?? radius);
};

const rootVars = computed<Record<string, string | undefined>>(() => ({
  "--ledger-striped-color": props.stripedColor,
  "--ledger-hover-color": props.highlightOnHoverColor,
  // The frame border around header + body lives outside both tables (docs/styling.md).
  "--ledger-border-color": props.borderColor,
  // Rounds root and frame alike (docs/styling.md); absent, the stylesheet's `0` stands.
  "--ledger-radius": resolveRadius(props.radius),
  // The size's type, on the root so every table under it inherits it (docs/styling.md#size).
  "--ledger-font-size": FONT_SIZES[size.value]
}));

// Exact table width (the engine's total) — the browser never redistributes column widths;
// `border-collapse: separate` is inline because a host's unlayered `collapse` would win,
// and collapse drops borders on stuck sticky cells (docs/styling.md).
const tableStyleVars = computed(() => ({
  width: columnWidths.value.total > 0 ? `${columnWidths.value.total}px` : undefined,
  minWidth: toPx(props.tableMinWidth),
  borderCollapse: "separate" as const,
  borderSpacing: 0,
  tableLayout: "fixed" as const,
  "--ledger-cell-padding-block": `${props.verticalSpacing ?? scale.value.verticalSpacing}px`,
  "--ledger-cell-padding-inline": `${props.horizontalSpacing ?? scale.value.horizontalSpacing}px`
}));
const tableProps = computed(() => ({
  role: "presentation" as const,
  ...getStyles("table", { style: tableStyleVars.value })
}));
const rootProps = computed(() => getStyles("root", { style: { ...rootVars.value, ...columnVars.value } }));
const mainProps = computed(() => ({
  // On the element that is the table: `aria-busy` is defined for the widget whose
  // content is being updated, and the root carries no role for it to qualify.
  "aria-busy": props.loading || undefined,
  "aria-colcount": columnWindow.value === null ? undefined : columnWindow.value.totalLeafCount,
  // Vue normalizes declared prop keys to camelCase at runtime ("aria-label" → ariaLabel),
  // so the reads must use the runtime key even though the declared (type-level) key is the
  // hyphenated attribute spelling.
  "aria-describedby": (props as unknown as { ariaDescribedby?: string }).ariaDescribedby,
  "aria-label": (props as unknown as { ariaLabel?: string }).ariaLabel,
  "aria-labelledby": (props as unknown as { ariaLabelledby?: string }).ariaLabelledby,
  "aria-rowcount": virtualEnabled.value ? ariaRowCount.value : undefined,
  role: "table" as const,
  ...getStyles("main")
}));
const headerProps = computed(() => getStyles("header"));
const footerProps = computed(() => getStyles("footer"));
const scrollerProps = computed(() => {
  // overscroll-behavior: none — rubber-band overscroll translates the body past its
  // clamped scroll position, which the mirrored header/footer can never follow; the
  // regions shear apart for the duration of the bounce.
  const scrollerStyles = getStyles("scroller");

  return mergeElementProps(
    props.viewportProps as Record<string, unknown> | undefined,
    {
      ...scrollerStyles,
      style: { overscrollBehavior: "none" as const, ...(scrollerStyles.style ?? {}) },
      onScroll: handleScrollPositionChange,
      // With the active row on, the body viewport is the keyboard focus stop, and it
      // carries the description of the keyboard model (`rowNavigationHintId`, composed
      // after any the consumer passed). Deliberately unnamed: this div is `generic`, a
      // role that prohibits an accessible name, and it cannot take a role either —
      // that would break `table`'s owned rows.
      "aria-describedby": viewportDescribedBy.value,
      ...(activeRowEnabled.value ? { tabindex: 0, onKeydown: handleActiveRowKeyDown } : {})
    }
  );
});
const emptyProps = computed(() => getStyles("empty"));

// A template cannot carry the TypeScript cast, so the node-tailed `error` prop resolves here.
const errorContent = computed<VueContent | null>(() =>
  props.error && props.error !== true ? (props.error as VueContent) : null);

// Mantine styled the EmptyState title as a headline (bright, 600) for full-page empties; a
// bare table caption reads better dimmed.
const EMPTY_TITLE_STYLE = { color: "var(--ledger-color-dimmed)", fontWeight: "500" } as const;
const EMPTY_BLOCK_STYLE = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  textAlign: "center"
} as const;

/* ---- row reordering session (docs/rows.md#row-ordering) ---- */
const rowOrderingEnabled = computed(() => ledger.value?.rowOrdering.enabled === true);

// The same naming the active-row announcement uses — the leading column's own accessor over
// the committed row — falling back to the row id rather than announcing a nameless lift.
const nameReorderRow = (row: Row<TData>) => announcedRowName(row, displaySnapshot.value.leadingColumn);
const centerRowsForReorder = () => displaySnapshot.value.centerRows;
const scrollReorderTargetIntoView = (rowId: string) => scrollRowIntoView(rowId);

const rowReorder = useRowReorder<TData>({
  onRowReorder: reorder => {
    ledger.value?.rowOrdering.onRowReorder?.(reorder);
  },
  get labels() {
    return labels.value;
  },
  viewportRef: viewportRef as Ref<HTMLElement | null>,
  getCenterRows: centerRowsForReorder,
  nameRow: nameReorderRow,
  scrollToRow: scrollReorderTargetIntoView
});

const reorderSourceId = computed(() => rowOrderingEnabled.value ? rowReorder.sourceId.value : null);
const reorderTarget = computed(() => rowOrderingEnabled.value ? rowReorder.target.value : null);

/* ---- the render context ---- */
const contextValue = reactive({
  instanceId,
  get labels() {
    return labels.value;
  },
  get icons() {
    return icons.value;
  },
  get size() {
    return size.value;
  },
  get filterMode() {
    return filterMode.value;
  },
  get virtualizedRows() {
    return virtualEnabled.value;
  },
  get withColumnHeaders() {
    return columnHeadersVisible.value;
  },
  get activeRowEnabled() {
    return activeRowEnabled.value;
  },
  get setActiveRow() {
    return setActiveRow.value;
  },
  get rowReorderKeyboard() {
    return rowOrderingEnabled.value ? rowReorder.keyboard : undefined;
  },
  get selection() {
    return selectionCommands.value;
  },
  get expansion() {
    return expansionCommands.value;
  },
  get subscribeColumnFilters() {
    return subscribeColumnFilters.value;
  },
  // Handlers stay raw: Vue's identity churn does not cascade (context.ts).
  get onRowClick() {
    return props.onRowClick as DataTableContextValue["onRowClick"];
  },
  get onRowActivate() {
    return props.onRowActivate as DataTableContextValue["onRowActivate"];
  },
  get onRowDoubleClick() {
    return props.onRowDoubleClick as DataTableContextValue["onRowDoubleClick"];
  },
  get onRowContextMenu() {
    return props.onRowContextMenu as DataTableContextValue["onRowContextMenu"];
  },
  get rowProps() {
    return props.rowProps as DataTableContextValue["rowProps"];
  },
  get headerRowProps() {
    return props.headerRowProps as DataTableContextValue["headerRowProps"];
  },
  get footerRowProps() {
    return props.footerRowProps as DataTableContextValue["footerRowProps"];
  }
}) as DataTableContextValue;

provideDataTableContext(contextValue);

/** Renders pre-built content (empty/error states) through a stable host. */
const ContentHost: FunctionalComponent<{ source: () => VNodeChild }> = (hostProps) => hostProps.source();
ContentHost.props = ["source"];
</script>

<template>
  <div
    :data-color-scheme="props.colorScheme"
    :data-empty="isEmpty || undefined"
    :data-error="errorActive || undefined"
    :data-highlight-on-hover="props.highlightOnHover || undefined"
    :data-loading="props.loading || undefined"
    :data-scrolled-end="scrollEdges.end || undefined"
    :data-scrolled-start="scrollEdges.start || undefined"
    :data-size="size"
    :data-striped="stripedMode"
    :data-virtualized-columns="columnWindow !== null || undefined"
    :data-virtualized-rows="virtualEnabled || undefined"
    :data-with-bottom-border="props.withBottomBorder || undefined"
    :data-with-column-borders="props.withColumnBorders || undefined"
    :data-with-footer="hasFooter || undefined"
    :data-with-row-borders="props.withRowBorders !== false || undefined"
    :data-with-table-border="props.withTableBorder || undefined"
    v-bind="rootProps"
  >
    <RowReorderScope :session="rowOrderingEnabled ? rowReorder : null">
      <template v-if="activeRowEnabled">
        <!-- Focus never leaves the viewport when the arrow keys move the current row, so the
          move is visual only unless it is spoken. Written imperatively: a live region wants
          a text change, not a re-render of the table. Both of these sit outside
          `role="table"` — a table may only own rows. -->
        <span
          ref="activeRowAnnouncerRef"
          aria-live="polite"
          class="ledger-visually-hidden"
          role="status"
        />
        <!-- The text the focus stop points at. It sits out here rather than inside the
          table because `aria-describedby` resolves by id from anywhere, while a stray
          element inside `role="table"` would not. -->
        <span :id="rowNavigationHintId" class="ledger-visually-hidden">{{ labels.rowNavigation }}</span>
      </template>

      <div v-bind="mainProps">
        <div v-if="columnHeadersVisible" ref="headerViewportRef" v-bind="headerProps">
          <table v-bind="tableProps">
            <colgroup>
              <template v-for="col in colgroupSpec" :key="col.key">
                <col v-if="col.spacer" data-ledger-spacer :style="{ width: col.width }">
                <col v-else :style="{ width: col.width }">
              </template>
            </colgroup>

            <TableHeader
              :column-sizing="table.atoms.columnSizing.get()"
              :column-widths="columnWidths.byId"
              :column-window="columnWindow"
              :table="erasedTable"
            />
          </table>
        </div>

        <div ref="viewportRef" v-bind="scrollerProps">
          <table v-bind="tableProps">
            <colgroup>
              <template v-for="col in colgroupSpec" :key="col.key">
                <col v-if="col.spacer" data-ledger-spacer :style="{ width: col.width }">
                <col v-else :style="{ width: col.width }">
              </template>
            </colgroup>

            <TableBody
              :column-window="columnWindow"
              :load-more-error="props.loadMoreError ?? false"
              :loading="props.loading === true"
              :loading-more="props.loadingMore === true"
              :onLoadMoreRetry="props.onEndReached ? retryLoadMore : undefined"
              :onVirtualizerChange="handleVirtualizerChange"
              :reorder-source-id="reorderSourceId"
              :reorder-target="reorderTarget"
              :skeleton-row-count="skeletonRowCount"
              :table="erasedTable"
              :viewport-ref="viewportRef"
              :virtualization="virtualization"
            />
          </table>

          <div
            v-if="isEmpty"
            v-bind="emptyProps"
            :data-variant="filtersActive ? 'no-results' : 'no-data'"
            role="status"
          >
            <!-- Polite, not assertive: filtering a table down to nothing is worth announcing,
              but it must not interrupt the typing that caused it. -->
            <ContentHost v-if="props.emptyState" :source="() => props.emptyState" />
            <div v-else :style="EMPTY_BLOCK_STYLE">
              <component
                :is="filtersActive ? icons.noResults : icons.empty"
                :size="40"
                :stroke-width="1.5"
              />
              <span :style="EMPTY_TITLE_STYLE">{{ filtersActive ? labels.noResults : labels.empty }}</span>
            </div>
          </div>

          <div
            v-if="errorActive"
            v-bind="emptyProps"
            :data-over-rows="rowsLength > 0 || undefined"
            data-variant="error"
            role="alert"
          >
            <div :style="EMPTY_BLOCK_STYLE">
              <component :is="icons.error" :size="40" :stroke-width="1.5" />
              <span :style="EMPTY_TITLE_STYLE">
                <template v-if="props.error === true">{{ labels.error }}</template>
                <ContentHost v-else-if="errorContent" :source="() => errorContent" />
              </span>
              <LedgerButton v-if="props.onRetry" size="xs" variant="light" @click="props.onRetry()">
                <component :is="icons.retry" :size="14" />
                {{ labels.retry }}
              </LedgerButton>
            </div>
          </div>
        </div>

        <div v-if="hasFooter" ref="footerViewportRef" v-bind="footerProps">
          <table v-bind="tableProps">
            <colgroup>
              <template v-for="col in colgroupSpec" :key="col.key">
                <col v-if="col.spacer" data-ledger-spacer :style="{ width: col.width }">
                <col v-else :style="{ width: col.width }">
              </template>
            </colgroup>

            <TableFooter
              :ariaRowIndexStart="virtualEnabled ? footerAriaRowIndexStart : undefined"
              :column-window="columnWindow"
              :table="erasedTable"
            />
          </table>
        </div>
      </div>

      <div v-if="props.loading && rowsLength > 0" class="ledger-loading-overlay">
        <LedgerSpinner />
      </div>

      <PaginationBar
        v-if="paginationEnabled && props.withPaginationBar !== false"
        :page-size-options="props.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS"
        :table="erasedTable"
      />
    </RowReorderScope>
  </div>
</template>
