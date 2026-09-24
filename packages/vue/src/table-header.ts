import type { FunctionalComponent, VNodeChild } from "vue";
import type { ColumnSizingState } from "@tanstack/vue-table";
import type { GetStyles } from "./get-styles";
import type { Header, TableInstance } from "./types";
import type { ResizerSpec } from "./use-column-resize";
import type { ColumnWindowView } from "./use-column-window";

/**
 * The header: sortable labels (full-area button, shift for multi-sort, order badges), the
 * hover-revealed filter popover, the resize handle on the trailing edge, and drag-reorder
 * plumbing. Every state is a data-attribute; every class is a Styles API selector. Column
 * layout — order, visibility, pinning, width, grouping — belongs to `DataTable.ColumnsPanel`,
 * not to the header (docs/columns.md).
 *
 * Vue edition: a `defineComponent` render component (its composables need a setup scope), with
 * the React edition's per-render structure intact. The Mantine Tooltip on the resizer is
 * dropped with the component library — the handle keeps its `aria-hidden` semantics and the
 * hover hint becomes a native `title`.
 */
import { defineComponent, h, toValue } from "vue";
import { flexRender } from "@tanstack/vue-table";

import { autosizeColumn } from "./autosize-column";
import { columnEnableResizing, isInternalColumn } from "./build-columns";
import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { useGetStyles } from "./get-styles";
import { FilterPopover } from "./filter-popover";
import { ledgerCommands } from "./ledger-commands";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { SIZES } from "./size";
import { syncTruncationTitle } from "./truncate";
import { useColumnReorder } from "./use-column-reorder";
import { useColumnResize } from "./use-column-resize";
import { windowHeaderCells } from "./use-column-window";

/**
 * Renders a TanStack renderer through a stable host component — per-cell render effects
 * without remounting (a fresh `h(() => ...)` closure per cell would change the component type
 * on every patch and tear the subtree down).
 */
const FlexRenderHost: FunctionalComponent<{ source: () => VNodeChild }> = (props) => props.source();
FlexRenderHost.props = ["source"];

export const TableHeader = defineComponent({
  name: "LedgerTableHeader",

  props: {
    columnSizing: { type: Object, default: undefined },
    columnWidths: { type: Object, required: true },
    columnWindow: { type: Object, default: null },
    table: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as {
      table: TableInstance<any>;
      columnWidths: Record<string, number>;
      columnSizing: ColumnSizingState;
      columnWindow: ColumnWindowView | null;
    };

    const context = useDataTableContext();
    const getStyles: GetStyles = useGetStyles();
    const table = props.table;
    const reorder = useColumnReorder(table);
    const resize = useColumnResize(table.setColumnSizing);

    const renderCell = (
      header: Header<any, unknown>,
      colSpan: number | undefined,
      ariaColIndex: number | undefined
    ) => h(HeaderCell, {
      key: header.id,
      ariaColIndex,
      colSpan,
      columnSizing: props.columnSizing,
      columnWidths: props.columnWidths,
      header,
      reorder,
      resize,
      table
    });

    return () => {
      const columnWindow = props.columnWindow;

      // Order and visibility are slices — explicit atom reads keep the header groups reactive.
      table.atoms.columnOrder.get();
      table.atoms.columnVisibility.get();

      return h("thead", {
        ...getStyles("thead")
      }, table.getHeaderGroups().map((headerGroup, groupIndex) =>
        h("tr", mergeElementProps(resolveElementProps(context.headerRowProps, headerGroup), {
          "aria-rowindex": context.virtualizedRows ? groupIndex + 1 : undefined,
          role: "row",
          ...getStyles("headerRow")
        }), columnWindow === null
          ? headerGroup.headers.map(header => renderCell(header, undefined, undefined))
          : windowHeaderCells(headerGroup.headers, columnWindow).map(cell => cell.kind === "spacer"
            ? h("th", { key: `ledger:spacer-${cell.edge}`, "aria-hidden": true, "data-ledger-spacer": true })
            : renderCell(cell.header, cell.colSpan, cell.ariaColIndex)))));
    };
  }
});

