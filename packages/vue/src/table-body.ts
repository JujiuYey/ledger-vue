import type { FunctionalComponent, Ref, VNodeChild } from "vue";
import type { Virtualizer } from "@tanstack/vue-virtual";
import type { RowData } from "@tanstack/vue-table";
import type { GetStyles } from "./get-styles";
import type { RowReorderTarget } from "./row-reorder";
import type { Cell, ColumnDef, DataTableInstantEditRenderer, Row, TableInstance, VueContent } from "./types";
import type { ColumnWindowView } from "./use-column-window";

/**
 * The body: display-row synthesis (detail panels become synthetic rows so every <tr> is exactly
 * one virtual item), spacer-row virtualization in normal table flow, sticky pinned rows, grouped
 * and aggregated cells, tree indentation, skeleton and loader rows. React edition memoized rows
 * on explicit volatile props so resizing never re-rendered them (widths and pinned offsets are
 * CSS variables); Vue edition gets the same economy from the render effect reading only what a
 * row draws — the render functions below are plain, and the per-cell render host isolates
 * renderer reactivity.
 */
import type { PropType } from "vue";
import { computed, defineComponent, h, onUnmounted, ref, toValue, watch, watchEffect } from "vue";
import { flexRender } from "@tanstack/vue-table";
import { useVirtualizer } from "@tanstack/vue-virtual";

import { columnHeaderText, EXPANDER_COLUMN_ID, isInternalColumn, ROW_DRAG_COLUMN_ID, SELECTION_COLUMN_ID } from "./build-columns";
import { canEditCell, CellEditor, RowCellEditor } from "./cell-editor";
import { useDataTableContext } from "./context";
import { cellValue, normalizeEdit } from "./edit-meta";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { useGetStyles } from "./get-styles";
import { LedgerButton, LedgerSpinner } from "./controls";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { SIZES } from "./size";
import { syncTruncationTitle } from "./truncate";
import { renderedColCount, windowRowCells } from "./use-column-window";
import { usePinnedRowOffsets } from "./use-pinned-row-offsets";
import { warnOnce } from "./env";

const TREE_INDENT_PX = 20;
const DEFAULT_ESTIMATED_ROW_HEIGHT = SIZES.sm.rowHeight;
const DEFAULT_OVERSCAN = 8;

export interface VirtualizationConfig {
  estimateHeight: number;
  overscan: number;
}

export type DisplayRow<TData extends RowData>
  = | { kind: "data"; key: string; row: Row<TData>; dataIndex: number }
    | { kind: "detail"; key: string; row: Row<TData> };

/**
 * Whether any leaf definition declares a merge — the gate that keeps span-index reads (and the
 * per-row span signature) entirely out of tables that never span.
 */
function hasSpanningColumns(columns: Array<ColumnDef<any, any>> | undefined): boolean {
  if (!columns) {
    return false;
  }

  return columns.some(column => "columns" in column && Array.isArray(column.columns)
    ? hasSpanningColumns(column.columns)
    : column.spanRows !== undefined || column.spanColumns !== undefined);
}

/**
 * One stable identity for an unoccupied pinned zone, so the display-row memos can hold.
 */
const NO_ROWS: Array<Row<any>> = [];

export function buildDisplayRows<TData extends RowData>(rows: Array<Row<TData>>, withDetailPanels: boolean): Array<DisplayRow<TData>> {
  const display: Array<DisplayRow<TData>> = [];
  let dataIndex = 0;

  for (const row of rows) {
    display.push({
      kind: "data",
      key: row.id,
      row,
      dataIndex
    });
    dataIndex += 1;

    // A grouped row's expansion reveals its children, not a panel — `renderDetailPanel` speaks
    // about a data row (docs/grouping.md#boundaries).
    if (withDetailPanels && row.getIsExpanded() && !row.getIsGrouped()) {
      display.push({
        kind: "detail",
        key: `${row.id}:detail`,
        row
      });
    }
  }

  return display;
}

/**
 * The same count without the array. `aria-rowcount` needs the number, not the rows, and building
 * three throwaway `DisplayRow[]`s per render is O(N) allocation the virtualizer then repeats on
 * every scroll range change.
 */
export function countDisplayRows<TData extends RowData>(rows: Array<Row<TData>>, withDetailPanels: boolean): number {
  if (!withDetailPanels) {
    return rows.length;
  }

  let count = rows.length;

  for (const row of rows) {
    if (row.getIsExpanded() && !row.getIsGrouped()) {
      count += 1;
    }
  }

  return count;
}

/**
 * Renders a TanStack/application renderer through a stable host component — per-cell render
 * effects without remounting (a fresh `h(() => ...)` closure per cell would change the
 * component type on every patch and tear the subtree down).
 */
const FlexRenderHost: FunctionalComponent<{ source: () => VNodeChild }> = (props) => props.source();
FlexRenderHost.props = ["source"];

// ------------------------------------------------------------------------------------------------
// Cells
// ------------------------------------------------------------------------------------------------

/**
 * Grouped cell: expander, the grouped value, and the group size.
 */
