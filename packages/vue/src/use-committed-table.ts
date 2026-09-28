import type { RowData } from "@tanstack/vue-table";
import type { Ref } from "vue";

import type { EditGate } from "./edit-meta";
import type { Cell, Column, Row, TableInstance } from "./types";

/**
 * What the last committed render resolved, kept where a later update cannot rewrite it.
 *
 * The one shared core instance carries whatever the most recent options pass wrote — including a
 * pass that has not reached the screen — and everything the core derives from those options
 * follows: `getRow` and the row models, `getAllLeafColumns` and every `columnDef` on them, and
 * `options.meta.ledger`. The React edition needed this snapshot as a tearing guard against
 * discarded renders; Vue has none, so it collapses to the invariant both editions share —
 * everything a commit decides with must outlive the editor that sent it. The capture below runs
 * post-flush, after the commit-carrying update has landed, so the sessions answer from rows,
 * columns and the editing gate as the render that reached the screen left them
 * (docs/architecture.md).
 *
 * The boundary this does *not* claim: the TanStack objects handed to the application (`row`,
 * `column` in a commit payload) are the ones that render resolved, not reconstructions — and
 * nothing here fixes the upstream mutation itself, only ledger's own reliance on it.
 */
import { canEditWith, normalizeEdit } from "./edit-meta";
import { ref } from "vue";

type ColumnEdit = NonNullable<Cell<any, unknown>["column"]["columnDef"]["meta"]>["edit"];

export type CaptureCommitted<TData extends RowData> = (table: TableInstance<TData>, gate: EditGate) => void;

export interface CommittedTable {
  /**
   * Bumped by every capture — one tick per commit-carrying change (state, data, definitions,
   * the editing gate, a commit handler's presence). The session controllers watch it to
   * reconcile after every committed render, which is what the React edition's dependency-free
   * effect did.
   */
  version: Ref<number>;
  /**
   * The row as the committed render resolved it — `original` included, which is what a commit
   * departs from.
   */
  row: (rowId: string) => Row<any> | null;
  /**
   * That row's value for a column, through the committed accessor.
   */
  value: (rowId: string, columnId: string) => unknown;
  /**
   * The committed `meta.edit`, never `cell.column.columnDef.meta` — the core rewrites its
   * definitions on every render pass, committed or not.
   */
  edit: (columnId: string) => ColumnEdit;
  /**
   * Whether the committed definitions hold this column at all. A column that left is a layout
   * change; a column whose gate shut is an application closing one, and row mode tells them apart
   * (docs/editing.md#row-mode).
   */
  has: (columnId: string) => boolean;
  /**
   * Every leaf column of the committed definitions, in their own order — the order
   * `row.getAllCells()` walks. Hidden ones included: a column the columns panel hid still holds a
   * draft, and still commits it (docs/editing.md).
   */
  columnIds: () => string[];
  /**
   * The leaf columns that render, in **display** order — start + center + end, the order the
   * header groups and each row's cells are drawn in. `getVisibleLeafColumns` alone ignores
   * pinning (docs/architecture.md), and a keyboard move that used it would step sideways past a
   * pinned column and back.
   */
  visibleColumnIds: () => string[];
  canEdit: (rowId: string, columnId: string) => boolean;
  /**
   * The row is one the committed render actually put on screen — after filtering, pagination and
   * pinning. `row` deliberately reaches further back (a session may name a row that is filtered
   * out, or has not arrived), so anything that means "the row the user is looking at" asks this.
   */
  onScreen: (rowId: string) => boolean;
  /**
   * The committed definition declares an instant-apply control — which the keyboard entry
   * points need, because what an instant column *is* depends on the mode (docs/editing.md).
   */
  isInstant: (columnId: string) => boolean;
  /**
   * Whether editing is possible at all: the table switch is on *and* the live mode has a handler
   * to send an edit to. Both are table-level facts, so this is answered without a row — which is
   * what lets a session whose row has not arrived still lose its gate, and keeps "the row is not
   * here" apart from "the application closed the gate" when they happen together.
   */
  tableGate: () => boolean;
  /**
   * The committed TanStack column, for the payload handed to the application.
   */
  column: (columnId: string) => Column<any, unknown> | null;
}

interface Snapshot {
  displayRowIds: Set<string>;
  visibleColumnIds: string[];
  rows: Record<string, Row<any>>;
  coreRows: Record<string, Row<any>>;
  columns: Map<string, Column<any, unknown>>;
  columnIds: string[];
  enableEditing: boolean;
  hasCommitHandler: boolean;
}

