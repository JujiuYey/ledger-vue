import type { Column, Row, RowData } from "./types";

import { buildDisplayRows } from "./table-body";

/**
 * The rows and the naming column of one committed render, in the shape the handlers that answer
 * for the screen need them (docs/architecture.md). Vue edition: the snapshot is a `computed`,
 * but the shape — and the event-time rule that handlers answer from it rather than from the
 * live core — is unchanged.
 */
export interface DisplaySnapshot<TData extends RowData> {
  /**
   * Every row on screen, in display order — pinned top, the page, pinned bottom. What the
   * keyboard steps through and what the announcement counts.
   */
  ordered: Array<Row<TData>>;
  /**
   * The unpinned zone alone, which is what the virtualizer indexes.
   */
  centerRows: Array<Row<TData>>;
  topRows: Array<Row<TData>>;
  bottomRows: Array<Row<TData>>;
  /**
   * The page's own row model — what `scrollToIndex` counts through.
   */
  pageRows: Array<Row<TData>>;
  /**
   * The leading data column, whose accessor names a row for the announcement.
   */
  leadingColumn: Column<TData, unknown> | null;
  /**
   * Detail panels are on, so an expanded row owns a synthetic display item of its own.
   */
  withDetailPanels: boolean;
}

/**
 * Resolve a row against the exact list owned by the virtualizer. Pinned rows are mounted outside
 * that list, so they deliberately have no scroll index.
 */
export function resolveVirtualDisplayIndex<TData extends RowData>(
  snapshot: DisplaySnapshot<TData>,
  rowId: string
): number | null {
  const pinned = [...snapshot.topRows, ...snapshot.bottomRows].some(row => row.id === rowId);

  if (pinned) {
    return null;
  }

  const index = buildDisplayRows(snapshot.centerRows, snapshot.withDetailPanels)
    .findIndex(displayRow => displayRow.kind === "data" && displayRow.row.id === rowId);

  return index === -1 ? null : index;
}

/**
 * Names a row the way the announcements do — the leading data column's own accessor over the
 * row it is given. The common tail of the active-row announcement and the reorder session.
 */
export function announcedRowName<TData extends RowData>(
  row: Row<TData>,
  leadingColumn: Column<TData, unknown> | null
): string {
  const value = leadingColumn === null ? "" : String(leadingColumn.accessorFn?.(row.original, row.index) ?? "");

  return value === "" ? row.id : value;
}
