import type { PropType } from "vue";
import { computed, defineComponent, h, onScopeDispose, ref, watchEffect } from "vue";

import type { Row, TableInstance } from "./types";

import { Draggable } from "@dnd-kit/dom";

import { useDataTableContext } from "./context";
import { useRowReorderSession } from "./row-reorder";
import { SIZES } from "./size";

/**
 * The injected handle cell (docs/rows.md#row-ordering). The pointer half hands the button to
 * dnd-kit as the draggable — a `Draggable` instance bound to the button element against the
 * session's manager (`row-reorder.ts`), the Vue counterpart of `useDraggable` — and the
 * keyboard half drives the session's index stepping directly. Disabled — visually and for
 * both channels — while something else controls the visible order, with the tooltip saying
 * why (docs/rows.md#row-ordering).
 *
 * The tooltip is a native `title` (plus a `data-ledger-tooltip` hook for styling) — there is
 * no Mantine Tooltip to open after a delay, so a live or lifted handle simply drops it.
 */
export const RowDragCell = defineComponent({
  name: "RowDragCell",
  props: {
    row: { type: Object as PropType<Row<any>>, required: true },
    table: { type: Object as PropType<TableInstance<any>>, required: true }
  },
  setup(props) {
    const dataTable = useDataTableContext();
    const { labels, icons, size } = dataTable;
    const session = useRowReorderSession();
    // The context carries the keyboard for the tree at large; the session's object is the same
    // instance, so a scope-less render (a part drawn outside the <DataTable> subtree) still works.
    const keyboard = dataTable.rowReorderKeyboard ?? session?.keyboard ?? null;

    const button = ref<HTMLButtonElement | null>(null);
    let draggable: Draggable | null = null;

    // `table.options` is plain in the Vue adapter — meta reads do not track. The gate's inputs
    // are the state slices, so the atoms anchor the recomputation and the fresh meta read keeps
    // the formula in one place (use-data-table.ts).
    const orderable = computed(() => {
      const atoms = props.table.atoms;
      void atoms.sorting.get().length;
      void atoms.columnFilters.get().length;
      void atoms.globalFilter.get();
      void atoms.grouping.get().length;

      return props.table.options.meta?.ledger?.rowOrdering.orderable === true;
    });

    // A pinned row's order is pinning state, not data order (docs/rows.md#row-ordering): it cannot
    // be lifted and is never a drop target, so it carries no handle at all. Gated on the switch,
    // not the state alone — with `enableRowPinning` off the zones never split, and a leftover
    // `rowPinning` value renders as an ordinary, draggable center row.
    const pinned = computed(() => {
      void props.table.atoms.rowPinning.get();

      return props.table.options.enableRowPinning === true && props.row.getIsPinned() !== false;
    });

    // No Feedback plugin runs (ROW_REORDER_PLUGINS): the handle stays put and the session's own
    // row ghost is the drag's visual.
    watchEffect(() => {
      const element = button.value;

      if (!element || !session || pinned.value) {
        draggable?.destroy();
        draggable = null;

        return;
      }

      if (draggable) {
        draggable.id = props.row.id;
        draggable.disabled = !orderable.value;

        return;
      }

      draggable = new Draggable(
        { id: props.row.id, element, disabled: !orderable.value },
        session.manager
      );
    });

    onScopeDispose(() => {
      draggable?.destroy();
      draggable = null;
    });

    const lifted = computed(() => keyboard?.active(props.row.id) === true);

    // The pointer channel's drag source — either channel live on this row drops the tooltip,
    // which would only chase the drag.
    const dragSource = computed(() => session !== null && session.sourceId.value === props.row.id);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboard || !orderable.value) {
        return;
      }

      const { key } = event;

      if (key === " " || key === "Enter") {
        event.preventDefault();
        event.stopPropagation();

        if (lifted.value) {
          keyboard.drop();
        } else {
          keyboard.lift(props.row.id);
        }

        return;
      }

      // The remaining keys belong to a live lift alone — an idle handle leaves them to the page.
      if (!lifted.value) {
        return;
      }

      switch (key) {
        case "ArrowUp": {
          event.preventDefault();
          event.stopPropagation();
          keyboard.move(-1);

          break;
        }

        case "ArrowDown": {
          event.preventDefault();
          event.stopPropagation();
          keyboard.move(1);

          break;
        }

        case "Home": {
          event.preventDefault();
          event.stopPropagation();
          keyboard.moveToEdge("start");

          break;
        }

        case "End": {
          event.preventDefault();
          event.stopPropagation();
          keyboard.moveToEdge("end");

          break;
        }

        case "Escape": {
          event.preventDefault();
          event.stopPropagation();
          keyboard.cancel();

          break;
        }
        // No default
      }
    };

    return () => {
      if (pinned.value) {
        return null;
      }

      const tooltip = dragSource.value || lifted.value
        ? undefined
        : orderable.value ? labels.reorderRow : labels.rowOrderingUnavailable;

      return h(
        "button",
        {
          "aria-disabled": !orderable.value || undefined,
          "aria-label": labels.reorderRow,
          "aria-pressed": lifted.value || undefined,
          "data-ledger-tooltip": tooltip,
          ref: button,
          title: tooltip,
          type: "button",
          onBlur: () => {
            // A keyboard lift is bound to the handle that owns the keys — focus leaving it would
            // strand a session nothing can reach.
            if (lifted.value) {
              keyboard?.cancel();
            }
          },
          onKeydown: handleKeyDown
        },
        [h(icons.reorderRow, { size: SIZES[size].glyph })]
      );
    };
  }
});
