import type { Sensors, PointerSensorOptions  } from "@dnd-kit/dom";
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from "@dnd-kit/dom";
import type { RowData } from "@tanstack/vue-table";
import type { Ref } from "vue";
import type { DataTableRowReorder, Row } from "./types";

/**
 * Row drag reordering (docs/rows.md#row-ordering). Row order IS data order — there is no order
 * state — so ledger owns the interaction (the handle column, the session, the drop indicator,
 * the announcements) and hands the completed move to `onRowReorder`; the application reorders
 * `data`.
 *
 * Two input channels feed one session:
 *
 * - Pointer drags ride dnd-kit — the columns panel's dependency — for what is expensive to
 * hand-roll: activation constraints, edge auto-scrolling, cursor and selection suppression.
 * The drop target is ledger's own math over the rendered rows, not droppables: per-row
 * droppables would re-register on every virtualizer round-trip, and the sortable plugin's
 * optimistic DOM moves would break the one-`<tr>`-per-virtual-item invariant. The Feedback
 * and Accessibility plugins stay out for the same reason — the row ghost and the live
 * region are ledger's, fed from `labels`.
 * - The keyboard steps the insertion index directly (Space lifts, ↑/↓ move, Home/End jump,
 * Space drops, Escape cancels; blur abandons) — exact positions, not synthetic pixels.
 *
 * Session state lives up in `<DataTable>`, so the affected rows re-render through their own
 * reactive props; the row ghost and the live region are written imperatively — a pointer
 * move never re-renders the table.
 *
 * Vue edition: `@dnd-kit/dom` is the framework-agnostic core of the React edition's
 * `@dnd-kit/react` — the provider becomes a `DragDropManager` instance the session owns (its
 * monitor carries the three handlers React spread as `providerProps`), and the handles'
 * `useDraggable` becomes a `Draggable` instance bound to the handle button (`row-reorder-cell.ts`)
 * through the session's `manager`. `RowReorderScope` is a tiny component that provides the
 * session (`provideRowReorderSession` / `useRowReorderSession`) and mounts the overlay.
 */
import { AutoScroller, Cursor, DragDropManager, PointerActivationConstraints, PointerSensor, PreventSelection } from "@dnd-kit/dom";
import { defineComponent, h, inject, onScopeDispose, provide, ref, Teleport } from "vue";
import type { InjectionKey, PropType } from "vue";


/**
 * The 5px house threshold (use-column-reorder.ts) keeps a plain click from lifting the row —
 * a lift is announced, and a click should say nothing. Touch keeps the press-and-hold delay
 * that separates dragging from scrolling.
 */
const activationConstraints: PointerSensorOptions["activationConstraints"] = event => event.pointerType === "touch"
  ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
  : [new PointerActivationConstraints.Distance({ value: 5 })];

export const ROW_REORDER_SENSORS: Sensors = [PointerSensor.configure({ activationConstraints })];
export const ROW_REORDER_PLUGINS = [AutoScroller, Cursor, PreventSelection];

export interface RowReorderTarget {
  rowId: string;
  side: "before" | "after";
}

/**
 * The keyboard half of the session, handed to the handle cells through the render context. The
 * handlers are stable event callbacks; `active` reads the live session, so a handle can answer
 * "do the keys belong to me" in the render that draws it. `onKeyDown` is the merged
 * single-handler form the DataTable context carries (context.ts): it dispatches the LIVE
 * keyboard session's keys and no-ops while idle, so the context contract stays one method.
 */
export interface RowReorderKeyboard {
  onKeyDown: (event: KeyboardEvent) => void;
  lift: (rowId: string) => void;
  move: (delta: 1 | -1) => void;
  moveToEdge: (edge: "start" | "end") => void;
  drop: () => void;
  cancel: () => void;
  active: (rowId: string) => boolean;
}

