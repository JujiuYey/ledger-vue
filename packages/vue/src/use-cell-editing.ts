import type { RowData } from "@tanstack/vue-table";
import type { Ref } from "vue";
import { ref, watch } from "vue";

import type {
  DataTableEditCommit,
  DataTableEditingCell,
  LedgerCellEditor
} from "./types";
import type { CommittedTable } from "./use-committed-table";
import type { SliceSetter } from "./use-slice";

/**
 * The cell-mode editing session (docs/architecture.md — "Editing sessions live in the controller,
 * not in the editors"). Everything an editor for one cell shows, and everything the commit needs
 * to decide with, lives here: an editor is unmounted by a hidden column or a virtual scroll at any
 * moment, and a session is not. A mounted editor is a view of this plus a keyboard surface.
 *
 * Vue edition: the composable runs once, so React's refs are plain closure bindings and there is
 * no `useEventCallback` — every handler is a stable closure by construction. The epoch is a ref
 * the render layer tracks reactively (the counterpart of React's per-epoch callback identity), and
 * the two commit-phase effects run as one post-flush watch on the slice plus a deferred first pass.
 */
import { editErrorMessage, normalizeEdit } from "./edit-meta";
import { isPromiseLike } from "./utils";

export interface UseCellEditingInput<TData extends RowData> {
  editingCell: Ref<DataTableEditingCell | null>;
  setEditingCell: SliceSetter<DataTableEditingCell | null>;
  /**
   * Rows, definitions and the gate as the render that reached the screen left them. Everything a
   * commit decides with comes from here rather than from the cell's own table, which is the shared
   * core and carries whatever pass ran last (see `use-committed-table.ts`).
   */
  committed: CommittedTable;
  onEditCommit: ((change: DataTableEditCommit<TData>) => void | Promise<void>) | undefined;
}

export interface CellEditingSession {
  active: (rowId: string, columnId: string) => boolean;
  start: (cell: DataTableEditingCell) => void;
  stop: (options?: { commit?: boolean }) => void;
  clear: () => void;
  commit: () => boolean | Promise<boolean>;
  cancel: () => void;
  read: (rowId: string, columnId: string, source: unknown) => unknown;
  /**
   * Commits and moves to the row's next (or previous) editable cell — the row as the screen has
   * it. Answered here rather than by the editor, which would have to walk the shared core.
   */
  moveTo: (backwards: boolean) => void;
  firstEditable: (rowId: string, skipInstant: boolean) => string | null;
  write: (rowId: string, columnId: string, value: unknown) => void;
  pending: (rowId: string, columnId: string) => boolean;
  error: (rowId: string, columnId: string) => string | null;
  register: (rowId: string, columnId: string, editor: LedgerCellEditor) => () => void;
}

interface CellStore {
  rowId: string | null;
  columnId: string | null;
  /**
   * The pending value; null while the session holds nothing the application has not seen.
   */
  draft: { value: unknown } | null;
  /**
   * What this session wrote, against what the data read when it went out. While it stands it is
   * what the cell holds; the reconciliation below retires it for good once the data moves past it.
   */
  written: { value: unknown; source: unknown } | null;
  error: string | null;
  /**
   * The session has sent, or discarded, what it holds. A new value reopens it.
   */
  settled: boolean;
  /**
   * Eligibility was lost during this session. It latches: a gate that reopens before an in-flight
   * write settles is the *next* session's eligibility, not a reprieve for this one.
   */
  gateLost: boolean;
  /**
   * The automatic reconciliation has already answered this session's gate closing.
   */
  reconciled: boolean;
  /**
   * The write currently out, and whether the data has moved since it left. A record is only true
   * while the data has not moved past it, and the moving can happen *during* the request —
   * including out and back again, which comparing at settle time could never see.
   */
  writing: { source: unknown; moved: boolean } | null;
}

function closedStore(): CellStore {
  return {
    columnId: null,
    draft: null,
    error: null,
    gateLost: false,
    reconciled: false,
    rowId: null,
    settled: false,
    writing: null,
    written: null
  };
}

