import type { RowData } from "@tanstack/vue-table";
import type { CSSProperties, PropType } from "vue";

import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";
import { computed, defineComponent, h } from "vue";
import clsx from "clsx";

import { LedgerButton } from "./controls";
import { resolveIcons } from "./icons";
import { resolveLabels } from "./labels";

/**
 * `DataTable.SelectionBar` — renders only while rows are selected: the count, a clear action,
 * and whatever bulk actions the page passes as children (the default slot).
 */
export interface DataTableSelectionBarProps<TData extends RowData> {
  table: TableInstance<TData>;
  labels?: Partial<DataTableLabels>;
  icons?: Partial<DataTableIcons>;
  /**
   * Bulk actions ride the default slot, rendered after the count and clear control.
   */
  class?: string;
  style?: CSSProperties;
}

export const DataTableSelectionBar = defineComponent({
  name: "DataTableSelectionBar",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    labels: { type: Object as PropType<Partial<DataTableLabels>>, default: undefined },
    icons: { type: Object as PropType<Partial<DataTableIcons>>, default: undefined },
    class: { type: String, default: undefined },
    style: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props, { slots }) {
    const resolved = resolveLabels(props.labels);
    const resolvedIcons = resolveIcons(props.icons);
    // The selection state's own count, deliberately — not `getSelectedRowModel().flatRows.length`.
    // That model resolves the state against the rows the table actually holds, which under server
    // pagination is one page: a bar counting it would drop everything selected on the pages that
    // are no longer loaded, and the id-keyed state is precisely what survives paging
    // (docs/selection.md). The corollary is that ids the data no longer holds still count, which is
    // the same reason selection requires a stable `getRowId`.
    const count = computed(() => Object.values(props.table.atoms.rowSelection.get()).filter(Boolean).length);

    return () => {
      if (count.value === 0) {
        return null;
      }

      return h("div", { class: clsx("ledger-selection-bar", props.class), style: props.style }, [
        h("span", { class: "ledger-selection-count" }, resolved.selectedCount(count.value)),

        h(
          LedgerButton,
          {
            variant: "subtle",
            size: "xs",
            onClick: () => props.table.resetRowSelection()
          },
          { default: () => [h(resolvedIcons.clearSelection), resolved.clearSelection] }
        ),

        slots.default?.()
      ]);
    };
  }
});

