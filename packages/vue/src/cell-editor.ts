import type { Cell } from "./types";
import type { PropType, Ref } from "vue";
import { computed, defineComponent, h, onMounted, onScopeDispose, ref, watch } from "vue";

import { columnHeaderText } from "./build-columns";
import { LedgerSpinner, svgGlyph } from "./controls";
import { useDataTableContext } from "./context";
import { cellValue, normalizeEdit } from "./edit-meta";
import { useGetStyles } from "./get-styles";
import { SIZES } from "./size";

export { canEditCell } from "./edit-meta";

/** The save affordance's glyph — the anatomy of the editor host, not a registry glyph. */
const IconCheck = svgGlyph(() => [h("path", { d: "M20 6 9 17l-5-5" })]);

/**
 * The editor hosts, for both modes. Each is a view of its session plus a keyboard surface: the
 * draft, the validation, the in-flight commit and the failure all belong to the controller, so
 * that a hidden column or a virtual scroll unmounting an editor takes nothing with it
 * (docs/architecture.md). The host renders no control of its own — the renderer the column
 * declared does (docs/editing.md#editors) — it supplies the context, the keyboard map, the save
 * affordance, and the pending presentation around it.
 *
 * Vue edition: rendered by the body as `h(CellEditor, { cell })` / `h(RowCellEditor, { cell })`.
 * React's useReducer redraw bump is a local ref counter the render tracks, the registration
 * layout effect is a post-flush watch over stable projections (register identity, row and column
 * id), and the registration itself is released on scope disposal. The Mantine `autoFocus` each
 * shipped input received becomes a mount-time focus of the first control, which covers custom
 * renderers too. The React edition committed on blur; this edition never saves on focus loss —
 * the save button does, and a pointerdown elsewhere cancels (docs/editing.md).
 */

/**
 * Focuses the first focusable control of an editor host — the same selectors the row-mode
 * host's registered `focus` uses.
 */
function focusFirstControl(host: HTMLElement | null | undefined): void {
  host?.querySelector<HTMLElement>(":scope input, :scope select, :scope textarea, :scope button")?.focus();
}

export interface CellEditorProps {
  cell: Cell<any, unknown>;
}

