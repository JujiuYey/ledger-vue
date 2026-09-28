import type { RowData } from "@tanstack/vue-table";
import type { Ref } from "vue";
import { ref, watch } from "vue";

import type {
  DataTableRowEditCommit,
  LedgerRowEditingController,
  LedgerRowEditor,
  Row
} from "./types";
import type { CommittedTable } from "./use-committed-table";
import type { SliceSetter } from "./use-slice";

/**
 * The row-mode editing session (docs/editing.md#row-mode). The third of the three sessions, and
 * the same shape as the other two: everything the row's editors show, and everything its atomic
 * commit decides with, lives here rather than in the editors — a hidden column or a virtual
 * scroll unmounts an editor at any moment, and a session is not (docs/architecture.md).
 *
 * What is particular to row mode: one commit covers every editable column at once, so the drafts
 * are a store rather than a single value, and the baseline the commit departs from is snapshotted
 * when the row opens — a responsive breakpoint can take a column out of the definitions before
 * commit time, leaving no cell to read a previous value from.
 *
 * Vue edition: the composable runs once, so React's refs are plain closure bindings and there is
 * no `useEventCallback` — every handler is a stable closure by construction. The row-session epoch
 * is a ref the render layer tracks reactively, and the two commit-phase effects run as one
 * post-flush watch on the slice plus a deferred first pass.
 */
import { editErrorMessage, normalizeEdit } from "./edit-meta";

export interface UseRowEditingInput<TData extends RowData> {
  editingRowId: Ref<string | null>;
  setEditingRowId: SliceSetter<string | null>;
  /**
   * Rows, definitions and the gate as the render that reached the screen left them. Everything a
   * commit decides with comes from here rather than from the cell's own table, which is the shared
   * core and carries whatever pass ran last (see `use-committed-table.ts`).
   */
  committed: CommittedTable;
  /**
   * The commit handler, resolved per invocation — a getter so identity and presence answer a
   * runtime swap the way the React edition's per-render read did.
   */
  onRowEditCommit: () => ((change: DataTableRowEditCommit<TData>) => void | Promise<void>) | undefined;
}

/**
 * The controller's surface minus `id`, which is the slice itself and belongs to whoever owns it.
 * Declared as the public contract minus that one key so the two cannot drift apart.
 */
export type RowEditingSession = Omit<LedgerRowEditingController, "id">;

/**
 * The drafts and session bookkeeping for the row being edited. Re-keyed wholesale by
 * `openRowDrafts` — every session boundary — and mutated in place while a session lives.
 */
interface RowDrafts {
  rowId: string | null;
  values: Map<string, unknown>;
  /**
   * Every editable column's value as the row's edit began, or null while the row itself is
   * not in the table yet — see `openRowDrafts`.
   */
  baseline: Map<string, unknown> | null;
  /**
   * What this session has already written, per column, against the value the data held when
   * it went out — see `previousRowValue`.
   */
  committed: Map<string, { value: unknown; source: unknown }>;
  /**
   * Eligibility was lost during this session. It latches: a gate that reopens before an
   * in-flight write settles is the *next* session's eligibility, not a reprieve for this one.
   */
  gateLost: boolean;
  /**
   * The automatic reconciliation has already answered this session's gate closing.
   */
  reconciled: boolean;
  /**
   * The write currently out, per column, and whether the data has moved since it left. A record
   * is only true while the data has not moved past it, and the moving can happen *during* the
   * request — including out and back again, which comparing at settle time could never see.
   */
  writing: Map<string, { source: unknown; moved: boolean }> | null;
}