const GroupCell = defineComponent({
  name: "LedgerGroupCell",

  props: {
    cell: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as { cell: Cell<any, unknown> };
    const context = useDataTableContext();

    return () => {
      const { cell } = props;
      const { row } = cell;
      const expandedGroup = row.getIsExpanded();
      const canExpandGroup = row.getCanExpand();

      return h("span", {
        "data-group-cell": true
      }, [
        h(LedgerButton, {
          "aria-expanded": expandedGroup,
          ariaLabel: expandedGroup ? context.labels.collapseRow : context.labels.expandRow,
          "data-expanded": expandedGroup || undefined,
          size: SIZES[context.size].control,
          variant: "subtle",
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            context.expansion?.toggle(row.id, expandedGroup, canExpandGroup);
          }
        }, () => [h(context.icons.expandRow, { size: SIZES[context.size].glyph })]),

        h(FlexRenderHost, { source: () => flexRender(cell.column.columnDef.cell, cell.getContext()) }),

        h("span", { "data-group-count": true }, ["(", row.subRows.length, ")"])
      ]);
    };
  }
});

/**
 * The instant-apply host (docs/editing.md#instant-editing): a change in the cell *is* the
 * commit, so no session ever opens. A view of its target in the controller, like the editor
 * hosts are views of their session — what a commit leaves behind must survive the column being
 * hidden, a breakpoint removing it, or a virtual scroll taking the row off screen, none of
 * which are the write landing. The column's own renderer supplies the control; the host owns
 * the chrome around it — the pending loader, the failure alert, and the click fences that keep
 * `onRowClick` out.
 */
const InstantCell = defineComponent({
  name: "LedgerInstantCell",

  props: {
    cell: { type: Object, required: true },
    render: { type: Function, required: true }
  },

  setup(rawProps) {
    const props = rawProps as {
      cell: Cell<any, unknown>;
      render: DataTableInstantEditRenderer<any, unknown>;
    };
    const context = useDataTableContext();
    const getStyles: GetStyles = useGetStyles();

    // The controller's `redraw` hand-off: sessions answer through plain functions, so the tick
    // is what turns "something changed out there" into a re-render.
    const redrawTick = ref(0);
    const redraw = () => {
      redrawTick.value += 1;
    };

    // Layout, not passive: the registry is what "on screen right now" means to the target, and a
    // commit that unmounts this control is followed by microtasks — a settling write among them.
    watchEffect((onCleanup) => {
      const instant = props.cell.getContext().table.options.meta?.ledger?.editing.instant;
      const unregister = instant?.register(
        props.cell.row.id,
        props.cell.column.id,
        { redraw }
      );
      onCleanup(() => unregister?.());
    });

    return () => {
      void redrawTick.value; // a redraw re-renders this host only
      const { cell } = props;
      const instant = cell.getContext().table.options.meta?.ledger?.editing.instant;

      if (!instant) {
        return null;
      }

      const rowId = cell.row.id;
      const columnId = cell.column.id;
      const value = instant.value(rowId, columnId, cellValue(cell));
      const pending = instant.pending(rowId, columnId);
      const error = instant.error(rowId, columnId);

      return h("span", {
        "aria-busy": pending || undefined,
        "data-pending": pending || undefined,
        onClick: (event: MouseEvent) => event.stopPropagation(),
        onDblclick: (event: MouseEvent) => event.stopPropagation(),
        ...getStyles("instantCell")
      }, [
        props.render({
          row: cell.row,
          column: cell.column,
          value,
          commit: next => instant.commit(rowId, columnId, next),
          pending,
          error,
          label: context.labels.editColumn(columnHeaderText(cell.column)),
          size: SIZES[context.size].control
        }),

        // Out of flow (`instantSpinner`): the control must not move while its write is out.
        pending && h(LedgerSpinner, { ...getStyles("instantSpinner") }),
        error && h("span", { role: "alert" }, [error])
      ]);
    };
  }
});

// ------------------------------------------------------------------------------------------------
// Body
// ------------------------------------------------------------------------------------------------

