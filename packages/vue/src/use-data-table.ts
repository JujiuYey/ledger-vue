import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  GroupingState,
  PaginationState,
  RowData,
  RowPinningState,
  RowSelectionState,
  SortingState,
  TableState,
  Updater
} from "@tanstack/vue-table";
import type { ComputedRef } from "vue";
import { computed, toValue, watch } from "vue";

import type { LedgerInternalMeta, LedgerSortingController } from "./ledger-commands";
import type { LedgerFeatures } from "./ledger-features";
import type {
  ColumnDef,
  DataTableEditingCell,
  TableInstance,
  UseDataTableOptions
} from "./types";

/**
 * The behavior core (docs/api.md): assembles the canonical v9 feature set (plus consumer
 * `filterFns`), translates `*Mode: "server"` into TanStack's manual flags, injects the
 * selection/expander columns, normalizes every state slice into the controlled/uncontrolled
 * trio, and carries ledger-private state through `table.options.meta.ledger`. Returns the bare
 * TanStack table instance.
 *
 * Vue edition: the composable runs once per component, so the reactive-critical inputs (data,
 * columns, every state slice) are read through `toValue` inside computeds and handed to the
 * adapter as refs/computeds — the adapter watches them with synchronous flushing and keeps the
 * table options in sync. Feature switches, modes, row-id/row-shape functions and injected-column
 * overrides are mount-time (a live app does not flip them per frame); the ledger meta is a
 * computed, so handler identities and slices it carries stay current.
 */
import { functionalUpdate, useTable } from "@tanstack/vue-table";

import { buildColumns, EXPANDER_COLUMN_ID, isInternalColumn, SELECTION_COLUMN_ID } from "./build-columns";
import { isDev, warnOnce } from "./env";
import { ledgerFilterFns } from "./filter-fns";
import { buildLedgerFeatures } from "./ledger-features";
import { readPersistedState, usePersistWriter } from "./persist";
import { nextSorting } from "./toggle-fns";
import { useCellEditing } from "./use-cell-editing";
import { useCommittedTable } from "./use-committed-table";
import { useInstantEditing } from "./use-instant-editing";
import { useResponsiveColumns } from "./use-responsive-columns";
import { useRowCommands } from "./use-row-commands";
import { useRowEditing } from "./use-row-editing";
import { useSlice } from "./use-slice";

/* Stable fallbacks — a fresh identity per read would defeat TanStack's memoization. */
const NO_SORTING: SortingState = [];
const NO_COLUMN_FILTERS: ColumnFiltersState = [];
const NO_ROW_SELECTION: RowSelectionState = {};
const NO_EXPANDED: ExpandedState = {};
const NO_VISIBILITY: Record<string, boolean> = {};
const NO_PINNING: ColumnPinningState = { start: [], end: [] };
const NO_COLUMN_ORDER: ColumnOrderState = [];
const NO_COLUMN_SIZING: ColumnSizingState = {};
const NO_GROUPING: GroupingState = [];
const NO_ROW_PINNING: RowPinningState = { top: [], bottom: [] };
const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 20 };