export interface RowReorderSession<TData extends RowData> {
  /**
   * Phantom anchor for the session's data generic — the session itself is row-agnostic (ids in,
   * ids out), but the composable that owns it is `Row<TData>`-typed and naming that here keeps
   * the parameter honest without widening the shape.
   */
  _rows?: Array<Row<TData>>;
  /**
   * The row a live drag lifted, either channel. Rows render `data-dragging` from it.
   */
  sourceId: Ref<string | null>;
  /**
   * Where the lifted row would land — `null` while the drop would change nothing. The target
   * row renders the indicator (`data-drop-side`).
   */
  target: Ref<RowReorderTarget | null>;
  keyboard: RowReorderKeyboard;
  /**
   * True once a pointer drag has actually moved — the overlay mounts the ghost from it, and
   * its late start is also what keeps a bare click silent.
   */
  ghostActive: Ref<boolean>;
  attachGhost: (element: HTMLDivElement | null) => void;
  announcerRef: Ref<HTMLSpanElement | null>;
  /**
   * The pointer channel's dnd-kit manager — the React edition's `DragDropProvider`, which the
   * handle cells register their `Draggable`s against (the providerProps spread has no Vue
   * counterpart; the monitor subscriptions live in `useRowReorder`).
   */
  manager: DragDropManager;
}

export interface RowReorderInput<TData extends RowData> {
  onRowReorder: ((reorder: DataTableRowReorder<TData>) => void) | undefined;
  labels: {
    rowReorderLifted: (row: string) => string;
    rowReorderTarget: (row: string, side: "before" | "after") => string;
    rowReorderDropped: (row: string) => string;
    rowReorderCanceled: string;
  };
  /**
   * The body scroll viewport — the element whose rendered `<tr>`s the pointer math reads.
   */
  viewportRef: Ref<HTMLElement | null>;
  /**
   * The center rows of the committed display, in display order (pinned rows are not part of a
   * data-order move). Read once per lift into the session snapshot.
   */
  getCenterRows: () => Array<Row<TData>>;
  /**
   * Names a row the way the active-row announcements do — its leading visible cell.
   */
  nameRow: (row: Row<TData>) => string;
  /**
   * Keeps the keyboard target on screen, virtualized included.
   */
  scrollToRow: (rowId: string) => void;
}

interface DragSnapshot<TData extends RowData> {
  via: "pointer" | "keyboard";
  sourceId: string;
  sourceName: string;
  fromIndex: number;
  /**
   * Keyboard stepping position in `toIndex` space; `fromIndex` means "at rest".
   */
  toIndex: number;
  rows: Array<Row<TData>>;
  rowsById: Map<string, Row<TData>>;
}

