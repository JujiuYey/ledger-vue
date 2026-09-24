import type { Row, TableInstance } from "./types";

/**
 * The injected selection column's header and body cells. Both stop propagation so selection
 * never triggers `onRowClick` (docs/rows.md). Shift-range selection keeps TanStack v9's
 * semantics (`enableRowRangeSelection`, on by default): an ordinary click sets the anchor, a
 * Shift-click applies the display-order range, non-selectable rows excluded. What it never keeps
 * is v9's route to them — `getToggleSelectedHandler()` resolves the gate, the anchor and the
 * display order from the shared core when the click arrives, which is whatever render pass ran
 * last. The controller answers from the commit instead (`use-row-commands.ts`).
 */
import { defineComponent, h } from "vue";

import { LedgerCheckbox } from "./controls";
import { useDataTableContext } from "./context";
import { SIZES } from "./size";

/**
 * The header checkbox. Vue edition: a controlled input needs no `onChange` stub (React's
 * controlled-input contract does not apply) — the click handler applies the toggle.
 */
export const SelectionHeaderCell = defineComponent({
  name: "LedgerSelectionHeaderCell",

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
      const { labels, selection, size } = context;

      if (table.options.enableMultiRowSelection === false) {
        return null;
      }

      // Explicit atom read so the derived selection answers below are reactive even where the
      // row-model memo misses a slice.
      table.atoms.rowSelection.get();

      const scope = table.options.meta?.ledger?.selectAllScope ?? "all";
      const allSelected = scope === "page" ? table.getIsAllPageRowsSelected() : table.getIsAllRowsSelected();
      // v9 semantics: "some" means "at least one" and stays true at full selection — the
      // indeterminate glyph must therefore be gated on the matching all-selected check.
      const someSelected = scope === "page" ? table.getIsSomePageRowsSelected() : table.getIsSomeRowsSelected();

      return h(LedgerCheckbox, {
        ariaLabel: labels.selectAllRows,
        checked: allSelected,
        indeterminate: !allSelected && someSelected,
        size: SIZES[size].control,
        onClick: (event: MouseEvent) => {
          event.stopPropagation();
          // What the box shows is what clicking it departs from — resolved by this render,
          // never asked of the table again when the click lands.
          selection?.toggleAll(scope, !allSelected);
        }
      });
    };
  }
});

export const SelectionCell = defineComponent({
  name: "LedgerSelectionCell",

  props: {
    row: { type: Object, required: true }
  },

  setup(rawProps) {
    const props = rawProps as { row: Row<any> };
    // Reactive context — read inside the render (see the header cell above).
    const context = useDataTableContext();

    return () => {
      const row = props.row;
      const { labels, instanceId, selection, size } = context;
      const selected = row.getIsSelected();

      const select = (event: MouseEvent) => {
        const target = event.currentTarget as HTMLInputElement;

        event.stopPropagation();
        selection?.toggle(
          row,
          target.checked,
          event.shiftKey
        );
      };

      // Single-select is a radio group, not a lone checkbox: one choice at a time is what a radio
      // means, and the shared name makes the rendered rows one group for the platform. (Under
      // virtualization only the mounted window is in that group — the same boundary as autosize.)
      // The controls registry ships no radio control, so this variant renders the native input.
      if (row.getCanMultiSelect() === false) {
        return h("input", {
          "aria-label": labels.selectRow,
          checked: selected,
          disabled: !row.getCanSelect(),
          name: `${instanceId}-selection`,
          type: "radio",
          onClick: select
        });
      }

      return h(LedgerCheckbox, {
        ariaLabel: labels.selectRow,
        checked: selected,
        disabled: !row.getCanSelect(),
        // Sub-row selection (escape hatch `enableSubRowSelection`): a parent with a partly
        // selected subtree reads as indeterminate.
        indeterminate: !selected && row.getIsSomeSelected(),
        size: SIZES[size].control,
        onClick: select
      });
    };
  }
});