export function useCellEditing<TData extends RowData>({
  editingCell,
  setEditingCell,
  committed,
  onEditCommit
}: UseCellEditingInput<TData>): CellEditingSession {
  let store = closedStore();
  /**
   * Bumped whenever a session starts or ends without the slice moving — a gate shutting under a
   * controlled application that declines to close it, or an explicit start on the cell already
   * named. Whether an editor may be on screen is part of the render output, so a change in it has
   * to be a change in state; the render layer tracks this ref, which is what the React edition's
   * per-epoch callback identity was for.
   */
  const epoch = ref(0);
  /**
   * One session, one token: a settled request may only act on the session that issued it.
   */
  let sessionToken = 0;
  let pendingCommit: { promise: Promise<boolean>; session: number } | null = null;
  let pendingWrite = false;
  /**
   * The editors on screen, each with the cell it belongs to — see `register`.
   */
  const editors = new Map<LedgerCellEditor, DataTableEditingCell>();
  /**
   * Only the latest navigation request may win after an async commit settles.
   */
  let requestToken = 0;
  /**
   * The cell that actually reached the screen — see the reconciliation watch. Updated only there,
   * never read straight off the slice: between a `setEditingCell` and the flush that draws it,
   * this still names the cell on screen, which is exactly what `start` and `clear` must see.
   */
  let rendered: DataTableEditingCell | null = editingCell.value;
  /**
   * The armed unmount commit, with the session and cell whose departure armed it.
   */
  let unmountCommit: {
    session: number;
    target: DataTableEditingCell;
    timer: ReturnType<typeof setTimeout> | null;
  } | null = null;

  const disarmUnmountCommit = () => {
    const armed = unmountCommit;

    if (armed === null) {
      return;
    }

    unmountCommit = null;

    if (armed.timer !== null) {
      clearTimeout(armed.timer);
    }
  };

  const redraw = () => {
    for (const editor of editors.keys()) {
      editor.redraw();
    }
  };

  /**
   * How many editors for `target` are on screen right now.
   */
  const mountedFor = (target: DataTableEditingCell): number => {
    let count = 0;

    for (const owner of editors.values()) {
      if (owner.rowId === target.rowId && owner.columnId === target.columnId) {
        count += 1;
      }
    }

    return count;
  };

  const isSession = (rowId: string, columnId: string) => store.rowId === rowId && store.columnId === columnId;

  /**
   * What the cell holds as far as the application is concerned: the value this session wrote while
   * the data has not moved past it, otherwise the data itself.
   */
  const settledValue = (source: unknown): unknown => {
    const record = store.written;

    return record && Object.is(record.source, source) ? record.value : source;
  };

  /**
   * Whether the cell may still be edited right now — the gate, re-read against the commit.
   */
  const stillEditable = (rowId: string, columnId: string): boolean => committed.canEdit(rowId, columnId);

  /**
   * Asks for the session to close. Deliberately not a navigation request: a commit closing the
   * cell it just wrote is the very thing a `start` waiting on that commit is waiting *for*, and
   * cancelling the move it is about to make would strand it. Only explicit navigation — another
   * `start`, or a `stop` — invalidates a pending one.
   */
  const requestClose = () => setEditingCell(null);

  /**
   * Ends whatever session the store holds and opens the one for `target`, or none. Every session
   * boundary goes through here — the reconciliation watch, and the in-place restart in `start` —
   * so that a session ends whole: a boundary that disowned only some of what the last one held
   * would leave the rest of it speaking for its successor. A departure that has not fired yet
   * belongs to the session ending here, and a write still out belongs to nobody: its settlement
   * finds a token that no longer matches and touches nothing, so the flag it would have cleared
   * has to be cleared now or the next session opens permanently pending.
   */
  const beginSession = (target: DataTableEditingCell | null) => {
    disarmUnmountCommit();
    sessionToken += 1;
    pendingCommit = null;
    pendingWrite = false;
    store = target === null
      ? closedStore()
      : {
          ...closedStore(),
          columnId: target.columnId,
          rowId: target.rowId
        };
  };

  /**
   * Reconciles the session with the cell that actually reached the screen. Runs after the draw —
   * in the post-flush watch below — never during one: an editor for the new cell registers before
   * this runs, and the boundary it belongs to is keyed here, once the draw that carried it has
   * happened.
   */
  const reconcileSlice = (next: DataTableEditingCell | null) => {
    rendered = next;

    const owner = store;
    const moved = owner.rowId !== (next?.rowId ?? null) || owner.columnId !== (next?.columnId ?? null);

    // Judged against what the store holds, not against a mirror of the prop: a table that opens
    // with `editingCell` already set has a session to open on its very first pass, and comparing
    // mirrors would call that "unmoved" and never key the store at all.
    if (moved) {
      beginSession(next);
    }

    // The React edition ran the passive gate reconciliation after the boundary on every render;
    // the slice moving is one, and an editor registering is the other the Vue edition sees.
    reconcileEligibility();
  };

  const setError = (message: string | null) => {
    store.error = message;
    redraw();
  };

  const setPending = (pending: boolean) => {
    pendingWrite = pending;
    redraw();
  };

  /**
   * Ends the session as a cancellation: what it held is discarded, and the close is requested.
   */
  const markGateLost = () => {
    if (store.gateLost) {
      return;
    }

    store.gateLost = true;
    epoch.value += 1;
  };

  /**
   * Ends a session whose eligibility is gone. Idempotent per session, which is what makes the
   * automatic path safe to reach from the reconciliation, from a settling write, and from an
   * editor leaving the screen because the gate took it away — an application that ignores the
   * close would otherwise be asked once for each. A command is never this: an Escape, a
   * `stopEditing`, or a `startEditing` that has to leave this cell first is always a fresh
   * request, because an owner that declined the last one still has the cell on screen. Reported
   * back, so that a command finding the session already reconciled can ask again itself.
   */
  const closeLostSession = (): boolean => {
    if (store.reconciled) {
      return false;
    }

    store.reconciled = true;
    store.draft = null;
    store.error = null;
    store.settled = true;
    redraw();
    requestClose();

    return true;
  };

  const cancel = () => {
    if (pendingWrite) {
      return;
    }

    store.draft = null;
    store.error = null;
    store.settled = true;
    redraw();
    requestClose();
  };

  const commit = (): boolean | Promise<boolean> => {
    const { rowId, columnId } = store;

    if (rowId === null || columnId === null) {
      return true;
    }

    const inFlight = pendingCommit;

    if (inFlight && inFlight.session === sessionToken) {
      return inFlight.promise;
    }

    if (store.settled) {
      if (store.gateLost) {
        // This session was cancelled, not finished, so nothing waiting to move may proceed on
        // the strength of it. Reconciliation has already discarded what it held and asked once
        // for the close; this is a command, so it asks again.
        requestClose();

        return false;
      }

      // Nothing new to send. Still a request to leave, though: an application that ignored the
      // first one keeps this session open, and asking again is how it is closed.
      requestClose();

      return true;
    }

    const row = committed.row(rowId);

    if (!row) {
      // The row is not in the table — a target that has not arrived, or one the data no longer
      // holds. Nothing about that is a gate closing, so the session is not cancelled and nothing
      // it holds is discarded; but there is nothing to write either, and an explicit stop still
      // has to be able to close a session waiting on a row that never came.
      store.settled = true;
      requestClose();

      return true;
    }

    // Eligibility is re-read here, not trusted from when the session opened: `enableEditing` can
    // switch off, `meta.edit` can be removed, and `edit.enabled(row)` can turn false meanwhile.
    // Committing then would push a value through a gate the application has just shut — and
    // unvalidated, since a closed gate is exactly what `validate` no longer guards. The session
    // is cancelled, which is not the same as finished: nothing waiting to move may do so on it.
    if (!committed.canEdit(rowId, columnId)) {
      markGateLost();

      if (!closeLostSession()) {
        requestClose();
      }

      return false;
    }

    const source = committed.value(rowId, columnId);
    const previousValue = settledValue(source);
    const value = store.draft ? store.draft.value : previousValue;

    if (Object.is(value, previousValue)) {
      store.settled = true;
      requestClose();

      return true;
    }

    const normalized = normalizeEdit(committed.edit(columnId));

    try {
      if (normalized?.validate) {
        const validationError = normalized.validate(value, row);

        if (validationError !== null) {
          setError(validationError);

          return false;
        }
      }
    } catch (error) {
      setError(editErrorMessage(error));

      return false;
    }

    let result: void | Promise<void>;

    try {
      result = onEditCommit?.({
        column: committed.column(columnId),
        previousValue,
        row,
        value
      } as DataTableEditCommit<TData>);
    } catch (error) {
      setError(editErrorMessage(error));

      return false;
    }

    if (!isPromiseLike(result)) {
      store.written = { source, value };
      store.draft = null;
      store.settled = true;
      requestClose();

      return true;
    }

    const session = sessionToken;
    store.writing = { moved: false, source };
    setPending(true);

    // The in-flight slot is released inside the handlers rather than in a `finally`: the
    // not-carried branch below commits again, and a settled request must not still be standing
    // there for its own successor to join.
    const promise: Promise<boolean> = Promise.resolve(result).then(
      () => {
        if (session !== sessionToken) {
          return false;
        }

        pendingCommit = null;
        // A custom editor is not disabled while the request is out, so the user can type straight
        // past it. What this write carried is what the next edit departs from; a value typed since
        // is one it never carried.
        const carried = !store.draft || Object.is(store.draft.value, value);
        // Unless the data moved while the request was out — then what the application holds is
        // its own, and this write has nothing left to be true about.
        store.written = store.writing?.moved === true ? null : { source, value };
        store.writing = null;
        store.settled = carried;

        if (carried) {
          store.draft = null;
        }

        setPending(false);

        // The gate may have shut while this write was out — and a gate that reopened before it
        // landed does not undo that. The write stands, but the session it belonged to is over, so
        // nothing waiting to move may do so on the strength of it.
        if (store.gateLost || !stillEditable(rowId, columnId)) {
          markGateLost();
          closeLostSession();

          return false;
        }

        if (!carried) {
          // Still on screen: the cell does not close, and whoever was waiting to leave it is told
          // it is not safe to. Gone from the screen: nobody can commit it by hand any more, and an
          // unmount commits rather than discards (docs/editing.md), so this write — which did
          // succeed — is followed by the one it outran. That successor carries the latest value,
          // so it settles `carried` and recurses no further.
          return mountedFor({ columnId, rowId }) > 0 ? false : commit();
        }

        requestClose();

        return true;
      },
      (error: unknown) => {
        if (session !== sessionToken) {
          return false;
        }

        pendingCommit = null;
        store.writing = null;
        setPending(false);
        setError(editErrorMessage(error));

        // A gate that shut while the request was out is answered now that it has landed.
        if (store.gateLost || !stillEditable(rowId, columnId)) {
          markGateLost();
          closeLostSession();
        }

        return false;
      }
    );

    pendingCommit = { promise, session };

    return promise;
  };

  /**
   * Losing eligibility mid-session cancels it, and the loss latches: reopening the gate is the
   * next session's eligibility. Automatic reconciliation is idempotent per session — an explicit
   * Escape or `stopEditing` is always a fresh request, because an application that ignored the
   * last one has to be asked again. It also retires the write record once the data moves past it,
   * permanently, so data returning to what the write departed from cannot resurrect it.
   *
   * Vue edition: React ran this after every render. Here it runs when the slice moves and when an
   * editor registers — the moments a render is known to have happened. Every commit re-reads the
   * gate itself, so a data change with no session traffic is answered at the next event either
   * way.
   */
  const reconcileEligibility = () => {
    const { rowId, columnId } = store;

    if (rowId === null || columnId === null) {
      return;
    }

    // The table-level gate is answered first, and without a row: a session whose row has not
    // arrived still loses its gate when editing is switched off or the mode's commit handler is
    // taken away, and must not be found waiting when either comes back.
    if (committed.tableGate()) {
      if (committed.row(rowId) === null) {
        // The row is not in the table: a target that has not arrived, or one the data no longer
        // holds. Neither is an application closing a gate, so the session waits for it.
        return;
      }

      const source = committed.value(rowId, columnId);
      const record = store.written;

      if (record && !Object.is(record.source, source)) {
        store.written = null;
        redraw();
      }

      // The same watch, for the write still out: it has no record to retire yet, so the movement
      // has to be remembered until it does.
      if (store.writing && !Object.is(store.writing.source, source)) {
        store.writing.moved = true;
      }

      if (committed.canEdit(rowId, columnId)) {
        return;
      }
    }

    markGateLost();

    // The in-flight write passed the gate before it shut; its settlement completes the cancel.
    if (pendingWrite) {
      return;
    }

    closeLostSession();
  };

  // Both commit-phase effects of the React edition run as one post-flush watch on the slice here:
  // the session boundary first (React's layout effect), the gate reconciliation second (React's
  // passive effect) — the order the renders ran them in. The first pass is deferred to a
  // microtask: `committed` is captured by `useDataTable` once the table exists, and a session a
  // controlled application names up front must be reconciled against that capture, not against
  // the empty snapshot setup starts with.
  watch(editingCell, next => reconcileSlice(next), { flush: "post" });
  queueMicrotask(() => reconcileSlice(editingCell.value));

  const clear = () => {
    if (rendered !== null) {
      requestClose();
    }
  };

  const stop = (options?: { commit?: boolean }) => {
    // An explicit stop overrules a move still waiting on a commit.
    requestToken += 1;

    if (options?.commit ?? true) {
      void Promise.resolve(commit()).catch(() => false);
    } else {
      cancel();
    }
  };

  const start = (target: DataTableEditingCell) => {
    const request = ++requestToken;
    const onScreen = rendered;

    if (!onScreen || (onScreen.rowId === target.rowId && onScreen.columnId === target.columnId)) {
      if (isSession(target.rowId, target.columnId) && store.gateLost) {
        // The session on this cell is over — its gate shut, and a controlled application declined
        // to close it. An explicit start is not that session coming back: it is the next one, so
        // it gets a new token and nothing the old one held. The slice already names this cell, so
        // no draw would arrive to do it for us.
        beginSession(target);
        epoch.value += 1;
      }

      setEditingCell(target);

      return;
    }

    // Not named `committed`: that is the snapshot reader this whole module decides with, and a
    // local shadowing it inside the one function that also commits is a trap for the next reader.
    const outcome = commit();

    if (typeof outcome === "boolean") {
      if (outcome && requestToken === request) {
        setEditingCell(target);
      }

      return;
    }

    void Promise.resolve(outcome).then(
      success => {
        if (success && requestToken === request) {
          setEditingCell(target);
        }
      },
      // Custom editors may still reject despite the boolean-result contract; stay put.
      () => false
    );
  };

  /**
   * An editor registers while it is on screen. Its departure arms the unmount commit, deferred one
   * tick so a remount of the same cell — the virtualizer re-mounting a row still in view — cancels
   * it; only a real departure commits, and once nothing is mounted any failure degrades to discard
   * because there is nowhere left to report it.
   *
   * Everything here is decided per target: an editor for one cell must not cancel another cell's
   * departure, and the write that departure sends must not clear a cell that has since come back
   * on screen with something new in it.
   */
  const register = (rowId: string, columnId: string, editor: LedgerCellEditor) => {
    const target = { columnId, rowId };
    const armed = unmountCommit;

    if (armed && armed.session === sessionToken && armed.target.rowId === rowId && armed.target.columnId === columnId) {
      disarmUnmountCommit();
    }

    editors.set(editor, target);

    // The React edition reconciled after every render; an editor mounting is the moment one is
    // known to have happened here.
    reconcileEligibility();

    return () => {
      editors.delete(editor);

      if (mountedFor(target) > 0) {
        return;
      }

      // An editor the gate took off the screen did not depart — the session it belonged to ended,
      // and it has nothing left to commit on the way out.
      if (store.gateLost) {
        return;
      }

      const onScreen = rendered;

      if (onScreen?.rowId !== rowId || onScreen.columnId !== columnId) {
        return;
      }

      // The record identifies itself, so a tick that fires late can only retire its own: two
      // departures in one tick would otherwise have the first one clear the second's record and
      // leave a live timer nothing can cancel.
      const record: { session: number; target: DataTableEditingCell; timer: ReturnType<typeof setTimeout> | null } = {
        session: sessionToken,
        target,
        timer: null
      };
      const { session } = record;

      record.timer = setTimeout(() => {
        if (unmountCommit === record) {
          unmountCommit = null;
        }

        // The tick waited, and the session may have moved on: a switch commits the cell being
        // left and opens the next one in the same draw, so this departure can find a different
        // cell in its place. Read the owner *before* reaching for a commit, which always speaks
        // for whatever session is current — otherwise this closes the cell that replaced it.
        if (session !== sessionToken || store.rowId !== rowId || store.columnId !== columnId) {
          return;
        }

        // A session the gate cancelled has nothing left to commit on the way out, and its close
        // has been asked for: this editor did not depart, it was taken off the screen. The
        // cleanup that armed this tick tests the same thing, but it runs before the
        // reconciliation that latches the loss.
        if (store.gateLost) {
          return;
        }

        const settle = () => {
          // Only if this is still the session that departed, and nothing has taken the cell back
          // on screen meanwhile — a remounted editor may be holding a value this write never saw,
          // and a failure it can show.
          if (session !== sessionToken || mountedFor(target) > 0) {
            return;
          }

          // Nothing is mounted, so a failure — a `validate` rejection, a throw, a rejected
          // promise — has nowhere left to report itself and degrades to discard
          // (docs/editing.md). Discarded rather than merely closed: an application that declines
          // the close would otherwise see the draft and the message come back with the column.
          store.draft = null;
          store.error = null;
          store.settled = true;
          clear();
        };

        const result = commit();

        if (isPromiseLike(result)) {
          void Promise.resolve(result).then(settle, settle);
        } else {
          settle();
        }
      }, 0);

      unmountCommit = record;
    };
  };

  // Stable identities all the way out: this surface goes into `meta.ledger`, and the render layer
  // reads it inside its reactive scopes — the closures here are stable for the composable's life,
  // and each of them reads nothing but session state.
  // `source` comes from the caller — the cell of the render doing the drawing, which is the right
  // one for a render and cannot be a discarded pass's: an editor redraws only after it has
  // rendered, and that render is what resolved the value it is holding.
  const read = (rowId: string, columnId: string, source: unknown) => {
    if (!isSession(rowId, columnId)) {
      return source;
    }

    return store.draft ? store.draft.value : settledValue(source);
  };

  const write = (rowId: string, columnId: string, value: unknown) => {
    if (!isSession(rowId, columnId)) {
      return;
    }

    store.draft = { value };
    store.error = null;
    // A new value is a new edit: the session is only still open past a settled commit because the
    // application declined to close it, and what it holds now no write has carried.
    store.settled = false;
    redraw();
  };

  const pending = (rowId: string, columnId: string) => isSession(rowId, columnId) && pendingWrite;

  const active = (rowId: string, columnId: string): boolean => {
    // Asked during render, so a cell the store has not been keyed to yet is a session about to
    // open, which is live by definition; only the one being tracked can have lost its gate. The
    // epoch read is the point: the answer lives in session state, so this reactive read is what
    // carries a session starting or ending into the render layer's reactive graph.
    const generation = epoch.value;

    return generation >= 0 && (isSession(rowId, columnId) ? !store.gateLost : true);
  };

  const error = (rowId: string, columnId: string) => (isSession(rowId, columnId) ? store.error : null);

  /**
   * The row's next editable cell in display order, skipping instant columns — a change there is
   * the commit and hosts no editor for a caret to land in (docs/editing.md). Resolved from the
   * render that reached the screen: the order, the gate and each column's editing kind all come
   * from there, so a render nobody saw cannot decide where the caret goes, or that there is
   * nowhere to go.
   */
  const adjacentEditable = (rowId: string, columnId: string | null, backwards: boolean): string | null => {
    const order = committed.visibleColumnIds();
    const step = backwards ? -1 : 1;
    const from = columnId === null ? backwards ? order.length : -1 : order.indexOf(columnId);

    for (let index = from + step; index >= 0 && index < order.length; index += step) {
      const candidate = order[index];

      if (candidate !== undefined && committed.canEdit(rowId, candidate) && !committed.isInstant(candidate)) {
        return candidate;
      }
    }

    return null;
  };

  /**
   * Tab / Shift+Tab: commit, and only then move (docs/editing.md keyboard map). The neighbour is
   * resolved *after* the commit succeeds, never before it is sent — an async write leaves the
   * keyboard free, and a real draw landing while it is out can hide the column the caret was
   * headed for, shut its gate, or move it somewhere else entirely.
   */
  const moveTo = (backwards: boolean) => {
    const { rowId } = store;
    const from = store.columnId;

    if (rowId === null || from === null) {
      return;
    }

    const settle = (succeeded: boolean) => {
      if (!succeeded) {
        return;
      }

      const target = adjacentEditable(rowId, from, backwards);

      if (target === null) {
        return;
      }

      start({ columnId: target, rowId });
    };

    const result = commit();

    if (isPromiseLike(result)) {
      // Custom editors may still reject despite the boolean-result contract; stay put.
      void Promise.resolve(result).then(settle, () => undefined);
    } else {
      settle(result);
    }
  };

  /**
   * The row's first editable cell — where F2 enters (docs/editing.md#keyboard-and-lifecycle).
   * `skipInstant` is the mode: cell mode has no editor to open on an instant column, row mode
   * does.
   */
  const firstEditable = (rowId: string, skipInstant: boolean): string | null => {
    // On screen first: `canEdit` will answer for a row that is filtered out or on another page —
    // a session may legitimately name one — but F2 acts on the row the user is looking at, and
    // opening an editor nobody can see is not that.
    if (!committed.onScreen(rowId)) {
      return null;
    }

    const order = committed.visibleColumnIds();

    return order.find(columnId => committed.canEdit(rowId, columnId) && (!skipInstant || !committed.isInstant(columnId))) ?? null;
  };

  return {
    active,
    cancel,
    clear,
    commit,
    error,
    firstEditable,
    moveTo,
    pending,
    read,
    register,
    start,
    stop,
    write
  };
}