export function useRowReorder<TData extends RowData>({
  onRowReorder,
  labels,
  viewportRef,
  getCenterRows,
  nameRow,
  scrollToRow
}: RowReorderInput<TData>): RowReorderSession<TData> {
  const sourceId = ref<string | null>(null);
  const target = ref<RowReorderTarget | null>(null);
  const ghostActive = ref(false);
  const via = ref<"pointer" | "keyboard" | null>(null);

  let snapshot: DragSnapshot<TData> | null = null;
  let targetValue: RowReorderTarget | null = null;
  let ghost: HTMLDivElement | null = null;
  const ghostPosition = { x: 0, y: 0 };
  const ghostOrigin = { x: 0, y: 0 };
  const announcerRef = ref<HTMLSpanElement | null>(null);

  const announce = (message: string) => {
    if (announcerRef.value) {
      announcerRef.value.textContent = message;
    }
  };

  /**
   * `arrayMove` semantics: the final index of the moved row once the drop lands `side` of the
   * target. `null` when the move would change nothing.
   */
  const resolveToIndex = (targetRow: Row<TData>, side: "before" | "after"): number | null => {
    if (!snapshot) {
      return null;
    }

    const raw = targetRow.index + (side === "after" ? 1 : 0);
    const toIndex = raw > snapshot.fromIndex ? raw - 1 : raw;

    return toIndex === snapshot.fromIndex ? null : toIndex;
  };

  const setTarget = (next: RowReorderTarget | null) => {
    if (targetValue?.rowId === next?.rowId && targetValue?.side === next?.side) {
      return;
    }

    targetValue = next;
    target.value = next;

    if (next) {
      const row = snapshot?.rowsById.get(next.rowId);

      if (row) {
        announce(labels.rowReorderTarget(nameRow(row), next.side));
      }
    }
  };

  const begin = (channel: "pointer" | "keyboard", rowId: string): DragSnapshot<TData> | null => {
    const rows = getCenterRows();
    const row = rows.find(candidate => candidate.id === rowId);

    if (!row) {
      return null;
    }

    const session: DragSnapshot<TData> = {
      via: channel,
      sourceId: rowId,
      sourceName: nameRow(row),
      fromIndex: row.index,
      toIndex: row.index,
      rows,
      rowsById: new Map(rows.map(candidate => [candidate.id, candidate]))
    };
    snapshot = session;
    via.value = channel;
    sourceId.value = rowId;

    return session;
  };

  const finish = (canceled: boolean) => {
    const finished = snapshot;
    const finalTarget = targetValue;

    if (finished && !canceled) {
      if (finalTarget) {
        const row = finished.rowsById.get(finished.sourceId);
        const targetRow = finished.rowsById.get(finalTarget.rowId);
        const toIndex = targetRow ? resolveToIndex(targetRow, finalTarget.side) : null;

        if (row && toIndex !== null) {
          onRowReorder?.({
            row,
            fromIndex: finished.fromIndex,
            toIndex
          });
        }
      }

      announce(labels.rowReorderDropped(finished.sourceName));
    } else if (finished) {
      announce(labels.rowReorderCanceled);
    }

    snapshot = null;
    targetValue = null;
    via.value = null;
    sourceId.value = null;
    target.value = null;
    ghostActive.value = false;
  };

  /* ---- pointer channel (dnd-kit) ---- */

  const onDragStart = (event: DragStartEvent) => {
    const id = event.operation.source?.id;

    if (typeof id !== "string" || snapshot) {
      return;
    }

    begin("pointer", id);
  };

  /**
   * The rendered center rows, read where they are drawn: virtualization renders a window, and
   * the rows that exist are exactly the ones a pointer can be over. Pinned rows are sticky
   * overlays of the same scroller, so a pointer inside their bands must not read as "over the
   * row beneath" — they bound the scan instead of joining it.
   */
  const pointerTarget = (y: number): RowReorderTarget | null => {
    const viewport = viewportRef.value;

    if (!viewport || !snapshot) {
      return null;
    }

    const rows = viewport.querySelectorAll<HTMLTableRowElement>("tr[data-row-id]:not([data-pinned-row])");
    const nearest = pointerDropEdge(rows, element => element.getBoundingClientRect(), y);

    if (!nearest) {
      return null;
    }

    const { rowId } = nearest.row.dataset;
    const row = rowId === undefined ? undefined : snapshot.rowsById.get(rowId);

    if (rowId === undefined || !row || resolveToIndex(row, nearest.side) === null) {
      return null;
    }

    return { rowId, side: nearest.side };
  };

  const onDragMove = (event: DragMoveEvent) => {
    if (snapshot?.via !== "pointer") {
      return;
    }

    const position = event.operation.position.current;
    ghostPosition.x = position.x;
    ghostPosition.y = position.y;

    if (ghost) {
      ghost.style.transform = ghostTransform(position, ghostOrigin);
    }

    // The lift is announced here, on the first real move, so a plain click stays silent.
    if (!ghostActive.value) {
      ghostActive.value = true;
      announce(labels.rowReorderLifted(snapshot.sourceName));
    }

    setTarget(pointerTarget(position.y));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (snapshot?.via !== "pointer") {
      return;
    }

    finish(event.canceled);
  };

  /* ---- keyboard channel (index stepping) ---- */

  const step = (session: DragSnapshot<TData>, candidate: number) => {
    const last = session.rows.length - 1;
    const toIndex = Math.max(0, Math.min(last, candidate));

    if (toIndex === session.fromIndex || toIndex === session.toIndex) {
      return;
    }

    // Map the landing index back to the row that shows the indicator: landing below the source
    // means "after that row" (every row in between has shifted one up), above means "before".
    const row = session.rows[toIndex];

    if (!row) {
      return;
    }

    session.toIndex = toIndex;
    setTarget({ rowId: row.id, side: toIndex > session.fromIndex ? "after" : "before" });
    scrollToRow(row.id);
  };

  const lift = (rowId: string) => {
    if (snapshot) {
      return;
    }

    const session = begin("keyboard", rowId);

    if (session) {
      announce(labels.rowReorderLifted(session.sourceName));
    }
  };

  const move = (delta: 1 | -1) => {
    if (snapshot?.via !== "keyboard") {
      return;
    }

    // Skip over the at-rest position — stepping back onto it would show nothing; Escape is how
    // a lift returns home.
    let candidate = snapshot.toIndex + delta;

    if (candidate === snapshot.fromIndex) {
      candidate += delta;
    }

    step(snapshot, candidate);
  };

  const moveToEdge = (edge: "start" | "end") => {
    if (snapshot?.via !== "keyboard") {
      return;
    }

    step(snapshot, edge === "start" ? 0 : snapshot.rows.length - 1);
  };

  const drop = () => {
    if (snapshot?.via === "keyboard") {
      finish(false);
    }
  };

  const cancel = () => {
    if (snapshot?.via === "keyboard") {
      finish(true);
    }
  };

  const active = (rowId: string) => via.value === "keyboard" && sourceId.value === rowId;

  /**
   * The merged single-handler form (context.ts): dispatches the live keyboard session's keys —
   * Space/Enter drop, ↑/↓ move, Home/End jump, Escape cancels — and no-ops while no keyboard
   * lift is live, leaving idle keys to the page.
   */
  const onKeyDown = (event: KeyboardEvent) => {
    if (via.value !== "keyboard") {
      return;
    }

    switch (event.key) {
      case " ":
      case "Enter": {
        event.preventDefault();
        event.stopPropagation();
        drop();

        break;
      }

      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        move(-1);

        break;
      }

      case "ArrowDown": {
        event.preventDefault();
        event.stopPropagation();
        move(1);

        break;
      }

      case "Home": {
        event.preventDefault();
        event.stopPropagation();
        moveToEdge("start");

        break;
      }

      case "End": {
        event.preventDefault();
        event.stopPropagation();
        moveToEdge("end");

        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();
        cancel();

        break;
      }

      // No default
    }
  };

  const attachGhost = (element: HTMLDivElement | null) => {
    ghost = element;

    if (!element) {
      return;
    }

    // Built once per lift: the ghost is a DOM snapshot of the whole source row — the source
    // table's shell around the cloned `<tr>`, under per-column pixel widths read from the live
    // cells (the width variables live on the ledger root and cannot reach the portal) — so a
    // pointer move stays a pure transform write and no live cell ever renders twice.
    const source = snapshot
      ? viewportRef.value?.querySelector<HTMLTableRowElement>(
          `tr[data-row-id="${CSS.escape(snapshot.sourceId)}"]`
        )
      : null;
    const sourceTable = source?.closest("table");

    if (source && sourceTable) {
      const ghostTable = sourceTable.cloneNode(false) as HTMLTableElement;
      ghostTable.style.width = `${sourceTable.getBoundingClientRect().width}px`;

      const colgroup = document.createElement("colgroup");

      for (const cell of source.cells) {
        const col = document.createElement("col");
        col.style.width = `${cell.getBoundingClientRect().width}px`;
        colgroup.append(col);
      }

      const body = document.createElement("tbody");
      const rowClone = source.cloneNode(true) as HTMLTableRowElement;
      delete rowClone.dataset.dragging;
      body.append(rowClone);
      ghostTable.append(colgroup, body);
      element.replaceChildren(ghostTable);

      // Anchored to where the row was lifted from, so the ghost reads as the row itself
      // coming off the table under the pointer's grab point.
      const rowRect = source.getBoundingClientRect();
      ghostOrigin.x = rowRect.left - ghostPosition.x;
      ghostOrigin.y = rowRect.top - ghostPosition.y;
    }

    // Positioned before its first paint — a ghost that mounts at the portal origin and then
    // jumps to the pointer is exactly the drift the imperative transform exists to avoid.
    element.style.transform = ghostTransform(ghostPosition, ghostOrigin);
  };

  // Stable — every handler is a setup-scope closure — so the render context carrying it holds.
  const keyboard: RowReorderKeyboard = {
    active,
    cancel,
    drop,
    lift,
    move,
    moveToEdge,
    onKeyDown
  };

  /* ---- the pointer channel's manager (the React edition's DragDropProvider) ---- */

  const manager = new DragDropManager({ plugins: ROW_REORDER_PLUGINS, sensors: ROW_REORDER_SENSORS });

  const unsubscribe = [
    manager.monitor.addEventListener("dragstart", onDragStart),
    manager.monitor.addEventListener("dragmove", onDragMove),
    manager.monitor.addEventListener("dragend", onDragEnd)
  ];

  onScopeDispose(() => {
    for (const off of unsubscribe) {
      off();
    }

    manager.destroy();
  });

  return {
    sourceId,
    target,
    keyboard,
    ghostActive,
    attachGhost,
    announcerRef,
    manager
  };
}

