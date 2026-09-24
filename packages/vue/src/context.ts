import type { ColumnFiltersState } from "@tanstack/vue-table";
import type { InjectionKey } from "vue";

import type { DataTableElementProps } from "./element-props";
import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { LedgerSize } from "./size";
import type { RowReorderKeyboard } from "./row-reorder";
import type { LedgerTrProps, HeaderGroup, Row } from "./types";
import type { LedgerExpansionController, LedgerSelectionController } from "./use-row-commands";

/**
 * Internal context for everything rendered inside the `<DataTable>` tree. The data generic is
 * erased at this boundary — the single deliberate erasure in the package, mirroring the family
 * convention (one documented boundary instead of casts scattered through the tree). Cells and
 * filter popovers receive their strongly-typed TanStack objects (`Row<TData>`, `Column<TData>`)
 * directly as props; the context only carries table-wide plumbing.
 *
 * The table instance itself is deliberately NOT here — the same rule the React edition states:
 * the tree receives the table-wide facts it needs as their own fields, so a subtree redrawn
 * without the root cannot read a stale instance. (Vue's reactivity has no discarded renders, so
 * the React edition's render-tearing caveats do not apply — the fields are kept for the contract,
 * not for tearing.)
 */
import { inject, provide } from "vue";

/**
 * The keyboard half of a row drag (docs/rows.md#row-ordering) — the handle cells drive it,
 * `<DataTable>` owns the session.
 */
export interface RowReorderKeyboard {
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface DataTableContextValue {
  /**
   * Stable per-instance id — what the single-select radios group themselves by.
   */
  instanceId: string;
  labels: DataTableLabels;
  icons: DataTableIcons;
  /**
   * The table's `size` (docs/styling.md#size) — what every control drawn in the tree reads
   * its own size from (`size.ts`).
   */
  size: LedgerSize;
  filterMode: "client" | "server";
  /**
   * Row virtualization active — rows must then carry aria-rowindex (header rows included).
   */
  virtualizedRows: boolean;
  /**
   * The header region renders — so header rows count toward every `aria-rowindex`.
   */
  withColumnHeaders: boolean;
  /**
   * The active-row slice, as its own two facts: the switch, and the stable setter that moves it.
   * Both reach the rows through the context — rows are memoized, so a prop that only TableBody
   * knows about would leave a row that did not re-render answering with the switch as it stood
   * when it last did.
   */
  activeRowEnabled: boolean;
  setActiveRow?: (rowId: string) => void;
  /**
   * The row-ordering keyboard session (docs/rows.md#row-ordering). The handlers are stable; only
   * presence changes with the gate.
   */
  rowReorderKeyboard?: RowReorderKeyboard;
  /**
   * The row-state toggles the injected columns drive. Stable for the life of the instance, so a
   * cell reaches one without the route deciding anything (`use-row-commands.ts`).
   */
  selection?: LedgerSelectionController;
  expansion?: LedgerExpansionController;
  /**
   * Notification of every `columnFilters` set attempt, no-ops included — what a debounced filter
   * control listens to so an external reset reaches its own local value. Stable per instance.
   */
  subscribeColumnFilters?: (listener: (value: ColumnFiltersState) => void) => () => void;
  onRowClick?: (row: Row<any>, event: MouseEvent) => void;
  onRowActivate?: (row: Row<any>, event: MouseEvent | KeyboardEvent) => void;
  onRowDoubleClick?: (row: Row<any>, event: MouseEvent) => void;
  onRowContextMenu?: (row: Row<any>, event: MouseEvent) => void;
  rowProps?: DataTableElementProps<LedgerTrProps, Row<any>>;
  headerRowProps?: DataTableElementProps<LedgerTrProps, HeaderGroup<any>>;
  footerRowProps?: DataTableElementProps<LedgerTrProps, HeaderGroup<any>>;
}

const DataTableContextKey: InjectionKey<DataTableContextValue> = Symbol("DataTableContext");

export function provideDataTableContext(value: DataTableContextValue): void {
  provide(DataTableContextKey, value);
}

export function useDataTableContext(): DataTableContextValue {
  const value = inject(DataTableContextKey, null);

  if (value === null) {
    throw new Error("[ledger] DataTable parts must be rendered inside <DataTable>");
  }

  return value;
}
