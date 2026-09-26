import type { RowData } from "@tanstack/vue-table";
import type { ColumnDropTarget } from "./column-order";
import type { TableInstance } from "./types";

/**
 * Pointer-based header drag reordering — no drag-and-drop dependency. A press becomes a drag
 * after a 5px threshold, so the sortable header label keeps its click; a completed drag
 * suppresses the click that follows pointerup. Escape and pointercancel abandon the drag, and
 * a mid-drag unmount releases the window listeners. Reordering is limited to single-row
 * headers: with column groups, sibling order inside a group is ambiguous.
 *
 * Vue edition: the drag state is a reactive object — the header cells read `drag.draggedId` /
 * `drag.targetId` / `drag.side` inside their render effects and track. The `onPointerDown`
 * prop becomes Vue's `onPointerdown` casing.
 */
import { computed, onScopeDispose, reactive } from "vue";

import { isInternalColumn } from "./build-columns";
import { getColumnZone, reorderColumnWithinZone } from "./column-order";
import { warnOnce } from "./env";

const DRAG_THRESHOLD_PX = 5;

export interface ColumnDragState {
  draggedId: string | null;
  targetId: string | null;
  side: "before" | "after" | null;
}

export interface ColumnReorder {
  /**
   * The live drag, reactive — the header cells derive `data-dragging` / `data-drop-side` from it.
   */
  drag: ColumnDragState;
  getHeaderProps: (columnId: string) => { onPointerdown?: (event: PointerEvent) => void };
  /**
   * True exactly once after a completed drag — the header label uses it to swallow the click.
   */
  consumeClickSuppression: () => boolean;
}

const IDLE: ColumnDragState = {
  draggedId: null,
  targetId: null,
  side: null
};

interface DragSession {
  columnId: string;
  startX: number;
  started: boolean;
  target: ColumnDropTarget | null;
  cleanup: () => void;
}

export function useColumnReorder<TData extends RowData>(table: TableInstance<TData>): ColumnReorder {
  const drag = reactive<ColumnDragState>({ ...IDLE });
  let session: DragSession | null = null;
  let suppressClick = false;

  // The listeners live on window, so a mid-drag unmount must release them here.
  onScopeDispose(() => {
    session?.cleanup();
    session = null;
  });

  const enabledOption = table.options.meta?.ledger?.enableColumnOrdering === true;
  const hasGroupedHeaders = table.getHeaderGroups().length > 1;

  if (enabledOption && hasGroupedHeaders) {
    warnOnce(
      "reorder-grouped-headers",
      "enableColumnOrdering is ignored for tables with header groups — sibling order inside a group is ambiguous."
    );
  }

  // The live gate: header groups arriving after the mount still disable reordering.
  const enabled = computed(() =>
    table.options.meta?.ledger?.enableColumnOrdering === true
    && table.getHeaderGroups().length <= 1
  );

  const commitReorder = (draggedId: string, target: ColumnDropTarget) => {
    reorderColumnWithinZone(table, draggedId, target);
  };

  const getHeaderProps: ColumnReorder["getHeaderProps"] = columnId => {
    if (!enabled.value || isInternalColumn(columnId)) {
      return {};
    }

    return {
      onPointerdown: event => {
        if (
          event.button !== 0
          || session
          || (event.target as HTMLElement).closest("[data-ledger-no-drag]")
        ) {
          return;
        }

        const onPointerMove = (move: globalThis.PointerEvent) => {
          if (!session) {
            return;
          }

          if (!session.started) {
            if (Math.abs(move.clientX - session.startX) < DRAG_THRESHOLD_PX) {
              return;
            }

            session.started = true;
          }

          const headerCell = document
            .elementFromPoint(move.clientX, move.clientY)
            ?.closest<HTMLElement>("[data-ledger-column-id]");
          const targetId = headerCell?.dataset.ledgerColumnId;

          let target: DragSession["target"] = null;

          if (
            headerCell
            && targetId
            && targetId !== session.columnId
            && !isInternalColumn(targetId)
            && getColumnZone(table, targetId) === getColumnZone(table, session.columnId)
          ) {
            const rect = headerCell.getBoundingClientRect();
            // `before`/`after` are logical, like the drop indicator that renders them: in RTL a
            // cell's leading half is its RIGHT half, so the physical test has to be mirrored
            // (the same reasoning the resize drag applies to its delta).
            const rtl = getComputedStyle(headerCell).direction === "rtl";
            const inLeftHalf = move.clientX < rect.left + rect.width / 2;

            target = { id: targetId, side: inLeftHalf === rtl ? "after" : "before" };
          }

          session.target = target;
          Object.assign(drag, {
            draggedId: session.columnId,
            targetId: target?.id ?? null,
            side: target?.side ?? null
          });
        };

        const endSession = (commit: boolean) => {
          if (!session) {
            return;
          }

          const { started, target, columnId: draggedId } = session;

          session.cleanup();
          session = null;

          if (started) {
            suppressClick = true;

            if (commit && target) {
              commitReorder(draggedId, target);
            }
          }

          Object.assign(drag, IDLE);
        };

        const onPointerUp = () => endSession(true);

        const onPointerCancel = () => {
          // The browser aborted the pointer stream and no click will follow, so ending the
          // session here must not arm the click suppression.
          if (session) {
            session.started = false;
          }

          endSession(false);
        };

        const onKeyDown = (key: globalThis.KeyboardEvent) => {
          if (key.key === "Escape") {
            endSession(false);
          }
        };

        session = {
          columnId,
          startX: event.clientX,
          started: false,
          target: null,
          cleanup: () => {
            removeEventListener("pointermove", onPointerMove);
            removeEventListener("pointerup", onPointerUp);
            removeEventListener("pointercancel", onPointerCancel);
            removeEventListener("keydown", onKeyDown);
          }
        };

        addEventListener("pointermove", onPointerMove);
        addEventListener("pointerup", onPointerUp);
        addEventListener("pointercancel", onPointerCancel);
        addEventListener("keydown", onKeyDown);
      }
    };
  };

  const consumeClickSuppression = () => {
    if (!suppressClick) {
      return false;
    }

    suppressClick = false;

    return true;
  };

  return {
    drag,
    getHeaderProps,
    consumeClickSuppression
  };
}