export const CellEditor = defineComponent({
  name: "CellEditor",
  props: {
    cell: { type: Object as PropType<Cell<any, unknown>>, required: true }
  },
  setup(props) {
    // Live reads: the context is reactive — destructuring here would freeze a setup-time
    // snapshot, so an open editor would never hear a `size` or labels change.
    const context = useDataTableContext();
    const labels = () => context.labels;
    const size = () => context.size;
    const editing = computed(() => props.cell.getContext().table.options.meta?.ledger?.editing);
    // Projected onto its own computed so the registration watch compares the stable function
    // identity, not `meta.ledger`, which is a fresh object on every reactive tick.
    const register = computed(() => editing.value?.register ?? null);
    const rowId = computed(() => props.cell.row.id);
    const columnId = computed(() => props.cell.column.id);

    /**
     * Bumped by the session through `redraw`; the draw below reads the counter, so every value it
     * shows is read fresh from the session — there is nothing here to put back.
     */
    const tick = ref(0);
    const redrawFromSession = () => {
      tick.value += 1;
    };

    // Layout, not passive: the registry is what "on screen right now" means to the session, and a
    // commit that unmounts this editor is followed by microtasks — a settling write among them —
    // long before a passive cleanup would run.
    //
    // Bound to the controller and the cell, not to this component's lifetime: in hook mode the
    // table can be swapped for another instance while the host keeps this editor, and a
    // registration left with the controller that is gone means the one now in charge cannot reach
    // it. The watch re-registers when the controller's `register` or the cell moves, and the
    // disposer releases the last one when the component goes away.
    let disposer: (() => void) | null = null;

    watch(
      [register, rowId, columnId],
      ([currentRegister, currentRowId, currentColumnId]) => {
        disposer?.();
        disposer = null;

        if (currentRegister) {
          disposer = currentRegister(currentRowId, currentColumnId, { redraw: redrawFromSession });
        }
      },
      { flush: "post", immediate: true }
    );
    onScopeDispose(() => {
      disposer?.();
      disposer = null;
    });

    const hostRef: Ref<HTMLDivElement | null> = ref(null);

    // Cell mode's editor always takes focus as it mounts (the context's `autoFocus` is always
    // true here); the host focuses the first control, which is what the React edition's input
    // `autoFocus` did for the shipped controls.
    //
    // Clicking outside the editor cancels the session — this edition's replacement for the
    // React edition's blur commit: nothing saves on focus loss, the save button does, and a
    // pointerdown that lands elsewhere has nowhere to keep a draft. The select's portaled
    // dropdown counts as inside — its surface carries `data-ledger-editor-surface` wherever it
    // mounts — and `cancel` itself stands down while a write is out, so a click during the
    // pending window is inert here without a check of its own.
    const onDocumentPointerdown = (event: PointerEvent) => {
      const host = hostRef.value;

      if (!host) {
        return;
      }

      const path = event.composedPath();

      if (path.includes(host) || path.some(node => node instanceof Element && node.hasAttribute("data-ledger-editor-surface"))) {
        return;
      }

      editing.value?.cancel();
    };

    onMounted(() => {
      focusFirstControl(hostRef.value);
      document.addEventListener("pointerdown", onDocumentPointerdown, true);
    });
    onScopeDispose(() => document.removeEventListener("pointerdown", onDocumentPointerdown, true));

    return () => {
      const editingController = editing.value;
      const normalized = normalizeEdit(props.cell.column.columnDef.meta?.edit);
      const currentRowId = rowId.value;
      const currentColumnId = columnId.value;

      // An instant column has no session for this host to draw — a change in the cell is the commit
      // (docs/editing.md#instant-editing) — so a programmatic `startEditing` on one renders nothing.
      if (!normalized || normalized.kind === "instant" || !editingController) {
        return null;
      }

      // Reading the counter is what ties this draw to the session's redraws.
      if (tick.value < 0) {
        return null;
      }

      const draft = editingController.drafts.read(currentRowId, currentColumnId, cellValue(props.cell));
      const editError = editingController.drafts.error(currentRowId, currentColumnId);
      const pending = editingController.drafts.pending(currentRowId, currentColumnId);

      const setValue = (value: unknown) => {
        editingController.drafts.write(currentRowId, currentColumnId, value);
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        switch (event.key) {
          case "Enter": {
            event.preventDefault();
            void editingController.commit();

            break;
          }

          case "Escape": {
            event.preventDefault();
            event.stopPropagation();
            editingController.cancel();

            break;
          }

          case "Tab": {
            event.preventDefault();
            // The session owns the move: where the caret goes next depends on the row as the screen
            // has it, and this editor could only ask the shared core (docs/architecture.md).
            editingController.moveTo(event.shiftKey);

            break;
          }
        // No default
        }
      };

      const editor = normalized.render({
        row: props.cell.row,
        column: props.cell.column,
        value: draft,
        setValue,
        commit: () => editingController.commit(),
        cancel: () => editingController.cancel(),
        error: editError,
        pending,
        mode: "cell",
        autoFocus: true,
        label: labels().editColumn(columnHeaderText(props.cell.column)),
        size: SIZES[size()].control
      });

      return h(
        "div",
        {
          "aria-busy": pending || undefined,
          "aria-label": pending ? labels().editPending : undefined,
          "data-pending": pending || undefined,
          onClick: (event: MouseEvent) => event.stopPropagation(),
          onDblclick: (event: MouseEvent) => event.stopPropagation(),
          onKeydown: handleKeyDown,
          ref: hostRef,
          ...useGetStyles()("cellEditor")
        },
        [
          editor,
          // The explicit save. Pointer-only by design: Enter saves from the control, the host's
          // keyboard map owns Tab, and the click affordance is what the React edition's blur
          // commit was.
          h(
            "button",
            {
              "aria-label": labels().editSave,
              class: "ledger-editor-save",
              disabled: pending || undefined,
              tabindex: -1,
              type: "button",
              onClick: () => {
                void editingController.commit();
              }
            },
            [h(IconCheck)]
          ),
          pending ? h(LedgerSpinner, { size: 12 }) : null
        ]
      );
    };
  }
});

/**
 * The row-mode editor host (docs/editing.md#row-mode): one per editable cell of the editing
 * row, all mounted at once. Drafts write through to the controller's store (they must survive
 * a virtualized unmount), blur never commits, and Enter/Escape commit or cancel the whole row.
 */
