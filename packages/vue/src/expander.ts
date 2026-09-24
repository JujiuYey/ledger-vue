import type { Row, TableInstance } from "./types";

/**
 * The injected expander column: a per-row chevron (detail panels and sub-row trees share it)
 * and an expand-all header affordance for trees. Clicks never reach `onRowClick`.
 */
import { defineComponent, h } from "vue";

import { LedgerButton } from "./controls";
import { useDataTableContext } from "./context";
import { SIZES } from "./size";

export const ExpanderHeaderCell = defineComponent({
  name: "LedgerExpanderHeaderCell",

  props: {
    table: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as { table: TableInstance<any> };
    // The render context is a reactive object — read its properties inside the render, never
    // destructure (that would freeze them at setup time).
    const context = useDataTableContext();

    return () => {
      const table = props.table;
      const { labels, icons, expansion, size } = context;

      // Expand-all only makes sense over a tree; a master–detail table opens panels one at a time.
      if (!table.options.getSubRows) {
        return null;
      }

      table.atoms.expanded.get();

      const allExpanded = table.getIsAllRowsExpanded();
      const canSomeExpand = table.getCanSomeRowsExpand();

      return h(LedgerButton, {
        ariaLabel: allExpanded ? labels.collapseAll : labels.expandAll,
        "data-expanded": allExpanded || undefined,
        size: SIZES[size].control,
        variant: "subtle",
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          expansion?.toggleAll(!allExpanded, canSomeExpand);
        }
      }, () => [h(icons.expandRow, { size: SIZES[size].glyph })]);
    };
  }
});

export const ExpanderCell = defineComponent({
  name: "LedgerExpanderCell",

  props: {
    row: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as { row: Row<any> };
    // Reactive context — read inside the render (see the header cell above).
    const context = useDataTableContext();

    return () => {
      const row = props.row;
      const { labels, icons, expansion, size } = context;
      const canExpand = row.getCanExpand();

      if (!canExpand) {
        return null;
      }

      const expanded = row.getIsExpanded();

      return h(LedgerButton, {
        "aria-expanded": expanded,
        ariaLabel: expanded ? labels.collapseRow : labels.expandRow,
        "data-expanded": expanded || undefined,
        size: SIZES[size].control,
        variant: "subtle",
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          expansion?.toggle(row.id, expanded, canExpand);
        }
      }, () => [h(icons.expandRow, { size: SIZES[size].glyph })]);
    };
  }
});