export function useDataTable<TData extends RowData>(options: UseDataTableOptions<TData>): TableInstance<TData> {
  const {
    getRowId,
    enableSorting = true,
    enableMultiSort = true,
    enableSortingRemoval = true,
    enableColumnFilters = true,
    enableGlobalFilter = false,
    enablePagination = false,
    enableRowSelection = false,
    enableMultiRowSelection = true,
    enableColumnResizing = false,
    enableColumnPinning = true,
    enableColumnOrdering = false,
    enableHiding = true,
    enableEditing = true,
    enableGrouping = false,
    enableRowPinning = false,
    enableCellSpanning = true,
    getSubRows,
    renderDetailPanel,
    selectionColumn,
    expanderColumn,
    sortingMode = "client",
    filterMode = "client",
    paginationMode = "client",
    rowCount,
    editTrigger = "double-click",
    editMode = "cell",
    onEditCommit,
    onRowEditCommit,
    enableActiveRow = false,
    enableRowOrdering = false,
    onRowReorder,
    rowDragColumn,
    persistState,
    defaultColumn,
    tableOptions
  } = options;

  /* ---- the feature set: canonical modules + the consumer's filterFns, fixed at mount ---- */
  const features = buildLedgerFeatures(options.filterFns);

  if (isDev && options.filterFns) {
    for (const filterFnId of Object.keys(ledgerFilterFns)) {
      if (Object.hasOwn(options.filterFns, filterFnId)) {
        warnOnce(
          `filterFns.${filterFnId}`,
          `filterFns.${filterFnId} is reserved by ledger and has been overridden.`
        );
      }
    }
  }

  /* ---- persistence hydrates uncontrolled slices, once, synchronously ---- */
  const persisted = readPersistedState(persistState);
  const filterSetListeners = {
    columnFilters: new Set<(value: ColumnFiltersState) => void>(),
    globalFilter: new Set<(value: string) => void>()
  };

  /* ---- state slices: controlled x / uncontrolled defaultX / observer onXChange ---- */
  const [sorting, setSorting] = useSlice({
    value: () => toValue(options.sorting),
    defaultValue: (persisted.sorting as SortingState | undefined) ?? options.defaultSorting,
    onChange: options.onSortingChange,
    fallback: NO_SORTING
  });
  const [columnFilters, setColumnFilters] = useSlice({
    value: () => toValue(options.columnFilters),
    defaultValue: (persisted.columnFilters as ColumnFiltersState | undefined) ?? options.defaultColumnFilters,
    onChange: options.onColumnFiltersChange,
    onSet: value => {
      for (const listener of filterSetListeners.columnFilters) {
        listener(value);
      }
    },
    fallback: NO_COLUMN_FILTERS
  });
  const [globalFilter, setGlobalFilter] = useSlice({
    value: () => toValue(options.globalFilter),
    defaultValue: (persisted.globalFilter as string | undefined) ?? options.defaultGlobalFilter,
    onChange: options.onGlobalFilterChange,
    onSet: value => {
      for (const listener of filterSetListeners.globalFilter) {
        listener(value);
      }
    },
    fallback: ""
  });
  const [pagination, setPagination] = useSlice({
    value: () => toValue(options.pagination),
    defaultValue: (persisted.pagination as PaginationState | undefined) ?? options.defaultPagination,
    onChange: options.onPaginationChange,
    fallback: DEFAULT_PAGINATION
  });
  const [rowSelection, setRowSelection] = useSlice({
    value: () => toValue(options.rowSelection),
    defaultValue: options.defaultRowSelection,
    onChange: options.onRowSelectionChange,
    fallback: NO_ROW_SELECTION
  });
  const [expanded, setExpanded] = useSlice({
    value: () => toValue(options.expanded),
    defaultValue: options.defaultExpanded,
    onChange: options.onExpandedChange,
    fallback: NO_EXPANDED
  });
  const [columnVisibility, setColumnVisibility] = useSlice({
    value: () => toValue(options.columnVisibility),
    defaultValue: (persisted.columnVisibility as Record<string, boolean> | undefined) ?? options.defaultColumnVisibility,
    onChange: options.onColumnVisibilityChange,
    fallback: NO_VISIBILITY
  });
  const [columnPinning, setColumnPinning] = useSlice({
    value: () => toValue(options.columnPinning),
    defaultValue: (persisted.columnPinning as ColumnPinningState | undefined) ?? options.defaultColumnPinning,
    onChange: options.onColumnPinningChange,
    fallback: NO_PINNING
  });
  const [columnOrder, setColumnOrder] = useSlice({
    value: () => toValue(options.columnOrder),
    defaultValue: (persisted.columnOrder as ColumnOrderState | undefined) ?? options.defaultColumnOrder,
    onChange: options.onColumnOrderChange,
    fallback: NO_COLUMN_ORDER
  });
  const [columnSizing, setColumnSizing] = useSlice({
    value: () => toValue(options.columnSizing),
    defaultValue: (persisted.columnSizing as ColumnSizingState | undefined) ?? options.defaultColumnSizing,
    onChange: options.onColumnSizingChange,
    fallback: NO_COLUMN_SIZING
  });
  const [grouping, setGrouping] = useSlice({
    value: () => toValue(options.grouping),
    defaultValue: (persisted.grouping as GroupingState | undefined) ?? options.defaultGrouping,
    onChange: options.onGroupingChange,
    fallback: NO_GROUPING
  });
  const [rowPinning, setRowPinning] = useSlice({
    value: () => toValue(options.rowPinning),
    defaultValue: options.defaultRowPinning,
    onChange: options.onRowPinningChange,
    fallback: NO_ROW_PINNING
  });
  const [editingCell, setEditingCell] = useSlice<DataTableEditingCell | null>({
    value: () => toValue(options.editingCell),
    defaultValue: undefined,
    onChange: options.onEditingCellChange,
    fallback: null
  });
  const [editingRowId, setEditingRowId] = useSlice<string | null>({
    value: () => toValue(options.editingRowId),
    defaultValue: undefined,
    onChange: options.onEditingRowIdChange,
    fallback: null
  });
  const [activeRowId, setActiveRowSlice] = useSlice<string | null>({
    value: () => toValue(options.activeRowId),
    defaultValue: options.defaultActiveRowId,
    onChange: options.onActiveRowIdChange,
    fallback: null
  });
  const setActiveRowId = (id: string | null) => setActiveRowSlice(id);
  const setNormalizedGlobalFilter = (updater: Updater<unknown>) => {
    setGlobalFilter(previous => {
      const next = functionalUpdate(updater, previous);

      return typeof next === "string" ? next : "";
    });
  };

  /* ---- editing controller (docs/editing.md) ---- */
  // Rows, definitions and the gate as the last committed render left them. Vue's reactivity has
  // no discarded renders, so the snapshot here is a cheap invariant rather than a tearing guard —
  // the sessions still answer from it, for the same reason as upstream: everything a commit
  // decides with must outlive the editor that sent it (docs/architecture.md).
  const [committed, captureCommitted] = useCommittedTable<TData>();

  const cellSession = useCellEditing<TData>({
    committed,
    editingCell,
    onEditCommit,
    setEditingCell
  });

  const instantSession = useInstantEditing<TData>({
    committed,
    onEditCommit
  });

  const rowSession = useRowEditing<TData>({
    committed,
    editingRowId,
    onRowEditCommit,
    setEditingRowId
  });

  if (isDev && editMode === "row") {
    if (options.editingCell !== undefined || options.onEditingCellChange) {
      warnOnce("row-mode-editing-cell", "editingCell is a cell-mode slice — editMode: \"row\" tracks editingRowId instead.");
    }

    if (onEditCommit) {
      warnOnce("row-mode-on-edit-commit", "onEditCommit never fires under editMode: \"row\" — use onRowEditCommit.");
    }
  }

  const [selectionCommands, expansionCommands, captureRows] = useRowCommands<TData>(setRowSelection, setExpanded);
  const sortingCommands: LedgerSortingController = {
    toggle: (spec, multi) => setSorting(previous => nextSorting(previous, spec, multi))
  };

  const subscribeColumnFilters = (listener: (value: ColumnFiltersState) => void) => {
    const listeners = filterSetListeners.columnFilters;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };
  const subscribeGlobalFilter = (listener: (value: string) => void) => {
    const listeners = filterSetListeners.globalFilter;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  };

  const selectAllScope: "page" | "all"
    = enablePagination || paginationMode === "server" ? "page" : "all";

  /* ---- columns: breakpoint filter + injected row-drag/selection/expander + meta.filter wiring ---- */
  const responsiveColumns = useResponsiveColumns(options.columns);
  const withExpander = Boolean(renderDetailPanel || getSubRows);
  // The static row-ordering gate (docs/rows.md#row-ordering): without a handler nothing could
  // apply a move — row order is data order — and tree data has no flat order to move within.
  const withRowDrag = enableRowOrdering && onRowReorder !== undefined && !getSubRows;

  if (isDev && enableRowOrdering && getSubRows) {
    warnOnce("row-ordering-tree", "enableRowOrdering supports flat data only — getSubRows disables it (docs/rows.md#row-ordering).");
  }

  const processedColumns: ComputedRef<Array<ColumnDef<TData, any>>> = computed(() => buildColumns<TData>({
    columns: responsiveColumns.value,
    withRowDrag,
    withSelection: Boolean(enableRowSelection),
    withExpander,
    rowDragColumn,
    selectionColumn,
    expanderColumn
  }));

  // The live half of the gate: while something else controls the visible order, a "reorder"
  // has no data-order meaning — the handles disable and say why (labels.rowOrderingUnavailable).
  const rowOrderable = withRowDrag
    && sorting.value.length === 0
    && columnFilters.value.length === 0
    && !globalFilter.value
    && grouping.value.length === 0;

  /* Injected columns are always pinned to the start, invisibly merged over the consumer's slice. */
  const mergedColumnPinning = computed<ColumnPinningState>(() => {
    const internal: string[] = [];

    if (enableRowSelection) {
      internal.push(SELECTION_COLUMN_ID);
    }

    if (withExpander) {
      internal.push(EXPANDER_COLUMN_ID);
    }

    const start = columnPinning.value.start.filter(id => !internal.includes(id));

    return { start: [...internal, ...start], end: columnPinning.value.end };
  });

  // The write side of that invisibility: `column.pin()` resolves against the merged state, so a
  // call on (or alongside) an injected column would land a `ledger:*` id in the consumer's slice
  // — and from there in `onColumnPinningChange` and persisted layout. Internal ids are stripped
  // from the resolved value instead.
  const setPublicColumnPinning = (updater: Updater<ColumnPinningState>) => {
    setColumnPinning(old => {
      const next = functionalUpdate(updater, old);
      const start = next.start.filter(id => !isInternalColumn(id));
      const end = next.end.filter(id => !isInternalColumn(id));

      if (start.length === next.start.length && end.length === next.end.length) {
        return next;
      }

      const unchanged = start.length === old.start.length
        && end.length === old.end.length
        && start.every((id, index) => id === old.start[index])
        && end.every((id, index) => id === old.end[index]);

      return unchanged ? old : { end, start };
    });
  };

  /* ---- dev guard rails (docs/state.md) ---- */
  if (isDev && (enableRowSelection || withExpander) && !getRowId) {
    warnOnce(
      "missing-get-row-id",
      "Row selection/expansion is enabled without getRowId — index-based row ids corrupt state across refetches."
    );
  }

  if (isDev) {
    // `columns` arriving as a fresh array identity on nearly every reactive tick would
    // re-initialize the table continuously — the Vue counterpart of the React identity churn
    // warning, one observation window instead of a render count.
    let observations = 0;
    let columnChanges = 0;
    let previousColumns: unknown = toValue(options.columns);

    watch(() => toValue(options.columns), (columns) => {
      observations += 1;

      if (columns !== previousColumns) {
        columnChanges += 1;
        previousColumns = columns;
      }

      if (observations >= 10 && columnChanges >= observations - 2) {
        warnOnce(
          "columns-identity",
          "`columns` has a new identity on almost every reactive tick — stabilize it (computed/toRef), or the table re-initializes continuously."
        );
      }
    });
  }

  /* ---- client/server translation + auto-reset policy (docs/state.md) ---- */
  const manualSorting = sortingMode === "server";
  const manualFiltering = filterMode === "server";
  const serverPagination = paginationMode === "server";
  /**
   * v9 runs the paginated row model unless the factory is absent or `manualPagination` is set.
   * The factory is part of the canonical feature set and features are read once at mount, so the
   * switch that stays reactive is this one: with pagination off every row has to reach the body,
   * which is the same short-circuit the server mode takes.
   */
  const bypassPaginatedRowModel = serverPagination || !enablePagination;

  const shouldAutoResetPageIndex
    = tableOptions?.autoResetAll ?? tableOptions?.autoResetPageIndex ?? true;
  let previousColumnFilters = columnFilters.value;
  let previousGlobalFilter = globalFilter.value;
  let previousSorting = sorting.value;

  watch([columnFilters, globalFilter, sorting], () => {
    const inputsChanged
      = previousColumnFilters !== columnFilters.value
        || previousGlobalFilter !== globalFilter.value
        || previousSorting !== sorting.value;
    previousColumnFilters = columnFilters.value;
    previousGlobalFilter = globalFilter.value;
    previousSorting = sorting.value;

    if (!serverPagination || !shouldAutoResetPageIndex || !inputsChanged) {
      return;
    }

    setPagination(previous => previous.pageIndex === 0 ? previous : { ...previous, pageIndex: 0 });
  });

  // ---- reset targets ----
  // TanStack's slice reset APIs restore `table.initialState`. The live state remains fully
  // controlled; this object exists only to preserve ledger's `defaultX`/fallback contract.
  // Persisted values stay excluded so reset remains useful after hydration.
  const resetInitialState: Partial<TableState<LedgerFeatures>> = {
    sorting: options.defaultSorting ?? NO_SORTING,
    columnFilters: options.defaultColumnFilters ?? NO_COLUMN_FILTERS,
    globalFilter: options.defaultGlobalFilter ?? "",
    pagination: options.defaultPagination ?? DEFAULT_PAGINATION,
    rowSelection: options.defaultRowSelection ?? NO_ROW_SELECTION,
    expanded: options.defaultExpanded ?? NO_EXPANDED,
    columnVisibility: options.defaultColumnVisibility ?? NO_VISIBILITY,
    columnPinning: options.defaultColumnPinning ?? NO_PINNING,
    columnOrder: options.defaultColumnOrder ?? NO_COLUMN_ORDER,
    columnSizing: options.defaultColumnSizing ?? NO_COLUMN_SIZING,
    grouping: options.defaultGrouping ?? NO_GROUPING,
    rowPinning: options.defaultRowPinning ?? NO_ROW_PINNING
  };

  /* ---- the ledger meta: a computed, so current handler identities and slices always reach
   * `table.options.meta.ledger` ---- */
  const ledger = computed<LedgerInternalMeta<TData>>(() => {
    return {
      columns: processedColumns.value,
      sorting: sortingCommands,
      selection: selectionCommands,
      expansion: expansionCommands,
      editing: {
        mode: editMode,
        cell: editingCell.value,
        active: cellSession.active,
        start: cellSession.start,
        stop: cellSession.stop,
        clear: cellSession.clear,
        commit: cellSession.commit,
        cancel: cellSession.cancel,
        moveTo: cellSession.moveTo,
        drafts: {
          error: cellSession.error,
          pending: cellSession.pending,
          read: cellSession.read,
          write: cellSession.write
        },
        register: cellSession.register,
        firstEditable: cellSession.firstEditable,
        instant: instantSession,
        // The slice is the hook's, the session is the controller's — spread so the two cannot
        // drift out of the shape `LedgerRowEditingController` declares.
        row: { id: editingRowId.value, ...rowSession }
      },
      filtering: {
        subscribeColumnFilters,
        subscribeGlobalFilter
      },
      editTrigger,
      enableEditing,
      onEditCommit,
      onRowEditCommit,
      renderDetailPanel,
      selectAllScope,
      activeRow: {
        enabled: enableActiveRow,
        id: activeRowId.value,
        set: setActiveRowId
      },
      enableColumnOrdering,
      enableColumnResizing,
      enablePagination,
      rowOrdering: {
        enabled: withRowDrag,
        orderable: withRowDrag && sorting.value.length === 0
          && columnFilters.value.length === 0
          && !globalFilter.value
          && grouping.value.length === 0,
        onRowReorder
      }
    };
  });

  /* ---- assemble: tableOptions is the base layer, ledger-managed keys override (docs/state.md) ---- */
  const managed = {
    data: computed(() => toValue(options.data)),
    columns: processedColumns,
    features,
    ...getRowId && { getRowId },
    ...defaultColumn && { defaultColumn },
    initialState: resetInitialState,
    state: computed(() => ({
      sorting: sorting.value,
      columnFilters: columnFilters.value,
      globalFilter: globalFilter.value,
      pagination: pagination.value,
      rowSelection: rowSelection.value,
      expanded: expanded.value,
      columnVisibility: columnVisibility.value,
      columnPinning: mergedColumnPinning.value,
      columnOrder: columnOrder.value,
      columnSizing: columnSizing.value,
      grouping: grouping.value,
      rowPinning: rowPinning.value
    })),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setNormalizedGlobalFilter,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnPinningChange: setPublicColumnPinning,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGroupingChange: setGrouping,
    onRowPinningChange: setRowPinning,
    enableSorting,
    enableMultiSort,
    enableSortingRemoval,
    enableColumnFilters,
    enableGlobalFilter,
    enableRowSelection,
    enableMultiRowSelection,
    enableColumnPinning,
    enableHiding,
    enableGrouping,
    enableRowPinning,
    enableCellSpanning,
    enableExpanding: withExpander || enableGrouping,
    ...getSubRows && { getSubRows },
    ...renderDetailPanel && { getRowCanExpand: () => true },
    manualSorting,
    manualFiltering,
    manualPagination: bypassPaginatedRowModel,
    ...serverPagination && rowCount !== undefined && { rowCount },
    ...serverPagination && {
      autoResetAll: undefined,
      autoResetExpanded: tableOptions?.autoResetAll ?? tableOptions?.autoResetExpanded,
      autoResetSorting: tableOptions?.autoResetAll ?? tableOptions?.autoResetSorting,
      autoResetPageIndex: false
    },
    meta: computed(() => ({ ...tableOptions?.meta, ledger: ledger.value }))
  };

  if (isDev && tableOptions) {
    for (const key of Object.keys(tableOptions)) {
      const isConsumedPaginationPolicy = serverPagination
        && (key === "autoResetAll" || key === "autoResetExpanded" || key === "autoResetSorting" || key === "autoResetPageIndex");

      if (key !== "meta" && !isConsumedPaginationPolicy && Object.hasOwn(managed, key)) {
        warnOnce(
          `tableOptions.${key}`,
          `tableOptions.${key} is managed by ledger and has been overridden — use the first-class option instead.`
        );
      }
    }
  }

  const table = useTable<LedgerFeatures, TData>({ ...tableOptions, ...managed } as never);

  /**
   * What the editing paths and the row commands answer from — the post-flush counterpart of the
   * React edition's insertion effect: after every commit-carrying update, the sessions see this
   * render's answers (docs/architecture.md). State, data and definitions are the reactive inputs
   * a row model can move for.
   */
  watch(
    [managed.state, managed.columns, managed.data],
    () => {
      captureCommitted(table, {
        enableEditing,
        hasCommitHandler: Boolean(editMode === "row" ? onRowEditCommit : onEditCommit)
      });
      captureRows(table);
    },
    { immediate: true, flush: "post" }
  );

  usePersistWriter(persistState, {
    sorting,
    columnFilters,
    globalFilter,
    pagination,
    columnVisibility,
    columnPinning,
    columnOrder,
    columnSizing,
    grouping
  });

  return table;
}