/**
 * The drop edge a pointer at `y` indicates, scanned top to bottom over the rendered rows: above
 * every row reads "before" the first, inside a row splits at its midline, the gap between two
 * rows belongs to the row above, and below every row reads "after" the last. Zero-height rows
 * never claim the pointer. Pure over `measure` — the session feeds it live rects, and reads
 * lazily so the scan still stops at the row under the pointer.
 */
export function pointerDropEdge<T>(
  rows: Iterable<T>,
  measure: (row: T) => { top: number; bottom: number },
  y: number
): { row: T; side: "before" | "after" } | null {
  let nearest: { row: T; side: "before" | "after" } | null = null;

  for (const row of rows) {
    const { top, bottom } = measure(row);

    if (bottom <= top) {
      continue;
    }

    if (y < top) {
      nearest ??= { row, side: "before" };

      break;
    }

    nearest = { row, side: y < (top + bottom) / 2 ? "before" : "after" };

    if (y <= bottom) {
      break;
    }
  }

  return nearest;
}

function ghostTransform(
  { x, y }: { x: number; y: number },
  origin: { x: number; y: number }
): string {
  return `translate(${Math.round(x + origin.x)}px, ${Math.round(y + origin.y)}px)`;
}

/* -------------------------------------------------------------------------------------------------
 * The scope — the React edition's context provider, collapsed to a provide + an overlay
 * ------------------------------------------------------------------------------------------------- */