const EMPTY: Snapshot = {
  displayRowIds: new Set(),
  visibleColumnIds: [],
  columnIds: [],
  columns: new Map(),
  coreRows: {},
  enableEditing: false,
  hasCommitHandler: false,
  rows: {}
};

/**
 * Returns the readers and the one function that fills them. Taking the snapshot is deliberately
 * the caller's move: the table instance only exists further down `useDataTable`, while the session
 * controllers that read this are built before it — so the readers are handed out first and the
 * capture happens in the post-flush watch that mirrors the instance itself.
 */
export function useCommittedTable<TData extends RowData>(): readonly [CommittedTable, CaptureCommitted<TData>] {
  // Vue edition: one plain closure variable. The readers fire at event time — never inside the
  // reactive graph — so there is no ref to keep, and closures defined here are stable for the
  // life of the instance, which is what the React edition's `useCallback` bought.
  let snapshot: Snapshot = EMPTY;
  const version = ref(0);

  const capture: CaptureCommitted<TData> = (table, gate) => {
    const columns = new Map<string, Column<any, unknown>>();
    const columnIds: string[] = [];

    for (const column of table.getAllLeafColumns() as Array<Column<any, unknown>>) {
      columns.set(column.id, column);
      columnIds.push(column.id);
    }

    // What the body drew, in the same terms the keyboard navigation uses: pinned rows are on
    // screen alongside the page's own, and the row model alone would miss them.
    const displayRows = table.options.enableRowPinning === true
      ? [...table.getTopRows(), ...table.getCenterRows(), ...table.getBottomRows()]
      : table.getRowModel().rows;

    snapshot = {
      displayRowIds: new Set(displayRows.map(row => row.id)),
      visibleColumnIds: [
        ...table.getStartVisibleLeafColumns(),
        ...table.getCenterVisibleLeafColumns(),
        ...table.getEndVisibleLeafColumns()
      ].map(column => column.id),
      columnIds,
      columns,
      // The same two models `table_getRow(id, true)` consults, in the same order, read here where
      // the options behind them are still the ones this commit rendered from.
      coreRows: table.getCoreRowModel().rowsById as Record<string, Row<any>>,
      enableEditing: gate.enableEditing,
      hasCommitHandler: gate.hasCommitHandler,
      rows: table.getPrePaginatedRowModel().rowsById as Record<string, Row<any>>
    };

    version.value += 1;
  };

  // Stable identities: this goes to the session controllers, which memoize against it.
  const row = (rowId: string) => snapshot.rows[rowId] ?? snapshot.coreRows[rowId] ?? null;
  const column = (columnId: string) => snapshot.columns.get(columnId) ?? null;
  const has = (columnId: string) => snapshot.columns.has(columnId);
  const columnIds = () => snapshot.columnIds;
  const onScreen = (rowId: string) => snapshot.displayRowIds.has(rowId);
  const visibleColumnIds = () => snapshot.visibleColumnIds;
  const edit = (columnId: string) => snapshot.columns.get(columnId)?.columnDef.meta?.edit;
  const isInstant = (columnId: string) => normalizeEdit(snapshot.columns.get(columnId)?.columnDef.meta?.edit)?.kind === "instant";
  const tableGate = () => snapshot.enableEditing && snapshot.hasCommitHandler;

  const value = (rowId: string, columnId: string) => {
    const found = snapshot.rows[rowId] ?? snapshot.coreRows[rowId] ?? null;

    // The committed column's accessor over the committed row, rather than `row.getValue` — which
    // resolves the column through `row.table`, and that is the shared core. Upstream caches a
    // row's values after the first read, so in most orders the two agree; depending on that is
    // depending on having read the value already, which nothing here can promise.
    return found === null ? undefined : snapshot.columns.get(columnId)?.accessorFn?.(found.original, found.index);
  };

  const canEdit = (rowId: string, columnId: string) => {
    const found = snapshot.rows[rowId] ?? snapshot.coreRows[rowId] ?? null;

    if (!found) {
      return false;
    }

    return canEditWith(found, snapshot.columns.get(columnId)?.columnDef.meta?.edit, {
      enableEditing: snapshot.enableEditing,
      hasCommitHandler: snapshot.hasCommitHandler
    });
  };

  const committed: CommittedTable = {
    canEdit,
    column,
    columnIds,
    edit,
    has,
    isInstant,
    onScreen,
    row,
    tableGate,
    value,
    version,
    visibleColumnIds
  };

  return [committed, capture] as const;
}