export const TableBody = defineComponent({
  name: "LedgerTableBody",

  props: {
    columnWindow: { type: Object as PropType<ColumnWindowView | null>, default: null },
    loadMoreError: { type: [Boolean, Object, String] as PropType<boolean | VueContent>, default: false },
    loading: { type: Boolean, default: false },
    loadingMore: { type: Boolean, default: false },
    onLoadMoreRetry: { type: Function, default: undefined },
    onVirtualizerChange: { type: Function, default: undefined },
    reorderSourceId: { type: String as PropType<string | null>, default: null },
    reorderTarget: { type: Object as PropType<RowReorderTarget | null>, default: null },
    skeletonRowCount: { type: Number, required: true },
    table: { type: Object, required: true },
    // The parent template may hand the raw element (top-level template refs auto-unwrap) or
    // the ref itself — toValue accepts both.
    viewportRef: { type: [Object] as PropType<HTMLDivElement | null | Ref<HTMLDivElement | null>>, required: true },
    virtualization: { type: Object as PropType<VirtualizationConfig | null>, default: null }
  },

  setup(rawProps) {
    const props = rawProps as {
      table: TableInstance<any>;
      virtualization: VirtualizationConfig | null;
      columnWindow: ColumnWindowView | null;
      viewportRef: Ref<HTMLDivElement | null>;
      loading: boolean;
      loadingMore: boolean;
      loadMoreError: boolean | VueContent;
      onLoadMoreRetry?: () => void;
      /**
       * The live row-reorder session (docs/rows.md#row-ordering): the lifted row dims, the target
       * row draws the drop indicator. Both `null` while the gate is off or no drag is live.
       */
      reorderSourceId: string | null;
      reorderTarget: RowReorderTarget | null;
      skeletonRowCount: number;
      onVirtualizerChange?: (virtualizer: Virtualizer<HTMLDivElement, Element> | null) => void;
    };

    const context = useDataTableContext();
    const getStyles: GetStyles = useGetStyles();
    const table = props.table;
    const ledger = computed(() => table.options.meta?.ledger);

    const withDetailPanels = computed(() => Boolean(ledger.value?.renderDetailPanel));
    const spanningDeclared = computed(() => hasSpanningColumns(ledger.value?.columns));
    const spanningActive = computed(() =>
      spanningDeclared.value
      && props.virtualization === null
      && props.columnWindow === null
      && !withDetailPanels.value
      && table.options.enableCellSpanning !== false);

    watchEffect(() => {
      if (spanningDeclared.value && props.virtualization !== null) {
        warnOnce(
          "spanning-virtualized",
          "spanRows/spanColumns are ignored while virtualizedRows — a merged cell breaks the one-<tr>-per-virtual-item invariant."
        );
      }

      if (spanningDeclared.value && props.columnWindow !== null) {
        warnOnce(
          "spanning-virtualized-columns",
          "spanRows/spanColumns are ignored while virtualizedColumns — a merged cell would reach across the windowed colgroup."
        );
      }

      if (spanningDeclared.value && withDetailPanels.value) {
        // Spans are computed over data rows only, but a detail panel inserts a synthetic <tr>
        // between them: an unmodified rowSpan would reach across the panel while the covered cell
        // below it is still dropped, tearing the column structure apart.
        warnOnce(
          "spanning-detail-panel",
          "spanRows/spanColumns are ignored while renderDetailPanel is set — a detail row lands inside the span a merged cell would reach across."
        );
      }
    });

    const rowPinningActive = table.options.enableRowPinning === true;

    // The zone rows. Explicit atom reads front every row-model read: the models are cached over
    // the atoms, and the reads guarantee the render effect tracks the slices that move them.
    const topRows = computed(() => {
      if (!rowPinningActive) {
        return NO_ROWS;
      }

      table.atoms.rowPinning.get();
      table.atoms.expanded.get();

      return table.getTopRows();
    });
    const bottomRows = computed(() => {
      if (!rowPinningActive) {
        return NO_ROWS;
      }

      table.atoms.rowPinning.get();
      table.atoms.expanded.get();

      return table.getBottomRows();
    });
    const centerRows = computed(() => {
      table.atoms.pagination.get();
      table.atoms.sorting.get();
      table.atoms.columnFilters.get();
      table.atoms.globalFilter.get();
      table.atoms.grouping.get();
      table.atoms.expanded.get();

      if (rowPinningActive) {
        table.atoms.rowPinning.get();

        return table.getCenterRows();
      }

      return table.getRowModel().rows;
    });

    // Every zone uses the same synthesis: an expanded pinned row owns a detail item just like a
    // center row, and the sticky offset engine measures both items independently. The row arrays
    // are a sufficient key even though the synthesis reads `row.getIsExpanded()`: v9's expanded
    // row model returns the pre-expanded array while nothing is expanded and a freshly built one
    // as soon as something is, so every `expanded` transition changes identity.
    const topDisplayRows = computed(() => buildDisplayRows(topRows.value, withDetailPanels.value));
    const centerDisplayRows = computed(() => buildDisplayRows(centerRows.value, withDetailPanels.value));
    const bottomDisplayRows = computed(() => buildDisplayRows(bottomRows.value, withDetailPanels.value));
    const pinnedRowOffsets = usePinnedRowOffsets(
      () => topDisplayRows.value.length,
      () => bottomDisplayRows.value.length
    );

    /* aria-rowindex numbers header rows first (docs/virtualization.md) — none when they are off. */
    const headerRowCount = computed(() => {
      // Header groups derive from the layout slices — anchor them to the atoms.
      table.atoms.columnOrder.get();
      table.atoms.columnVisibility.get();

      return context.withColumnHeaders ? table.getHeaderGroups().length : 0;
    });

    const virtualizerRef = useVirtualizer<HTMLDivElement, Element>(computed(() => ({
      count: centerDisplayRows.value.length,
      enabled: props.virtualization !== null,
      estimateSize: () => props.virtualization?.estimateHeight ?? DEFAULT_ESTIMATED_ROW_HEIGHT,
      getItemKey: (index: number) => centerDisplayRows.value[index]?.key ?? index,
      getScrollElement: () => toValue(props.viewportRef),
      overscan: props.virtualization?.overscan ?? DEFAULT_OVERSCAN
    })));

    watch(virtualizerRef, (value) => {
      props.onVirtualizerChange?.(props.virtualization !== null ? value : null);
    }, { immediate: true });

    onUnmounted(() => {
      props.onVirtualizerChange?.(null);
    });

    // What a full-width cell (skeleton, detail panel, loader) spans — the rendered cols, spacer
    // cols included, under a column window.
    const fullWidthColSpan = computed(() => {
      table.atoms.columnOrder.get();
      table.atoms.columnVisibility.get();

      return renderedColCount(props.columnWindow, table.getVisibleLeafColumns().length);
    });
    const totalDisplayRowCount = computed(() =>
      topDisplayRows.value.length + centerDisplayRows.value.length + bottomDisplayRows.value.length);

    // ------------------------------------------------------------------------------------------------
    // Render helpers — plain functions over the setup scope; the component's render effect is
    // what re-runs them. (The React edition's row memos and their busting keys — pinKey,
    // columnsKey, spanKey, renderVersion — have no Vue counterpart to feed.)
    // ------------------------------------------------------------------------------------------------

    const pinnedStyleOf = (pinnedPosition: "top" | "bottom" | undefined, pinnedOffset: number | undefined) => {
      return pinnedPosition === "top"
        ? { top: `${pinnedOffset ?? 0}px` }
        : pinnedPosition === "bottom"
          ? { bottom: `${pinnedOffset ?? 0}px` }
          : undefined;
    };

    const renderSkeletonRows = (rowCount: number, columnCount: number, ariaRowIndexStart: number | undefined) => {
      const rows: VNodeChild[] = [];

      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const cells: VNodeChild[] = [];

        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          cells.push(h("td", {
            key: columnIndex,
            role: "cell",
            ...getStyles("cell")
          }, [
            // The Mantine Skeleton stand-in: a quiet bar. (A pulse animation is a stylesheet
            // addition away — the markup and class hooks are in place for it.)
            h("div", {
              "aria-hidden": true,
              style: {
                width: "100%",
                height: "10px",
                borderRadius: "var(--ledger-radius, 4px)",
                backgroundColor: "var(--ledger-color-gray-light)"
              }
            })
          ]));
        }

        rows.push(h("tr", {
          key: rowIndex,
          "aria-rowindex": ariaRowIndexStart === undefined ? undefined : ariaRowIndexStart + rowIndex,
          "data-last": rowIndex === rowCount - 1 || undefined,
          role: "row",
          ...getStyles("row")
        }, cells));
      }

      return rows;
    };

    const renderLoaderRow = (colSpan: number, ariaRowIndex: number | undefined) =>
      h("tr", {
        "aria-rowindex": ariaRowIndex,
        role: "row",
        ...getStyles("loaderRow")
      }, [
        h("td", { colSpan, role: "cell" }, [
          h("div", { ...getStyles("loaderRowContent") }, [
            // dots, not the oval arc: the arc's ink orbits its box, so at rest sizes it reads as
            // misaligned against the text in any single frame; the dots' mass never moves.
            h(LedgerSpinner),
            h("span", [context.labels.loadingMore])
          ])
        ])
      ]);

    const renderLoadMoreErrorRow = (
      colSpan: number,
      message: boolean | VueContent,
      ariaRowIndex: number | undefined,
      onRetry: (() => void) | undefined
    ) =>
      h("tr", {
        "data-error": true,
        "aria-rowindex": ariaRowIndex,
        role: "row",
        ...getStyles("loaderRow")
      }, [
        // The alert lives on the message, never on the cell: `role="alert"` would replace
        // `role="cell"` and leave the row with no cell in the accessibility tree.
        h("td", { colSpan, role: "cell" }, [
          h("div", { ...getStyles("loaderRowContent") }, [
            h("span", { role: "alert" }, [message === true ? context.labels.loadMoreError : message]),

            onRetry && h(LedgerButton, {
              size: "xs",
              variant: "subtle",
              onClick: onRetry
            }, () => [h(context.icons.retry, { size: 14 }), " ", context.labels.retry])
          ])
        ])
      ]);

    const renderDetailRow = (
      displayRow: DisplayRow<any> & { kind: "detail" },
      options: DisplayRowRenderOptions,
      fullWidthColSpanValue: number,
      ariaRowIndex: number | undefined,
      last: boolean
    ) => {
      const ledgerValue = ledger.value;

      return h("tr", {
        key: displayRow.key,
        ref: options.measureRef as never,
        "data-detail-row": true,
        "aria-rowindex": ariaRowIndex,
        "data-dragging": props.reorderSourceId === displayRow.row.id || undefined,
        // "After" an expanded row means after the pair — the panel travels with its row, so
        // the panel's bottom edge is where that indicator draws (docs/rows.md#row-ordering).
        "data-drop-side": props.reorderTarget?.rowId === displayRow.row.id && props.reorderTarget.side === "after"
          ? "after"
          : undefined,
        "data-index": options.virtualIndex,
        "data-last": last || undefined,
        "data-pinned-row": options.pinnedPosition,
        role: "row",
        ...getStyles("row", { style: pinnedStyleOf(options.pinnedPosition, options.pinnedOffset) })
      }, [
        h("td", { colSpan: fullWidthColSpanValue, role: "cell", ...getStyles("detailPanel") }, [
          h(FlexRenderHost, {
            source: () => ledgerValue?.renderDetailPanel?.(displayRow.row)
          })
        ])
      ]);
    };

    interface DataCellOptions {
      cell: Cell<any, unknown>;
      editing: boolean;
      /**
       * The whole row is in row-mode editing — every editable cell hosts its editor.
       */
      rowEditing: boolean;
      isFirstDataCell: boolean;
      depth: number;
      /**
       * Merged-cell extents (1 = no span); covered cells are skipped by the row, never rendered.
       */
      rowSpan: number;
      /**
       * This cell's bottom edge is the body's bottom edge — the last row's cells, or a `spanRows`
       * run that reaches it — so it draws no row separator (docs/styling.md#borders).
       */
      last: boolean;
      colSpan: number;
      /**
       * Set only under a column window: the cell's 1-based position among ALL visible leaf columns,
       * windowed-out ones included.
       */
      ariaColIndex: number | undefined;
    }

    const renderDataCell = (options: DataCellOptions): VNodeChild => {
      const { cell, editing, rowEditing, isFirstDataCell, depth, last } = options;
      const { column, row } = cell;
      const { table: cellTable } = cell.getContext();
      const cellLedger = cellTable.options.meta?.ledger;
      const editMode = cellLedger?.editing.mode ?? "cell";
      const { meta } = column.columnDef;

      const grouped = cell.getIsGrouped();
      // getIsAggregated() is true for ANY row with subRows — a grouping concept that leaks into
      // trees (getSubRows) and would swallow the expander button and the author's cell renderer
      // on every parent row. Aggregated rendering only exists on real grouping rows.
      const aggregated = cell.getIsAggregated() && row.getIsGrouped();
      const placeholder = cell.getIsPlaceholder();
      // The gate, asked in the render that has to answer it. Ending a session whose eligibility is
      // gone is a side effect, so reconciliation runs after the paint — but whether an editor is on
      // the screen is this render's own question, and this render already knows the gate is shut. Ask
      // it later and the commit that shuts the gate still paints a live editor for one frame, which
      // is a frame the user can type into.
      const gateOpen = !grouped && !aggregated && !placeholder && canEditCell(cell, row);
      const editable = !editing && gateOpen;
      // `editing` / `rowEditing` are the other half: they already mean a live *session*, not merely a
      // slice that names this target — a gate that shut ends the session even when a controlled
      // application declines to close it, and neither editor may become interactive again if that
      // gate reopens (docs/architecture.md).
      const cellEditorActive = editing && gateOpen;
      const rowEditorActive = rowEditing && gateOpen;
      const normalizedEdit = normalizeEdit(meta?.edit);
      const instantEdit = normalizedEdit?.kind === "instant" ? normalizedEdit : null;

      let content: VNodeChild;

      if (grouped) {
        content = h(GroupCell, { key: "group", cell });
      } else if (aggregated) {
        content = h(FlexRenderHost, {
          source: () => flexRender(column.columnDef.aggregatedCell ?? column.columnDef.cell, cell.getContext())
        });
      } else if (placeholder) {
        content = null;
      } else if (cellEditorActive) {
        content = h(CellEditor, { key: "editor", cell });
      } else if (rowEditorActive) {
        content = h(RowCellEditor, { key: "row-editor", cell });
      } else if (editable && instantEdit && editMode === "cell") {
        content = h(InstantCell, { key: "instant", cell, render: instantEdit.render });
      } else {
        content = h(FlexRenderHost, {
          source: () => flexRender(column.columnDef.cell, cell.getContext())
        });

        if (meta?.truncate) {
          content = h("span", { "data-truncate": true, onPointerEnter: syncTruncationTitle }, [content]);
        }
      }

      const startEditing
        = editable && !rowEditorActive && (editMode === "row" || !instantEdit) && cellLedger
          ? (event: MouseEvent) => {
              event.stopPropagation();

              if (editMode === "row") {
                cellLedger.editing.row.start(row.id, { focusColumnId: column.id });
              } else {
                cellLedger.editing.start({ rowId: row.id, columnId: column.id });
              }
            }
          : undefined;

      if (isFirstDataCell && depth > 0) {
        content = h("div", { style: { paddingInlineStart: `${depth * TREE_INDENT_PX}px` } }, [content]);
      }

      const selector
        = column.id === SELECTION_COLUMN_ID
          ? "selectionCell"
          : column.id === EXPANDER_COLUMN_ID
            ? "expanderCell"
            : column.id === ROW_DRAG_COLUMN_ID
              ? "rowDragCell"
              : "cell";
      // An injected column is a control column: nothing in it activates the row (docs/rows.md). The
      // built-in checkbox and chevron stop their own events, but the column's renderer is
      // overridable (`selectionColumn` / `expanderColumn`), and whatever an application puts there
      // cannot be expected to know that rule — so the host cell holds it instead. A `cellProps`
      // handler still runs: ledger's own is chained ahead of it, not in place of it.
      const stopActivation = isInternalColumn(column.id)
        ? (event: MouseEvent) => event.stopPropagation()
        : undefined;

      const rowSpan = options.rowSpan;
      const colSpan = options.colSpan;

      // Two merges, not one spread. The Styles API answer is a consumer like `cellProps` is — it
      // may carry `attributes` handlers, and those have to run *with* ledger's, not instead of
      // them, while `role` and the structural data-attributes stay ledger's. Spreading the answer
      // into the owned object would let an `attributes.selectionCell.onClick` replace the handler
      // that keeps a control column from activating its row, and rewrite `role` besides.
      const owned = mergeElementProps(getStyles(selector, { style: pinnedCellStyle(column) }), {
        "aria-colindex": options.ariaColIndex,
        "aria-colspan": colSpan > 1 ? colSpan : undefined,
        "aria-rowspan": rowSpan > 1 ? rowSpan : undefined,
        colSpan: colSpan > 1 ? colSpan : undefined,
        "data-align": meta?.align,
        "data-editable": editable || undefined,
        "data-editing": cellEditorActive || rowEditorActive || undefined,
        "data-last": last || undefined,
        "data-leading": column.getIsFirstColumn() || undefined,
        "data-ledger-column-id": column.id,
        "data-pinned": column.getIsPinned() || undefined,
        "data-pinned-edge": pinnedEdge(column),
        role: "cell",
        rowSpan: rowSpan > 1 ? rowSpan : undefined,
        // Vue's native double-click event name is `dblclick`.
        onClick: stopActivation ?? (cellLedger?.editTrigger === "click" ? startEditing : undefined),
        onDblclick: stopActivation ?? (cellLedger?.editTrigger === "double-click" ? startEditing : undefined)
      });

      return h("td", mergeElementProps(resolveElementProps(meta?.cellProps, cell), owned), [content]);
    };

    interface DisplayRowRenderOptions {
      displayIndex: number;
      pinnedPosition?: "top" | "bottom";
      pinnedOffset?: number;
      virtualIndex?: number;
      measureRef?: (element: Element | null) => void;
    }

    const renderDataRow = (
      displayRow: DisplayRow<any> & { kind: "data" },
      options: DisplayRowRenderOptions,
      spanning: boolean,
      rowsBelow: number | undefined,
      headerRowCountValue: number,
      topCount: number,
      centerCount: number,
      virtualEnabled: boolean
    ): VNodeChild => {
      const ledgerValue = ledger.value;
      const { row, dataIndex } = displayRow;
      const cells = row.getVisibleCells();
      const firstDataCellIndex = cells.findIndex(cell => !isInternalColumn(cell.column.id));

      const editingCell = ledgerValue?.editing.cell ?? null;
      const editingRowId = ledgerValue?.editing.mode === "row" ? ledgerValue.editing.row.id : null;
      const activeRowId = ledgerValue?.activeRow.enabled ? ledgerValue.activeRow.id : null;

      const selected = row.getIsSelected();
      const active = activeRowId === row.id;
      const expanded = row.getIsExpanded();
      const depth = row.depth;
      const editingRow = editingRowId === row.id && (ledgerValue?.editing.row.active(row.id) ?? false);
      const dragging = props.reorderSourceId === row.id;
      const dropSide
        = props.reorderTarget?.rowId === row.id
          && !(props.reorderTarget.side === "after" && withDetailPanels.value && row.getIsExpanded())
          ? props.reorderTarget.side
          : null;

      // A click makes the row current before the consumer's own handlers see it. A click is also an
      // activation, so both fire here — `onRowClick` first, as the more specific of the two.
      const handleClick = context.onRowClick || context.onRowActivate || context.activeRowEnabled
        ? (event: MouseEvent) => {
            if (context.activeRowEnabled) {
              context.setActiveRow?.(row.id);
            }

            context.onRowClick?.(row, event);
            context.onRowActivate?.(row, event);
          }
        : undefined;

      const handler = (callback?: (row: Row<any>, event: MouseEvent) => void) =>
        callback ? (event: MouseEvent) => callback(row, event) : undefined;

      const zoneStart = options.pinnedPosition === "top"
        ? headerRowCountValue
        : options.pinnedPosition === "bottom"
          ? headerRowCountValue + topCount + centerCount
          : headerRowCountValue + topCount;
      const ariaRowIndex = virtualEnabled ? zoneStart + options.displayIndex + 1 : undefined;
      const last = rowsBelow === 0;

      // Cells against the column window: pinned segments in full, the windowed center slice, and
      // spacer cells over the spacer cols (docs/virtualization.md#column-virtualization). Spanning
      // never coexists with a window (the body gates it), so the two branches stay disjoint.
      const renderCell = (cell: Cell<any, unknown>, displayIndex: number): VNodeChild => {
        if (spanning && cell.getIsCovered()) {
          return null;
        }

        return renderDataCell({
          cell,
          ariaColIndex: props.columnWindow === null ? undefined : displayIndex + 1,
          colSpan: spanning ? cell.getColSpan() : 1,
          depth,
          editing: editingCell?.rowId === row.id && (ledgerValue?.editing.active(row.id, editingCell.columnId) ?? false)
            ? editingCell.columnId === cell.column.id
            : false,
          isFirstDataCell: displayIndex === firstDataCellIndex,
          last: rowsBelow === undefined ? last : cell.getRowSpan() - 1 === rowsBelow,
          rowEditing: editingRow,
          rowSpan: spanning ? cell.getRowSpan() : 1
        });
      };

      const renderRowCells = (): VNodeChild[] => {
        const columnWindow = props.columnWindow;

        if (columnWindow === null) {
          return cells.map((cell, index) => renderCell(cell, index));
        }

        const segments = windowRowCells(cells, columnWindow);
        const windowedStart = columnWindow.pinnedStartCount + columnWindow.start;
        const trailingStart = cells.length - columnWindow.pinnedEndCount;
        const out: VNodeChild[] = [];

        for (const [index, cell] of segments.leading.entries()) {
          out.push(renderCell(cell, index));
        }

        if (columnWindow.start > 0) {
          out.push(h("td", { "aria-hidden": true, "data-ledger-spacer": true }));
        }

        for (const [index, cell] of segments.windowed.entries()) {
          out.push(renderCell(cell, windowedStart + index));
        }

        if (columnWindow.end < columnWindow.centerCount) {
          out.push(h("td", { "aria-hidden": true, "data-ledger-spacer": true }));
        }

        for (const [index, cell] of segments.trailing.entries()) {
          out.push(renderCell(cell, trailingStart + index));
        }

        return out;
      };

      return h("tr", {
        key: displayRow.key,
        ref: options.measureRef as never,
        ...mergeElementProps(resolveElementProps(context.rowProps, row), {
          "aria-current": active || undefined,
          "aria-rowindex": ariaRowIndex,
          "aria-selected": selected || undefined,
          "data-active": active || undefined,
          "data-clickable": handleClick ? true : undefined,
          "data-dragging": dragging || undefined,
          "data-drop-side": dropSide ?? undefined,
          "data-editing-row": editingRow || undefined,
          "data-expanded": expanded || undefined,
          "data-index": options.virtualIndex,
          "data-last": last || undefined,
          "data-parity": options.pinnedPosition ? undefined : dataIndex % 2 === 0 ? "odd" : "even",
          "data-pinned-row": options.pinnedPosition,
          "data-row-id": row.id,
          "data-selected": selected || undefined,
          role: "row",
          onClick: handleClick,
          onContextmenu: handler(context.onRowContextMenu),
          onDblclick: handler(context.onRowDoubleClick),
          ...getStyles("row", { style: pinnedStyleOf(options.pinnedPosition, options.pinnedOffset) })
        })
      }, renderRowCells());
    };

    const renderDisplayRow = (
      displayRow: DisplayRow<any>,
      options: DisplayRowRenderOptions,
      fullWidthColSpanValue: number,
      headerRowCountValue: number,
      topCount: number,
      centerCount: number,
      bottomCount: number,
      trailingRowCount: number,
      virtualEnabled: boolean
    ): VNodeChild => {
      const rowsBelowOf = (zone: "top" | "center" | "bottom", displayIndex: number): number => {
        const laterZones = zone === "top"
          ? centerCount + bottomCount
          : zone === "center" ? bottomCount : 0;
        const zoneLength = zone === "top" ? topCount : zone === "center" ? centerCount : bottomCount;

        return zoneLength - 1 - displayIndex + laterZones + trailingRowCount;
      };

      const ariaRowIndex = virtualEnabled
        ? (options.pinnedPosition === "top"
          ? headerRowCountValue
          : options.pinnedPosition === "bottom"
            ? headerRowCountValue + topCount + centerCount
            : headerRowCountValue + topCount) + options.displayIndex + 1
        : undefined;
      const rowsBelow = rowsBelowOf(options.pinnedPosition ?? "center", options.displayIndex);
      const last = rowsBelow === 0;

      if (displayRow.kind === "detail") {
        return renderDetailRow(displayRow, options, fullWidthColSpanValue, ariaRowIndex, last);
      }

      return renderDataRow(displayRow, options, spanningActive.value, rowsBelow, headerRowCountValue, topCount, centerCount, virtualEnabled);
    };

    return () => {
      const virtualEnabled = props.virtualization !== null;
      const fullWidthColSpanValue = fullWidthColSpan.value;
      const headerRowCountValue = headerRowCount.value;
      const topDisplayRowsValue = topDisplayRows.value;
      const centerDisplayRowsValue = centerDisplayRows.value;
      const bottomDisplayRowsValue = bottomDisplayRows.value;
      const totalDisplayRowCountValue = totalDisplayRowCount.value;

      // Column identity — an explicit read keeps cell re-rendering honest across pinning,
      // visibility, order and sizing changes.
      table.atoms.columnPinning.get();
      table.atoms.columnVisibility.get();
      table.atoms.columnOrder.get();
      table.atoms.columnSizing.get();

      if (props.loading && totalDisplayRowCountValue === 0) {
        return h("tbody", { ...getStyles("tbody") }, renderSkeletonRows(
          props.skeletonRowCount,
          fullWidthColSpanValue,
          virtualEnabled ? headerRowCountValue + 1 : undefined
        ));
      }

      // The body's bottom edge (docs/styling.md#borders): the last display row across the three
      // zones — or nothing, when a loader or load-more-error row trails the data and is last itself.
      const trailingRowCount = props.loadMoreError || props.loadingMore ? 1 : 0;
      const renderOptions = {
        fullWidthColSpan: fullWidthColSpanValue,
        headerRowCount: headerRowCountValue,
        topCount: topDisplayRowsValue.length,
        centerCount: centerDisplayRowsValue.length,
        bottomCount: bottomDisplayRowsValue.length,
        trailingRowCount,
        virtualEnabled
      };

      const topChildren = topDisplayRowsValue.map((displayRow, displayIndex) => renderDisplayRow(displayRow, {
        displayIndex,
        measureRef: pinnedRowOffsets.registerTopRow(displayIndex),
        pinnedOffset: toValue(pinnedRowOffsets.offsets).top[displayIndex],
        pinnedPosition: "top"
      }, renderOptions.fullWidthColSpan, renderOptions.headerRowCount, renderOptions.topCount, renderOptions.centerCount, renderOptions.bottomCount, renderOptions.trailingRowCount, renderOptions.virtualEnabled));

      let centerChildren: VNodeChild[];

      if (virtualEnabled) {
        const virtualizer = virtualizerRef.value;
        const items = virtualizer?.getVirtualItems() ?? [];
        const firstItem = items[0];
        const lastItem = items.at(-1);
        const topSpace = firstItem ? firstItem.start : 0;
        const bottomSpace = lastItem && virtualizer ? virtualizer.getTotalSize() - lastItem.end : 0;

        centerChildren = [];

        if (topSpace > 0) {
          centerChildren.push(h("tr", {
            key: "ledger:spacer-leading",
            "aria-hidden": true,
            "data-ledger-spacer": true,
            style: { height: `${topSpace}px` }
          }));
        }

        for (const item of items) {
          const displayRow = centerDisplayRowsValue[item.index];

          if (displayRow) {
            centerChildren.push(renderDisplayRow(displayRow, {
              displayIndex: item.index,
              virtualIndex: item.index,
              measureRef: virtualizer?.measureElement
            }, renderOptions.fullWidthColSpan, renderOptions.headerRowCount, renderOptions.topCount, renderOptions.centerCount, renderOptions.bottomCount, renderOptions.trailingRowCount, renderOptions.virtualEnabled));
          }
        }

        if (bottomSpace > 0) {
          centerChildren.push(h("tr", {
            key: "ledger:spacer-trailing",
            "aria-hidden": true,
            "data-ledger-spacer": true,
            style: { height: `${bottomSpace}px` }
          }));
        }
      } else {
        centerChildren = centerDisplayRowsValue.map((displayRow, displayIndex) => renderDisplayRow(displayRow, {
          displayIndex
        }, renderOptions.fullWidthColSpan, renderOptions.headerRowCount, renderOptions.topCount, renderOptions.centerCount, renderOptions.bottomCount, renderOptions.trailingRowCount, renderOptions.virtualEnabled));
      }

      const bottomChildren = bottomDisplayRowsValue.map((displayRow, displayIndex) => renderDisplayRow(displayRow, {
        displayIndex,
        measureRef: pinnedRowOffsets.registerBottomRow(displayIndex),
        pinnedOffset: toValue(pinnedRowOffsets.offsets).bottom[displayIndex],
        pinnedPosition: "bottom"
      }, renderOptions.fullWidthColSpan, renderOptions.headerRowCount, renderOptions.topCount, renderOptions.centerCount, renderOptions.bottomCount, renderOptions.trailingRowCount, renderOptions.virtualEnabled));

      const trailingChild = props.loadMoreError
        ? renderLoadMoreErrorRow(
            fullWidthColSpanValue,
            props.loadMoreError,
            virtualEnabled ? headerRowCountValue + totalDisplayRowCountValue + 1 : undefined,
            props.onLoadMoreRetry
          )
        : props.loadingMore
          ? renderLoaderRow(
              fullWidthColSpanValue,
              virtualEnabled ? headerRowCountValue + totalDisplayRowCountValue + 1 : undefined
            )
          : null;

      return h("tbody", { ...getStyles("tbody") }, [
        ...topChildren,
        ...centerChildren,
        ...bottomChildren,
        trailingChild
      ]);
    };
  }
});