const RowReorderSessionKey: InjectionKey<RowReorderSession<any>> = Symbol("RowReorderSession");

/**
 * Provides the reorder session to the handle cells. Nullable — rows render fine without a
 * session (the gate is off), they just carry no wired handle.
 */
export function provideRowReorderSession(session: RowReorderSession<any> | null): void {
  if (session) {
    provide(RowReorderSessionKey, session);
  }
}

export function useRowReorderSession<TData extends RowData>(): RowReorderSession<TData> | null {
  return inject(RowReorderSessionKey, null) as RowReorderSession<TData> | null;
}

/**
 * The pointer channel around the table when the gate is on: the session provided for the
 * handles' draggables, and the overlay. Renders no DOM of its own beyond the portaled overlay,
 * so the table markup is byte-identical either way.
 */
export const RowReorderScope = defineComponent({
  name: "RowReorderScope",
  props: {
    session: { type: Object as PropType<RowReorderSession<any> | null>, default: null }
  },
  setup(props, { slots }) {
    provideRowReorderSession(props.session);

    return () => {
      const session = props.session;
      const children = slots.default?.();

      if (!session) {
        return children;
      }

      return [children, h(RowReorderOverlay, { session })];
    };
  }
});

/**
 * The pointer ghost and the live region, portaled out of the ARIA table (a `role="table"` may
 * only own rows; a fixed-position ghost inside the scroller would clip and shear under sticky
 * transforms). The ghost's content is the row snapshot `attachGhost` clones in, and it is
 * `aria-hidden`: the live region already narrates the drag.
 */
const RowReorderOverlay = defineComponent({
  name: "RowReorderOverlay",
  props: {
    session: { type: Object as PropType<RowReorderSession<any>>, required: true }
  },
  setup(props) {
    return () => h(Teleport, { to: "body" }, [
      h("span", {
        class: "ledger-visually-hidden",
        "aria-live": "polite",
        role: "status",
        ref: element => {
          props.session.announcerRef.value = element as HTMLSpanElement | null;
        }
      }),
      props.session.ghostActive.value
        ? h("div", {
            "aria-hidden": "true",
            class: "ledger-row-drag-overlay",
            ref: element => {
              props.session.attachGhost(element as HTMLDivElement | null);
            }
          })
        : null
    ]);
  }
});