export function useRowEditing<TData extends RowData>({
  committed,
  editingRowId,
  onRowEditCommit,
  setEditingRowId
}: UseRowEditingInput<TData>): RowEditingSession {
  // Drafts live here, not in editors: a virtualized editing row that scrolls out unmounts its
  // editors, and the pending values must survive until the atomic commit.
  let rowDrafts: RowDrafts = {
    rowId: null,
    values: new Map(),
    baseline: new Map(),
    committed: new Map(),
    gateLost: false,
    reconciled: false,
    writing: null
  };
  const rowEditors = new Map<string, LedgerRowEditor>();
  /**
   * Bumped whenever a row session starts or ends without the slice moving — a gate shutting under
   * a controlled application that declines to close it, or an explicit start on the row already
   * named. Whether an editor may be on screen is part of the render output, so a change in it has
   * to be a change in state; the render layer tracks this ref, which is what the React edition's
   * per-epoch callback identity was for.
   */
  const rowSessionEpoch = ref(0);
  /**
   * What the row's editors show that is not a value: a write still out, and the reason the last
   * one failed. Session state, not editor state — an editor is unmounted by a hidden column or a
   * virtual scroll at any moment, and one that came back knowing neither would take input during
   * a write and let the user send a second one, while a rejection arriving with no editor mounted
   * would have had nowhere to go at all.
   */
  const rowPresentation: {
    pending: boolean;
    /**
     * `columnId: null` is the row's own failure — a rejected commit belongs to no cell, and which
     * column shows it is decided when an editor renders (`rowErrorColumnId`).
     */
    error: { columnId: string | null; message: string } | null;
  } = {
    error: null,
    pending: false
  };
  let rowFocusColumn: string | null = null;
  /**
   * The editing row as the last draw left it — updated only by the reconciliation watch, so
   * event-time paths between a `setEditingRowId` and the flush still see the row on screen, which
   * is what `start` and the session token checks must see.
   */
  let editingRow: string | null = editingRowId.value;
  /**
   * One editing session, one token. An async commit captures it and may only act on what it
   * finds afterwards if the token still matches: cancelling the row, finishing it, or opening
   * another one all end the session, and a settled request from the previous one must not close
   * the editor that replaced it (nor report its error onto that editor's first field).
   */
  let rowSessionToken = 0;
  /**
   * The in-flight row commit, so repeated `stopEditing({ commit: true })` calls wait on one
   * result instead of firing `onRowEditCommit` again — the single-flight guarantee cell mode
   * already makes (docs/editing.md). It carries its owner: a request belonging to a session
   * that has ended is not a request the next row may join, or its own write would never be sent.
   */
  let rowPendingCommit: { session: number; rowId: string; promise: Promise<boolean> } | null = null;
  let rowStartRequestToken = 0;

  /**
   * Ends the session: whatever is in flight stops owning the row, and stops speaking for it.
   */
  const endRowSession = () => {
    rowSessionToken += 1;
    rowPendingCommit = null;
  };

  /**
   * Every editable value of `rowId` as it stands now, or null while that row is not in the
   * table: an application can name the row it wants edited before the fetch carrying it lands,
   * and "this row has no previous values" is a different answer from "there is no row to ask".
   */
  const snapshotEditableValues = (rowId: string): Map<string, unknown> | null => {
    if (committed.row(rowId) === null) {
      return null;
    }

    const baseline = new Map<string, unknown>();

    for (const columnId of committed.columnIds()) {
      if (committed.canEdit(rowId, columnId)) {
        baseline.set(columnId, committed.value(rowId, columnId));
      }
    }

    return baseline;
  };

  /**
   * Opens the draft store on a row. The baseline is snapshotted now, while every editable
   * column still exists: a responsive breakpoint removes a column from the definitions before
   * TanStack ever sees it, so by commit time its cell is gone and there is nothing left to read
   * a previous value from. A row the table does not hold yet leaves the baseline unrecorded for
   * the reconciliation below to take once it arrives.
   */
  const openRowDrafts = (rowId: string | null) => {
    rowDrafts = {
      rowId,
      values: new Map(),
      baseline: rowId === null ? new Map() : snapshotEditableValues(rowId),
      committed: new Map(),
      gateLost: false,
      reconciled: false,
      writing: null
    };
    rowPresentation.pending = false;
    rowPresentation.error = null;
  };

  /**
   * The drafts held for `rowId`. A read, never a write: editors read their draft while
   * rendering, and a render can be thrown away (a transition that suspends), so re-keying the
   * store from here would let an abandoned render erase the values on screen. The reconciliation
   * is the store's only keyer. A caller asking about another row gets nothing, which is the
   * truth.
   */
  const draftsFor = (rowId: string | null): Map<string, unknown> => rowDrafts.rowId === rowId ? rowDrafts.values : new Map();

  /**
   * What the application last knew this column to hold — the value the row is editing away from.
   * A session can outlive its own writes: a controlled application may decline to close the row,
   * and the data it feeds back arrives whenever it arrives. Until then `source` — what the cell
   * read when the write went out — still matches, and the value written is the newer truth. Once
   * the data moves, it wins: it may be our write applied, normalised, or somebody else's.
   */
  const previousRowValue = (columnId: string, source: unknown): unknown => {
    const written = rowDrafts.committed.get(columnId);

    return written && Object.is(written.source, source) ? written.value : source;
  };

  /**
   * Takes back the pending values a write actually carried, leaving anything typed since. What it
   * carried is recorded as committed instead; a draft left standing over it would go on beating
   * the data the application feeds back — including a value it normalized on the way in.
   */
  const consumeCommittedRowDrafts = (rowId: string, sent: Record<string, unknown>) => {
    if (rowDrafts.rowId !== rowId) {
      return;
    }

    for (const [columnId, value] of rowDrafts.values) {
      if (Object.hasOwn(sent, columnId) && Object.is(value, sent[columnId])) {
        rowDrafts.values.delete(columnId);
      }
    }
  };

  /**
   * Records a write that went through, so the next commit departs from it rather than from data
   * that has not caught up. The entry is retired by `reconcileRowEligibility` the moment the data
   * moves — see `previousRowValue`.
   */
  const recordRowCommit = (rowId: string, values: Record<string, unknown>, sources: Map<string, unknown>) => {
    if (rowDrafts.rowId !== rowId) {
      return;
    }

    const { writing } = rowDrafts;

    for (const [columnId, value] of Object.entries(values)) {
      // A column whose data moved while the request was out has nothing for this write to still
      // be true about: what the application holds there is its own.
      if (writing?.get(columnId)?.moved === true) {
        rowDrafts.committed.delete(columnId);

        continue;
      }

      rowDrafts.committed.set(columnId, { value, source: sources.get(columnId) });
    }

    rowDrafts.writing = null;
  };

  /**
   * Whether the row holds a value the write that just settled never carried. A custom editor is
   * not disabled while a request is out, so the user can type straight past it; leaving on that
   * write's word would drop what they typed.
   */
  const hasUncommittedRowEdits = (rowId: string, sent: Record<string, unknown>): boolean => {
    if (rowDrafts.rowId !== rowId) {
      return false;
    }

    for (const [columnId, value] of rowDrafts.values) {
      if (!Object.hasOwn(sent, columnId) || !Object.is(value, sent[columnId])) {
        return true;
      }
    }

    return false;
  };

  /**
   * Throws the whole pending edit away — what cancelling means. The mounted editors are put back
   * alongside the store because the row can stay on screen: a controlled application may decline
   * to close it, and an editor still showing a value the store no longer holds is one nothing
   * would commit. What they show once the store is empty is the store's answer again — the value
   * the session has written, or the data — so they are only asked to draw themselves anew.
   */
  const discardRowEdits = (rowId: string | null) => {
    if (rowId === null || rowDrafts.rowId !== rowId) {
      return;
    }

    rowDrafts.values.clear();
    rowPresentation.error = null;

    for (const editor of rowEditors.values()) {
      editor.redraw();
    }
  };

  /**
   * Asks for the row edit to end. A request, not the ending itself: `editingRowId` is a
   * controlled slice, and an application may answer `onEditingRowIdChange` by leaving the prop
   * exactly where it was. The row then stays on screen, and a row on screen is one the user can
   * still type into — so the session, its ownership of an in-flight commit, and the draft store
   * all stay with it until a draw says otherwise.
   */
  const finishRowEditing = () => {
    rowFocusColumn = null;
    setEditingRowId(null);
  };

  /**
   * Reconciles the session with the row that actually reached the screen. Every change of
   * `editingRowId` lands here, ledger's own requests included, because it is a controlled
   * slice: `startRowEditing` and `finishRowEditing` can only ask, and an application may move
   * the edit itself, answer with a different row, or decline to move it at all. Committing the
   * boundary anywhere else would leave the session speaking for a row nobody is editing.
   *
   * It runs after the draw — in the post-flush watch below — never during one: ending a session
   * is a real side effect (it invalidates an in-flight commit's ownership), and the row's
   * editors register for the new row before this runs, once the draw that carried the slice has
   * happened. The drafts store has to be keyed by then, before anything can be typed into it.
   */
  const reconcileRowSlice = () => {
    const current = editingRowId.value;
    const moved = editingRow !== current;

    if (moved) {
      endRowSession();

      if (current !== null) {
        // A `startRowEditing` still waiting on a commit was going to open a row, and the edit
        // has landed on a different one — that request is overruled. Landing on *no* row is the
        // ordinary end of the very commit it is waiting for, and must not cancel it.
        rowStartRequestToken += 1;
      }

      editingRow = current;
    }

    if (moved || rowDrafts.rowId !== current) {
      // The second test also catches the first pass, where the mirror already agrees with the
      // prop but the store has never been keyed: a controlled row open from the very first draw
      // still needs its baseline.
      openRowDrafts(current);
    } else if (current !== null && rowDrafts.baseline === null) {
      // The row was not in the table when the edit opened. Data arriving later is the first
      // chance to record what the user is editing away from; anything typed meanwhile stays.
      rowDrafts.baseline = snapshotEditableValues(current);
    }

    // React ran the eligibility reconciliation after the boundary on every render; the slice
    // moving is one, and a row editor registering is the other the Vue edition sees.
    reconcileRowEligibility();
  };

  /**
   * Reconciles the row being edited with the table it lives in. Three things can move under an
   * open row, and only one of them ends it:
   *
   * - the data moves past a value this session wrote — the overlay entry retires for good, so
   * data that later returns to what the write departed from cannot bring our value back with
   * it (`previousRowValue` tests the same thing, for the reads that happen before this runs);
   * - a column's gate shuts (`meta.edit` removed, `edit.enabled(row)` turning false) — its
   * pending value goes now rather than at commit time, so a gate that reopens cannot bring back
   * a draft nothing was showing;
   * - a column simply leaves the definitions, a responsive breakpoint crossing — nothing shut,
   * the layout changed, and its draft still commits against the baseline (docs/editing.md).
   *
   * So the row ends when the table switch is off, or when the gate shut on a column this session
   * was editing and none is left editable. A row the table does not hold yet has not arrived,
   * which is not the same as a row that may not be edited.
   *
   */
  const markRowGateLost = () => {
    if (rowDrafts.gateLost) {
      return;
    }

    rowDrafts.gateLost = true;
    rowSessionEpoch.value += 1;
  };

  /**
   * Cancels the session: what it holds is discarded — it never passed a gate — and the close is
   * asked for.
   */
  const cancelLostRowSession = (rowId: string) => {
    rowDrafts.reconciled = true;
    discardRowEdits(rowId);
    finishRowEditing();
  };

  /**
   * Ends a session whose eligibility is gone, once nothing is still out on its behalf. Returns
   * whether it ended the row: a session that stops because the gate shut was cancelled, not
   * finished, so nothing waiting on a commit may move on the strength of it.
   */
  const endLostRowSession = (rowId: string): boolean => {
    if (!rowDrafts.gateLost) {
      return false;
    }

    // The write already out passed the gate before it shut; its settlement calls this again and
    // completes the cancel. The loss is recorded either way, so a gate reopening cannot undo it.
    if (rowPendingCommit) {
      return false;
    }

    // Once per session. This runs after every draw, and an application that ignores the close
    // would otherwise be asked again on each one — reconciliation, not nagging. An explicit stop
    // or start goes its own way and is always a fresh request.
    if (rowDrafts.reconciled) {
      return false;
    }

    cancelLostRowSession(rowId);

    return true;
  };

  const reconcileRowEligibility = (): boolean => {
    const rowId = editingRow;

    if (rowId === null) {
      return false;
    }

    // The table-level gate — the switch and the mode's commit handler — is answered before the row
    // is even looked for. A session opened on a row whose data has not arrived would otherwise
    // survive it closing, and one that reopened before the data landed would find the old session
    // waiting.
    if (!committed.tableGate()) {
      markRowGateLost();
    }

    const row = committed.row(rowId);

    if (!row) {
      // Not in the table: a row that has not arrived, or one the data no longer holds. Neither is
      // a gate closing, so the session stands — but a switch that shut above still ends it.
      return endLostRowSession(rowId);
    }

    const { baseline } = rowDrafts;
    let editable = false;
    let gateShut = false;

    for (const columnId of committed.columnIds()) {
      const source = committed.value(rowId, columnId);
      const written = rowDrafts.committed.get(columnId);

      if (written && !Object.is(written.source, source)) {
        rowDrafts.committed.delete(columnId);
      }

      // The same watch, for a write still out: it has no record to retire yet, so the movement
      // has to be remembered until it does.
      const writing = rowDrafts.writing?.get(columnId);

      if (writing && !Object.is(writing.source, source)) {
        writing.moved = true;
      }

      if (committed.canEdit(rowId, columnId)) {
        editable = true;

        // The last effective previous this session saw for the column, refreshed while it is
        // here to be seen: `previousValues` means what the application last knew, and a column
        // whose definition later disappears has nothing else left to answer with. Recording it
        // on every sighting also gives the session its membership — which is how a gate shutting
        // on a column it was editing is told apart from a breakpoint taking one away.
        baseline?.set(columnId, previousRowValue(columnId, source));
      } else {
        gateShut ||= baseline?.has(columnId) ?? false;
        rowDrafts.values.delete(columnId);
      }
    }

    // What keeps a row editing: a cell it can edit now, or values it still owes a commit for a
    // column whose *definition* left — a breakpoint crossing, which shut no gate. A gate really
    // shutting on a column this session was editing ends it, and so does a session that never had
    // anything to edit at all (no `meta.edit`, or no handler for the mode).
    if (!(editable || (!gateShut && (baseline?.size ?? 0) > 0))) {
      markRowGateLost();
    }

    return endLostRowSession(rowId);
  };

  // Both commit-phase effects of the React edition run as one post-flush watch on the slice here:
  // the session boundary first (React's layout effect), the eligibility reconciliation second
  // (React's passive effect) — the order the renders ran them in. The first pass is deferred to a
  // microtask: `committed` is captured by `useDataTable` once the table exists, and a row a
  // controlled application names up front gets its baseline from that capture rather than from
  // the empty snapshot setup starts with.
  watch(editingRowId, () => reconcileRowSlice(), { flush: "post" });
  queueMicrotask(reconcileRowSlice);
  // The committed render moving is the other half of React's dependency-free effect: the slice
  // and the editors are not the only things that can strand a session — data arriving fills a
  // null baseline, and the gate shutting without session traffic must still be latched.
  watch(committed.version, () => reconcileRowSlice(), { flush: "post" });

  /**
   * Whether the request issued under `session` still speaks for `rowId`. Sessions end the moment
   * the drawn row changes, so the two tests agree by construction; the row id is spelled out
   * because acting on another row's editors is precisely what a stale settlement must not do.
   */
  const isCurrentRowSession = (session: number, rowId: string) => rowSessionToken === session && editingRow === rowId;

  /**
   * The column currently showing the row's failure: the one it names, or for a row-level failure
   * the first editable column with an editor on screen, in the row's own cell order. Resolved on
   * every read rather than fixed when the failure is reported, so a message follows the screen
   * when the column under it is hidden or scrolls away.
   */
  const rowErrorColumnId = (rowId: string): string | null => {
    const { error } = rowPresentation;

    if (!error) {
      return null;
    }

    if (error.columnId !== null) {
      return error.columnId;
    }

    return committed
      .columnIds()
      .find(columnId => committed.canEdit(rowId, columnId) && rowEditors.has(columnId)) ?? null;
  };

  // Stable, and reads nothing but session state — so `registerRowEditor` can close over it
  // directly rather than through a mirror written during render.
  const redrawRowEditors = () => {
    for (const editor of rowEditors.values()) {
      editor.redraw();
    }
  };

  /**
   * Only a row-level failure is projected onto whoever is on screen, so only that has to be
   * redrawn when the registry changes; everything else an editor shows it already reads for
   * itself as it renders.
   */
  const redrawRowLevelError = () => {
    if (rowPresentation.error?.columnId === null) {
      redrawRowEditors();
    }
  };

  const setRowPending = (pending: boolean) => {
    rowPresentation.pending = pending;
    redrawRowEditors();
  };

  /**
   * Records a failure on the session, so it outlives the editors: one that is unmounted when the
   * message arrives shows it when it comes back. `columnId: null` is the row's own — a rejected
   * commit belongs to no cell.
   */
  const reportRowError = (rowId: string, columnId: string | null, message: string) => {
    rowPresentation.error = { columnId, message };
    redrawRowEditors();

    const shown = rowErrorColumnId(rowId);

    if (shown !== null) {
      rowEditors.get(shown)?.focus();
    }
  };

  const commitRow = (): boolean | Promise<boolean> => {
    const rowId = editingRow;

    if (rowId === null) {
      return true;
    }

    // Idempotent while pending: a second Enter, a blur behind it, or the application calling
    // `stopEditing` again all join the request already in flight rather than issuing another
    // write. Only the owner may join — a request left over from a row the controller has moved
    // on from would otherwise stand in for this row's write, which would then never be sent.
    const inFlight = rowPendingCommit;

    if (inFlight && inFlight.session === rowSessionToken && inFlight.rowId === rowId) {
      return inFlight.promise;
    }

    // Eligibility is re-read here, not trusted from when the session opened: `enableEditing` can
    // switch off, `meta.edit` can be removed, and `edit.enabled(row)` — application code, which
    // nothing makes answer the same way twice — can turn false with no draw in between, which
    // makes this commit the first thing to learn of it. The same reconciliation the watch runs,
    // so the table-level switch, a gate closing on a column this session was editing, and a
    // breakpoint merely taking a column away are told apart exactly once, in one place.
    //
    // A session cancelled that way did not finish: what it held never passed a gate and is
    // discarded rather than promoted (a draft whose column also left the definitions has no cell
    // left to test it against, and the baseline path below would otherwise reconstruct and send
    // it), and nothing waiting to move may proceed on the strength of it.
    const cancelledNow = reconcileRowEligibility();

    if (rowDrafts.gateLost) {
      if (!cancelledNow) {
        // Reconciliation is once per session; a command is not. An owner that declined the close
        // still has this row on screen, so it is asked again.
        cancelLostRowSession(rowId);
      }

      return false;
    }

    const row = committed.row(rowId);

    if (!row) {
      // The row left the data set mid-edit — there is nothing to commit onto.
      finishRowEditing();
      return true;
    }

    rowPresentation.error = null;
    redrawRowEditors();

    // Every editable column, not just the visible ones (docs/api.md: "every editable column,
    // drafts merged in"). Hiding a column mid-edit — the columns panel, or a responsive
    // breakpoint crossing on a window resize — must not silently drop the value typed into it,
    // still less make `changed` false and discard the whole commit.
    const presentColumnIds = committed.columnIds();
    const editableColumnIds = presentColumnIds.filter(columnId => committed.canEdit(rowId, columnId));
    const drafts = draftsFor(rowId);
    const values: Record<string, unknown> = {};
    const previousValues: Record<string, unknown> = {};
    // What the data itself reads, so a write that goes through can later be told apart from the
    // data catching up with it.
    const sources = new Map<string, unknown>();
    let changed = false;

    for (const columnId of editableColumnIds) {
      const source = committed.value(rowId, columnId);
      const previous = previousRowValue(columnId, source);
      const value = drafts.has(columnId) ? drafts.get(columnId) : previous;
      sources.set(columnId, source);
      values[columnId] = value;
      previousValues[columnId] = previous;
      changed ||= !Object.is(value, previous);
    }

    // Drafts whose column produced no entry above fall into two very different cases.
    for (const [columnId, value] of drafts) {
      if (Object.hasOwn(values, columnId)) {
        continue;
      }

      if (committed.has(columnId)) {
        // The column is still here, it simply stopped being editable mid-edit — `meta.edit`
        // removed, or `edit.enabled(row)` now false for this row. Committing that draft would
        // push a value through a gate the application just closed, and unvalidated besides (the
        // validation pass below only walks editable cells). The pending value is dropped, not
        // promoted. (The reconciliation at the entry to `commitRow` has usually done this
        // already; a column whose gate shut between the two is why it is still tested here.)
        drafts.delete(columnId);

        continue;
      }

      // The other case: the column left the definitions entirely — a responsive breakpoint
      // crossing removes it before TanStack ever sees it, so there is no cell to read. The value
      // the user typed is still theirs and commits against the baseline captured at edit start.
      // Its `validate` cannot run, because the definition that carried it is gone.
      const source = rowDrafts.baseline?.get(columnId);
      const previous = previousRowValue(columnId, source);
      sources.set(columnId, source);
      values[columnId] = value;
      previousValues[columnId] = previous;
      changed ||= !Object.is(value, previous);
    }

    // First validation failure focuses its editor and blocks the whole row.
    for (const columnId of editableColumnIds) {
      const normalized = normalizeEdit(committed.edit(columnId));

      if (!normalized?.validate) {
        continue;
      }

      let message: string | null;

      try {
        message = normalized.validate(values[columnId], row);
      } catch (error) {
        message = editErrorMessage(error);
      }

      if (message !== null) {
        reportRowError(rowId, columnId, message);

        return false;
      }
    }

    if (!changed) {
      finishRowEditing();
      return true;
    }

    let result: void | Promise<void>;

    try {
      // Single erasure, the same boundary the render layer crosses: the committed resolver speaks
      // the erased shape, and v9's `in out` generics make Row invariant in TData.
      result = onRowEditCommit()?.({
        row: row as Row<TData>,
        values,
        previousValues
      });
    } catch (error) {
      reportRowError(rowId, null, editErrorMessage(error));
      return false;
    }

    if (result && typeof result.then === "function") {
      const session = rowSessionToken;
      rowDrafts.writing = new Map(
        [...sources].map(([columnId, source]) => [columnId, { moved: false, source }])
      );
      setRowPending(true);

      const pending = Promise.resolve(result).then(
        () => {
          // Everything below touches the editors on screen, so a request whose session has
          // ended stops here: its row was cancelled or replaced, and the editors it would
          // close or un-pend belong to whoever came next. It reports failure, because the
          // caller waiting on it wanted to leave *that* row and that row is already gone —
          // navigating on its word would move an edit the controller has since redirected.
          if (!isCurrentRowSession(session, rowId)) {
            return false;
          }

          rowPendingCommit = null;
          recordRowCommit(rowId, values, sources);
          consumeCommittedRowDrafts(rowId, values);
          setRowPending(false);

          // The gate may have shut while this write was out; the test was held off until the
          // write it let through had landed. If it did shut, the row has just been cancelled —
          // it did not finish here, and a switch waiting on this commit must not open a row
          // nobody may edit.
          if (reconcileRowEligibility()) {
            return false;
          }

          if (hasUncommittedRowEdits(rowId, values)) {
            // Typed straight past the request while it was out. The write did go through, but
            // this row is not finished — and whoever was waiting to leave it must not.
            return false;
          }

          finishRowEditing();

          return true;
        },
        (error: unknown) => {
          if (!isCurrentRowSession(session, rowId)) {
            return false;
          }

          rowPendingCommit = null;
          rowDrafts.writing = null;
          setRowPending(false);
          reportRowError(rowId, null, editErrorMessage(error));
          reconcileRowEligibility();

          return false;
        }
      );

      rowPendingCommit = {
        session,
        rowId,
        promise: pending
      };

      return pending;
    }

    recordRowCommit(rowId, values, sources);
    consumeCommittedRowDrafts(rowId, values);
    finishRowEditing();
    return true;
  };

  /**
   * Focuses a mounted editor of the row being edited. A column not yet on screen — hidden, or
   * scrolled out of the virtual window — is left to `shouldFocus` when its editor mounts.
   */
  const focusRowColumn = (columnId: string | undefined) => {
    if (columnId !== undefined) {
      rowEditors.get(columnId)?.focus();
    }
  };

  const startRowEditing = (rowId: string, startOptions?: { focusColumnId?: string }) => {
    if (editingRow === rowId) {
      rowFocusColumn = startOptions?.focusColumnId ?? rowFocusColumn;

      if (rowDrafts.gateLost) {
        // The session on this row is over — its gate shut, and a controlled application declined
        // to close it. An explicit start is not that session coming back: it is the next one, so
        // it gets a new token and a fresh baseline, and nothing the old one held survives. The
        // slice already names this row, so no draw would arrive to do it for us.
        endRowSession();
        openRowDrafts(rowId);
        rowSessionEpoch.value += 1;
      }

      // A live session focuses the column asked for: the editors are already mounted, and the
      // slice is not moving, so nothing else would.
      redrawRowEditors();
      focusRowColumn(startOptions?.focusColumnId);

      return;
    }

    // Like `finishRowEditing`, a request: the session boundary is taken by the reconciliation
    // watch, once a draw has actually put this row on screen.
    const begin = () => {
      rowFocusColumn = startOptions?.focusColumnId ?? null;
      setEditingRowId(rowId);
    };

    if (editingRow === null) {
      begin();
      return;
    }

    // Another row is mid-edit: commit it first (commit, never discard); only success moves on,
    // and only the latest start request may win after an async commit settles.
    const request = ++rowStartRequestToken;
    const outcome = commitRow();

    if (typeof outcome === "boolean") {
      if (outcome) {
        begin();
      }

      return;
    }

    void outcome.then(success => {
      if (success && rowStartRequestToken === request) {
        begin();
      }
    });
  };

  const stopRowEditing = (stopOptions?: { commit?: boolean }) => {
    if (stopOptions?.commit ?? true) {
      void commitRow();
    } else {
      discardRowEdits(editingRow);
      finishRowEditing();
    }
  };

  const shouldFocusRowColumn = (columnId: string) => rowFocusColumn === columnId;

  /**
   * Whether this row has a live editing session. The slice naming a row is not enough: its gate
   * may have shut while a controlled application declined to close it, and a session whose
   * eligibility is gone must not put an interactive editor back on screen when the gate reopens.
   */
  const rowSessionActive = (rowId: string): boolean => {
    // Asked during render, so it cannot consult the committed snapshot — that still names the row
    // this one is replacing. A row the store has not been keyed to yet is a session about to
    // open, which is live by definition; only the one being tracked can have lost its gate.
    //
    // The epoch read is the point: the answer lives in session state, so this reactive read is
    // what carries a session starting or ending into the render layer's reactive graph.
    const generation = rowSessionEpoch.value;

    return generation >= 0 && (rowDrafts.rowId === rowId ? !rowDrafts.gateLost : true);
  };

  const registerRowEditor = (columnId: string, editor: LedgerRowEditor) => {
    rowEditors.set(columnId, editor);
    redrawRowLevelError();
    // The React edition reconciled after every render; a row editor mounting is the moment one
    // is known to have happened here.
    reconcileRowEligibility();

    return () => {
      if (rowEditors.get(columnId) !== editor) {
        return;
      }

      rowEditors.delete(columnId);
      redrawRowLevelError();
      // An editor leaving is a render's worth of news too — the last one unmounting is how a
      // gate shuts on the only column this session met.
      reconcileRowEligibility();
    };
  };

  /**
   * The store is what a row editor shows, rather than a value it copies at mount: what the row
   * holds moves under it — the application feeds a write back, normalizes it, or another writer
   * changes it — and an editor with its own copy would go on showing a value the row left behind.
   * Editors name the row they belong to instead of reading it from a shared mutable binding,
   * because two rows' editors can be on screen at once while a switch is reconciled.
   */
  const rowDraftsApi = {
    pending: (rowId: string) => rowDrafts.rowId === rowId && rowPresentation.pending,
    error: (rowId: string, columnId: string) => {
      if (rowDrafts.rowId !== rowId || rowErrorColumnId(rowId) !== columnId) {
        return null;
      }

      return rowPresentation.error?.message ?? null;
    },
    read: (rowId: string, columnId: string, source: unknown) => {
      if (rowDrafts.rowId !== rowId) {
        return source;
      }

      return rowDrafts.values.has(columnId)
        ? rowDrafts.values.get(columnId)
        : previousRowValue(columnId, source);
    },
    write: (rowId: string, columnId: string, value: unknown) => {
      if (rowDrafts.rowId !== rowId) {
        return;
      }

      rowDrafts.values.set(columnId, value);

      // Typing answers the complaint the field is showing, and only that one: another column's
      // message is still true, and its editor is not the one being redrawn.
      if (rowErrorColumnId(rowId) === columnId) {
        rowPresentation.error = null;
      }
    }
  };

  // Stable identities all the way out: this surface goes into `meta.ledger`, and the render layer
  // reads it inside its reactive scopes — the closures here are stable for the composable's life,
  // and each of them reads nothing but session state.
  return {
    active: rowSessionActive,
    commit: commitRow,
    drafts: rowDraftsApi,
    register: registerRowEditor,
    shouldFocus: shouldFocusRowColumn,
    start: startRowEditing,
    stop: stopRowEditing
  };
}