export const RowCellEditor = defineComponent({
  name: "RowCellEditor",
  props: {
    cell: { type: Object as PropType<Cell<any, unknown>>, required: true }
  },
  setup(props) {
    // Live reads: the context is reactive — destructuring here would freeze a setup-time
    // snapshot, so an open editor would never hear a `size` or labels change.
    const context = useDataTableContext();
    const labels = () => context.labels;
    const size = () => context.size;
    const editing = computed(() => props.cell.getContext().table.options.meta?.ledger?.editing);
    const rowApi = computed(() => editing.value?.row ?? null);
    const register = computed(() => rowApi.value?.register ?? null);
    const columnId = computed(() => props.cell.column.id);
    const rowId = computed(() => props.cell.row.id);

    /**
     * Bumped by the session through `redraw`, and by `setValue` (the row store does not redraw on
     * its own); the draw below reads the counter, so every value it shows is read fresh from the
     * session — there is nothing here to put back.
     */
    const tick = ref(0);
    const redrawFromSession = () => {
      tick.value += 1;
    };

    const containerRef: Ref<HTMLDivElement | null> = ref(null);

    const focusEditor = () => {
      focusFirstControl(containerRef.value);
    };

    // Layout, not passive: the registry is what "on screen right now" means to the session, and a
    // commit that unmounts this editor is followed by microtasks — a settling write among them —
    // long before a passive cleanup would have run. A registration that outlives its DOM would put
    // a failure on a column nobody can see. Bound to the controller and the column, not to this
    // component's lifetime: in hook mode the table can be swapped for another instance while the
    // host keeps this editor, and a registration left with the controller that is gone means the
    // one now in charge cannot reach it.
    let disposer: (() => void) | null = null;

    watch(
      [register, columnId],
      ([currentRegister, currentColumnId]) => {
        disposer?.();
        disposer = null;

        if (currentRegister) {
          disposer = currentRegister(currentColumnId, { focus: focusEditor, redraw: redrawFromSession });
        }
      },
      { flush: "post", immediate: true }
    );
    onScopeDispose(() => {
      disposer?.();
      disposer = null;
    });

    // Row mode: only the column the session was started from autofocuses — read at mount, so a
    // remounted editor (StrictMode's round-trip in React, a virtualizer round-trip here) keeps
    // the focus.
    onMounted(() => {
      if (rowApi.value?.shouldFocus(columnId.value)) {
        focusEditor();
      }
    });

    return () => {
      const editingController = editing.value;
      const currentRowApi = rowApi.value;
      const normalized = normalizeEdit(props.cell.column.columnDef.meta?.edit);
      const currentRowId = rowId.value;
      const currentColumnId = columnId.value;

      if (!normalized || !editingController) {
        return null;
      }

      // Reading the counter is what ties this draw to the session's redraws.
      if (tick.value < 0) {
        return null;
      }

      // The store is the value, not a copy of it: what the row holds moves under an open editor —
      // the application feeds a write back, normalizes it, or the controller throws the edit away —
      // and local state would go on showing a value the row had already left behind. Rendering is
      // the only thing left to ask for.
      const draft = currentRowApi
        ? currentRowApi.drafts.read(currentRowId, currentColumnId, cellValue(props.cell))
        : cellValue(props.cell);
      const editError = currentRowApi?.drafts.error(currentRowId, currentColumnId) ?? null;
      const pending = currentRowApi?.drafts.pending(currentRowId) ?? false;
      const autoFocus = currentRowApi?.shouldFocus(currentColumnId) ?? false;

      const setValue = (value: unknown) => {
        currentRowApi?.drafts.write(currentRowId, currentColumnId, value);
        redrawFromSession();
      };

      const handleKeyDown = (event: KeyboardEvent) => {
        // An inner control that consumed the key (a select picking its option) keeps it.
        if (event.defaultPrevented) {
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          editingController.row.stop({ commit: true });
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          editingController.row.stop({ commit: false });
        }
      };

      const label = labels().editColumn(columnHeaderText(props.cell.column));

      const editor
        = normalized.kind === "instant"
          ? normalized.render({
              row: props.cell.row,
              column: props.cell.column,
              value: draft,
              // In row mode an instant control joins the row like any other editor: its commit
              // stages the value in the row draft, and the atomic row commit owns the write
              // (docs/editing.md#instant-editing).
              commit: (value: unknown) => {
                setValue(value);

                return true;
              },
              error: editError,
              pending,
              label,
              size: SIZES[size()].control
            })
          : normalized.render({
              row: props.cell.row,
              column: props.cell.column,
              value: draft,
              setValue,
              // Row mode: commit/cancel operate on the whole row, matching the keyboard map. The
              // result is the row's real one — validation across every editable column, and the
              // application's handler — not an acknowledgement that the request was made.
              commit: () => editingController.row.commit(),
              cancel: () => editingController.row.stop({ commit: false }),
              error: editError,
              pending,
              mode: "row",
              autoFocus,
              label,
              size: SIZES[size()].control
            });

      return h(
        "div",
        {
          "aria-busy": pending || undefined,
          "aria-label": pending ? labels().editPending : undefined,
          "data-pending": pending || undefined,
          onClick: (event: MouseEvent) => event.stopPropagation(),
          onDblclick: (event: MouseEvent) => event.stopPropagation(),
          onKeydown: handleKeyDown,
          ref: containerRef,
          ...useGetStyles()("cellEditor")
        },
        [editor, pending ? h(LedgerSpinner, { size: 12 }) : null]
      );
    };
  }
});
