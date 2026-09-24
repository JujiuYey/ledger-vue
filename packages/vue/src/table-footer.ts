import type { VNodeChild } from "vue";
import type { RowData } from "@tanstack/vue-table";
import type { GetStyles } from "./get-styles";
import type { Header, TableInstance } from "./types";
import type { ColumnWindowView } from "./use-column-window";

/**
 * Column footers (totals row). Rendered only when at least one column — leaf or group —
 * declares a `footer`; pinned columns keep their sticky offsets so the totals track their
 * columns.
 */
import { defineComponent, h } from "vue";
import { flexRender } from "@tanstack/vue-table";

import { useDataTableContext } from "./context";
import { mergeElementProps, resolveElementProps } from "./element-props";
import { useGetStyles } from "./get-styles";
import { pinnedCellStyle, pinnedEdge } from "./pinning";
import { windowHeaderCells } from "./use-column-window";

/**
 * The footer rows that actually render. `getFooterGroups()` mirrors *every* header level, so a
 * grouped header whose totals live on the leaves yields a trailing group row holding nothing —
 * dead space that still draws row and column borders. A level earns its row by carrying a
 * `footer` of its own, which also lets a group column declare one (previously the leaf-only
 * test dropped the whole region in that case).
 */
export function visibleFooterGroups<TData extends RowData>(table: TableInstance<TData>) {
  return table.getFooterGroups().filter(footerGroup => footerGroup.headers.some(
    footer => !footer.isPlaceholder && footer.column.columnDef.footer !== undefined
  ));
}

export function tableHasFooter<TData extends RowData>(table: TableInstance<TData>): boolean {
  return visibleFooterGroups(table).length > 0;
}

export const TableFooter = defineComponent({
  name: "LedgerTableFooter",

  props: {
    ariaRowIndexStart: { type: Number, default: undefined },
    columnWindow: { type: Object, default: null },
    table: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as {
      table: TableInstance<any>;
      ariaRowIndexStart?: number;
      columnWindow: ColumnWindowView | null;
    };

    const context = useDataTableContext();
    const getStyles: GetStyles = useGetStyles();

    const renderCell = (
      footer: Header<any, unknown>,
      colSpan: number | undefined,
      ariaColIndex: number | undefined
    ): VNodeChild =>
      h("th", mergeElementProps(resolveElementProps(footer.column.columnDef.meta?.footerCellProps, footer), {
        key: footer.id,
        "aria-colindex": ariaColIndex,
        colSpan: colSpan ?? footer.colSpan,
        "data-align": footer.column.columnDef.meta?.align,
        // Autosize measures the footer like every other rendered cell, and finds it the
        // same way (docs/sizing.md).
        "data-ledger-column-id": footer.column.id,
        "data-pinned": footer.column.getIsPinned() || undefined,
        "data-pinned-edge": pinnedEdge(footer.column),
        // Totals are data, not headers — under the ARIA table they are plain cells.
        role: "cell",
        ...getStyles("footerCell", { style: pinnedCellStyle(footer.column) })
      }), [
        footer.isPlaceholder
          ? null
          : flexRender(footer.column.columnDef.footer, footer.getContext())
      ]);

    return () => {
      // Layout slices — explicit atom reads keep the footer rows reactive.
      props.table.atoms.columnOrder.get();
      props.table.atoms.columnVisibility.get();

      const groups = visibleFooterGroups(props.table);

      return h("tfoot", { ...getStyles("tfoot") }, groups.map((footerGroup, groupIndex) =>
        h("tr", mergeElementProps(resolveElementProps(context.footerRowProps, footerGroup), {
          key: footerGroup.id,
          "aria-rowindex": props.ariaRowIndexStart === undefined ? undefined : props.ariaRowIndexStart + groupIndex,
          role: "row",
          ...getStyles("footerRow")
        }), props.columnWindow === null
          ? footerGroup.headers.map(footer => renderCell(footer, undefined, undefined))
          : windowHeaderCells(footerGroup.headers, props.columnWindow).map(cell => cell.kind === "spacer"
            ? h("th", { key: `ledger:spacer-${cell.edge}`, "aria-hidden": true, "data-ledger-spacer": true })
            : renderCell(cell.header, cell.colSpan, cell.ariaColIndex)))));
    };
  }
});