/**
 * `columnWidths` and `columnSizing` arrive as props, not through the context or the table: a drag
 * departs from the edge the user grabbed and restores what that render had, and both belong to
 * the render that drew the handle. Reaching for either at event time reaches the shared core,
 * which carries whatever render pass ran last — a discarded one included
 * (docs/architecture.md).
 */
const HeaderCell = defineComponent({
  name: "LedgerTableHeaderCell",

  props: {
    ariaColIndex: { type: Number, default: undefined },
    colSpan: { type: Number, default: undefined },
    columnSizing: { type: Object, required: true },
    columnWidths: { type: Object, required: true },
    header: { type: Object, required: true },
    reorder: { type: Object, required: true },
    resize: { type: Object, required: true },
    table: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as {
      header: Header<any, unknown>;
      table: TableInstance<any>;
      reorder: ReturnType<typeof useColumnReorder>;
      resize: ReturnType<typeof useColumnResize>;
      columnWidths: Record<string, number>;
      columnSizing: ColumnSizingState;
      /**
       * Both set only under a column window: the clamp rule's colSpan (use-column-window.ts)
       * replaces `header.colSpan`, and the 1-based position covers windowed-out columns too.
       */
      colSpan: number | undefined;
      ariaColIndex: number | undefined;
    };

    const context = useDataTableContext();
    const getStyles: GetStyles = useGetStyles();

    return () => {
      const { header, table, columnWidths, columnSizing } = props;
      const { column } = header;
      const { glyph } = SIZES[context.size];
      const { meta } = column.columnDef;
      const internal = isInternalColumn(column.id);

      const canSort = column.getCanSort();
      const sorted = column.getIsSorted();
      /**
       * The whole of what a sort click applies, resolved here. v9's own handler asks the column
       * again when the click lands — for the gate, for the direction the cycle turns to next — and
       * both of those reads go to the shared core (`toggle-fns.ts`).
       */
      const sortSpec = {
        canMultiSort: column.getCanMultiSort(),
        columnId: column.id,
        maxMultiSortColCount: table.options.maxMultiSortColCount ?? Number.MAX_SAFE_INTEGER,
        nextOrderMulti: column.getNextSortingOrder(true),
        nextOrderSingle: column.getNextSortingOrder(false)
      };
      // v9's own default, restated: the feature's `getDefaultTableOptions` is merged into the core's
      // options, not into the wrapper's, so reading only `table.options` here would silently make
      // every click a single-sort. A consumer override through `tableOptions` still wins.
      const isMultiSortEvent = table.options.isMultiSortEvent ?? ((event: MouseEvent) => event.shiftKey);
      const sorting = ledgerCommands(table.options.meta?.ledger)?.sorting;
      const sortCount = table.atoms.sorting.get().length;
      const sortIndex = column.getSortIndex();
      // Ledger's own gate: the TanStack `columnResizingFeature` (and its `getCanResize`) is
      // deliberately unregistered — the drag pipeline is ledger's (docs/sizing.md).
      const canResize
        = table.options.meta?.ledger?.enableColumnResizing === true
          && columnEnableResizing(column.columnDef) !== false
          // Only leaves have a width: the engine resolves and consumes leaf sizing, so a handle on
          // a group header would write a `columnSizing` entry nothing ever reads.
          && column.columns.length === 0;
      const resizing = toValue(props.resize.resizingId) === column.id;
      /**
       * Everything a drag or a fit decides with, read here, in the render that draws the handle —
       * the width on screen, the constraints this render's definition carries, the entry Escape puts
       * back, and whether the header reserves room for a filter control. The handler on the DOM then
       * needs nothing from the table at all (docs/architecture.md).
       */
      const resizerSpec: ResizerSpec = {
        columnId: column.id,
        width: columnWidths[column.id] ?? column.getSize(),
        minSize: column.columnDef.minSize ?? 20,
        maxSize: column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER,
        sizingEntry: columnSizing[column.id]
      };

      const drag = toValue(props.reorder.drag);
      const dragged = drag.draggedId === column.id;
      const dropSide = drag.targetId === column.id ? drag.side : null;

      const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined;

      const handleSortClick = (event: MouseEvent) => {
        if (props.reorder.consumeClickSuppression()) {
          return;
        }

        if (!canSort) {
          return;
        }

        sorting?.toggle(sortSpec, sortSpec.canMultiSort && (isMultiSortEvent?.(event) ?? false));
      };

      const label = header.isPlaceholder
        ? null
        : h(FlexRenderHost, {
            source: () => flexRender(column.columnDef.header, header.getContext())
          });

      const children: VNodeChild[] = [];

      if (!header.isPlaceholder) {
        if (internal) {
          // Injected headers (checkbox, expand-all) are controls, not text — the label
          // scaffolding's [data-truncate] span would clip them at the cell's content box.
          children.push(label);
        } else {
          if (canSort) {
            // A NATIVE button, reset in ledger's layer: an unlayered host font-size would defeat
            // the layered `font: inherit` (styling.md).
            children.push(h("button", {
              type: "button",
              onClick: handleSortClick,
              "data-align": meta?.align,
              ...getStyles("headerLabel")
            }, [
              h("span", { "data-truncate": true, onPointerEnter: syncTruncationTitle }, [label]),
              h("span", {
                "data-sorted": sorted || undefined,
                ...getStyles("sortIndicator")
              }, [
                sorted === "asc" && h(context.icons.sortAsc, { size: glyph }),
                sorted === "desc" && h(context.icons.sortDesc, { size: glyph }),
                sorted === false && h(context.icons.sortable, { size: glyph }),
                sorted !== false && sortCount > 1 && sortIndex >= 0 && h("sup", [sortIndex + 1])
              ])
            ]));
          } else {
            children.push(h("div", {
              "data-align": meta?.align,
              ...getStyles("headerLabel")
            }, [
              h("span", { "data-truncate": true, onPointerEnter: syncTruncationTitle }, [label])
            ]));
          }

          if (meta?.filter !== undefined) {
            children.push(h("div", {
              "data-ledger-no-drag": true,
              ...getStyles("headerActions")
            }, [h(FilterPopover, { column })]));
          }

          if (canResize) {
            children.push(h("div", {
              // A pointer-only affordance, hidden from assistive tech on purpose: it
              // takes no focus and answers no key, and the keyboard route to the same
              // `columnSizing` entry is the columns panel's width field
              // (docs/accessibility.md). Announcing an inoperable control would be worse
              // than announcing nothing; the hint rides a native `title` for the mouse,
              // suppressed mid-drag so it never chases the handle.
              "aria-hidden": true,
              "data-ledger-no-drag": true,
              "data-ledger-resizer": true,
              "data-resizing": resizing || undefined,
              title: resizing ? undefined : context.labels.resizeColumn,
              onClick: event => event.stopPropagation(),
              onDblclick: event => {
                const main = (event.currentTarget as HTMLElement).closest<HTMLElement>(".ledger-main");

                if (main) {
                  autosizeColumn(
                    table.setColumnSizing,
                    { ...resizerSpec, hasFilter: meta?.filter !== undefined },
                    main
                  );
                }
              },
              ...props.resize.getResizerProps(resizerSpec),
              ...getStyles("resizer")
            }));
          }
        }
      }

      return h("th", mergeElementProps(resolveElementProps(meta?.headerCellProps, header), {
        "aria-colindex": props.ariaColIndex,
        "aria-sort": canSort ? ariaSort : undefined,
        colSpan: props.colSpan ?? header.colSpan,
        "data-align": internal ? "center" : meta?.align,
        "data-dragging": dragged || undefined,
        "data-drop-side": dropSide ?? undefined,
        "data-ledger-column-id": column.id,
        "data-pinned": column.getIsPinned() || undefined,
        "data-pinned-edge": pinnedEdge(column),
        "data-resizing": resizing || undefined,
        "data-sortable": canSort || undefined,
        role: "columnheader",
        ...getStyles("headerCell", { style: pinnedCellStyle(column) }),
        ...props.reorder.getHeaderProps(column.id)
      }), children);
    };
  }
});
