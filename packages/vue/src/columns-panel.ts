import type { DragEndEvent } from "@dnd-kit/dom";
import type { ColumnPinningPosition, RowData } from "@tanstack/vue-table";
import type { CSSProperties, PropType } from "vue";

import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { Column, TableInstance } from "./types";
import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  watchEffect
} from "vue";

import { DragDropManager, Feedback } from "@dnd-kit/dom";
import { ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport } from "reka-ui";
import { Sortable } from "@dnd-kit/dom/sortable";

import { columnEnableResizing, columnHeaderText, isInternalColumn, rawColumnSizing } from "./build-columns";
import { applyCenterOrder, resolveColumnOrder } from "./column-order";
import { LedgerButton, LedgerCheckbox, LedgerNumberInput, LedgerPopover } from "./controls";
import { resolveIcons } from "./icons";
import { resolveLabels } from "./labels";

/**
 * `DataTable.ColumnsPanel` — one surface for every column-layout decision: order (drag),
 * visibility, pinning, width, and grouping. It replaces the per-column header menu, whose
 * "hide column" item was a trap door — a hidden column took its own menu with it.
 *
 * Trigger-agnostic by construction. The default slot IS the trigger and the panel opens from it
 * in a popover; with no slot the panel renders bare, so a drawer, a sidebar, or a settings page
 * hosts it just as well. Bare is the primary shape — the rest of the compound family
 * (`DataTableSearch` / `DataTablePagination` / `DataTableSelectionBar`) is bare content the page
 * places, too. A trigger wired through the scoped slot should call `toggle` from its own click
 * handler and stop the event's propagation (the popover anchor also toggles on unstopped clicks).
 *
 * Presentation contract (docs/columns.md): at rest a row is identity — checkbox and name — plus
 * dimmed marks only where the layout deviates from default (captions over pinned zones, an
 * overridden width, a grouped column, a dimmed hidden name). The machinery — drag handle, width
 * field, pin segment, group toggle — surfaces on the hovered or keyboard-focused row and stays
 * inline where hover does not exist. The reveal is stylesheet-only: every control is always in
 * the DOM and the accessibility tree.
 *
 * Vue edition: drag and drop runs on `@dnd-kit/dom`'s imperative API — one `DragDropManager` per
 * panel, a `Sortable` per orderable row, drag state tracked through the manager's monitor events.
 */
export interface DataTableColumnsPanelProps<TData extends RowData> {
  table: TableInstance<TData>;
  /**
   * Forwarded to the popover; only meaningful alongside a trigger (the default slot).
   */
  popoverProps?: {
    placement?: "bottom-start" | "bottom-end";
    panelWidth?: number;
    panelMaxHeight?: string;
    panelStyle?: CSSProperties;
  };
  labels?: Partial<DataTableLabels>;
  icons?: Partial<DataTableIcons>;
  className?: string;
  style?: CSSProperties;
}
/**
 * The three lists the panel renders, in table display order. `start` / `center` / `end` are
 * TanStack's own words (`getStartLeafColumns` / `getCenterLeafColumns` / `getEndLeafColumns`);
 * "zone" is ledger's collective noun for them, because TanStack names the accessors but never
 * the set.
 */
type ColumnZone = "start" | "center" | "end";

interface ColumnsPanelZone<TData extends RowData> {
  id: ColumnZone;
  columns: Array<Column<TData, unknown>>;
}

/**
 * Leaf columns per zone — hidden ones included (bringing them back is what the panel is for) and
 * ledger's injected columns excluded (they can never be reordered, hidden, or unpinned). The
 * order is TanStack's: a pinned zone reads its `columnPinning` array, the center reads
 * `columnOrder`. Call inside a `computed` — the getters read the state atoms, and the read is
 * what makes the panel reactive.
 */
function resolveZones<TData extends RowData>(table: TableInstance<TData>): Array<ColumnsPanelZone<TData>> {
  const external = (columns: Array<Column<TData, unknown>>) => columns.filter(column => !isInternalColumn(column.id));

  return [
    { id: "start", columns: external(table.getStartLeafColumns()) },
    { id: "center", columns: external(table.getCenterLeafColumns()) },
    { id: "end", columns: external(table.getEndLeafColumns()) }
  ];
}

/**
 * The pinned zones caption themselves — the zone's pin glyph beside its name, the same pair the
 * row's pin segments speak; the center is the default territory and stays unlabeled.
 */
const zoneCaptions = {
  start: {
    label: "pinnedStart",
    icon: "pinStart"
  },
  end: {
    label: "pinnedEnd",
    icon: "pinEnd"
  }
} satisfies Partial<Record<ColumnZone, { label: keyof DataTableLabels; icon: keyof DataTableIcons }>>;

/**
 * The three-state position control, one segment per TanStack `ColumnPinningPosition`. `key`
 * addresses both registries — the icon slots are named for their label keys. `value` stands in
 * for the position inside the segment control, whose values must be strings ("center" is the
 * zone name for TanStack's `false`).
 */
const pinSegments: Array<{
  position: ColumnPinningPosition;
  value: "start" | "center" | "end";
  key: "pinStart" | "unpin" | "pinEnd";
}> = [
  {
    position: "start",
    value: "start",
    key: "pinStart"
  },
  {
    position: false,
    value: "center",
    key: "unpin"
  },
  {
    position: "end",
    value: "end",
    key: "pinEnd"
  }
];

/**
 * The one move the drag applies, in `arrayMove` semantics: remove the source id, insert it at
 * the target's position. Returns the SAME array when nothing moved, so a no-op drag is
 * indistinguishable from a canceled one downstream. (`@dnd-kit/helpers`' `move`, reduced to what
 * a zone reorder needs — the Vue package ships without the helpers dependency.)
 */
export const DataTableColumnsPanel = defineComponent({
  name: "DataTableColumnsPanel",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    popoverProps: { type: Object as PropType<DataTableColumnsPanelProps<any>["popoverProps"]>, default: undefined },
    labels: { type: Object as PropType<Partial<DataTableLabels>>, default: undefined },
    icons: { type: Object as PropType<Partial<DataTableIcons>>, default: undefined },
    className: { type: String, default: undefined },
    style: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props, { slots }) {
    const resolvedLabels = resolveLabels(props.labels);
    const resolvedIcons = resolveIcons(props.icons);

    const content = () =>
      h(ColumnsPanelContent, {
        className: props.className,
        icons: resolvedIcons,
        labels: resolvedLabels,
        style: props.style,
        table: props.table
      });

    return () => {
      if (!slots.default) {
        return content();
      }

      // 360 fits the widest row a column can ask for — handle, checkbox, a comfortable title, and
      // the revealed toolbar — so the default never squeezes; `popoverProps` tunes it for column
      // sets that need less or titles that need more.
      return h(
        LedgerPopover,
        {
          placement: props.popoverProps?.placement ?? "bottom-end",
          panelWidth: props.popoverProps?.panelWidth ?? 360,
          panelMaxHeight: props.popoverProps?.panelMaxHeight ?? "60vh",
          panelStyle: {
            // The panel brings its own padding, and a dropdown grows without bound — it gets a
            // definite cap here and the panel's own list becomes the scroller.
            display: "flex",
            padding: "0",
            ...props.popoverProps?.panelStyle
          }
        },
        { default: slots.default, content }
      );
    };
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented prop shape of the content component
export interface ColumnsPanelContentProps<TData extends RowData> {
  table: TableInstance<TData>;
  labels: DataTableLabels;
  icons: DataTableIcons;
  className?: string;
  style?: CSSProperties;
}

const ColumnsPanelContent = defineComponent({
  name: "ColumnsPanelContent",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    labels: { type: Object as PropType<DataTableLabels>, required: true },
    icons: { type: Object as PropType<DataTableIcons>, required: true },
    className: { type: String, default: undefined },
    style: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props) {
    const zones = computed(() => resolveZones(props.table));
    const draggedId = ref<string | null>(null);

    // The same rule the header drag applies (use-column-reorder.ts): with column groups, sibling
    // order inside a group is ambiguous — that composable already carries the dev warning.
    const orderable = computed(
      () => props.table.options.meta?.ledger?.enableColumnOrdering === true && props.table.getHeaderGroups().length === 1
    );

    const zoneIds = (id: ColumnZone) => zones.value.find(zone => zone.id === id)?.columns.map(column => column.id) ?? [];

    const manager = new DragDropManager();
    const listEl = ref<HTMLElement | null>(null);
    const unsubscribeDragStart = manager.monitor.addEventListener("dragstart", event => {
      draggedId.value = event.operation.source ? String(event.operation.source.id) : null;
    });
    const unsubscribeDragEnd = manager.monitor.addEventListener("dragend", event => {
      draggedId.value = null;
      handleDragEnd(event);
    });
    onScopeDispose(() => {
      unsubscribeDragStart();
      unsubscribeDragEnd();
      manager.destroy();
    });

    const handleDragEnd = (event: DragEndEvent) => {
      const source = event.operation.source;

      if (!source) {
        return;
      }

      // A canceled end is abandoned only when the operation had initialized — an Escape.
      // dnd-kit ALSO reports canceled for every drop where the drag operation never
      // initialized (`canceled = !status.initialized` in its pointer sensor), and inside this
      // teleported panel that is the common case: collision detection comes up empty from
      // pickup to drop, the operation never initializes, yet the drag itself is real —
      // dragstart fired, the pointer moved, the sortable previewed the move. Those drops
      // commit; the target resolves from the pointer position below either way.
      if (event.canceled && event.operation.status.initialized) {
        return;
      }

      const zone = zones.value.find(candidate => candidate.columns.some(column => column.id === source.id));

      if (!zone) {
        return;
      }

      const ids = zone.columns.map(column => column.id);

      // The drop target is resolved from the POINTER POSITION over the panel's own rows:
      // operation.target does not resolve reliably here (the panel is teleported to the body,
      // where dnd-kit's collision shapes repeatedly come up empty), and the drop still has to
      // land between the rows the user actually pointed at.
      // The insertion index is counted over the zone's own rows EXCLUDING the dragged one:
      // dnd-kit live-reorders the DOM during the drag and the dragged row follows the pointer,
      // so probing the full list always resolves to the source itself. The non-source rows keep
      // their relative order while they shift, so an index counted over them (by midpoint,
      // against the dragged row's drop rectangle — `shape.current`, which keyboard drags also
      // produce; the pointer position stands in when a host omits the shape) maps straight onto
      // the pre-drag `ids` order.
      const shape = event.operation.shape?.current?.boundingRectangle;
      const probeY = shape
        ? shape.top + shape.height / 2
        : event.operation.position.current.y;
      const sourceId = String(source.id);
      const allRows = [...(listEl.value?.querySelectorAll("[data-column-id]") ?? [])];
      const sourceRow = allRows.find(row => row.getAttribute("data-column-id") === sourceId);
      const zoneEl = sourceRow?.closest(".ledger-columns-panel-zone");
      const scopedRows = zoneEl ? [...zoneEl.querySelectorAll("[data-column-id]")] : allRows;

      let insertAt = 0;

      for (const row of scopedRows) {
        if (row.getAttribute("data-column-id") === sourceId) {
          continue;
        }

        const rect = row.getBoundingClientRect();

        if (rect.y + rect.height / 2 < probeY) {
          insertAt += 1;
        }
      }

      const next = [...ids];
      next.splice(next.indexOf(sourceId), 1);
      next.splice(Math.min(insertAt, next.length), 0, sourceId);

      if (next.join(",") === ids.join(",")) {
        return;
      }

      if (zone.id === "center") {
        props.table.setColumnOrder(applyCenterOrder(resolveColumnOrder(props.table), next));

        return;
      }

      // Assembled from the panel's own zone lists, never from the columnPinning slice: that one
      // carries the injected column ids useDataTable merges in on every render, and echoing them
      // back would leak `ledger:*` into the consumer's onColumnPinningChange and persisted state.
      props.table.setColumnPinning({
        start: zone.id === "start" ? next : zoneIds("start"),
        end: zone.id === "end" ? next : zoneIds("end")
      });
    };

    const handleReset = () => {
      // Exactly the layout set `persistState` persists by default (docs/state.md). Each reset
      // targets `table.initialState`, which useDataTable seeds from the `defaultX` options — so
      // this restores the application's declared layout, not merely an empty one.
      props.table.resetColumnOrder();
      props.table.resetColumnVisibility();
      props.table.resetColumnPinning();
      props.table.resetColumnSizing();
    };

    return () =>
      h("div", { class: `ledger-columns-panel ${props.className ?? ""}`.trim(), style: props.style }, [
        h("div", { class: "ledger-columns-panel-header" }, [
          h("span", { class: "ledger-columns-panel-title" }, props.labels.columnsPanel),

          h(
            LedgerButton,
            { variant: "subtle", size: "xs", onClick: handleReset },
            { default: () => [h(props.icons.resetColumns, { size: 14 }), props.labels.resetColumns] }
          )
        ]),

        // The list scrolls through the same reka ScrollArea the table body uses — a floating
        // scrollbar, not the host's native one (the panel is teleported to the body, where a
        // native classic scrollbar would clash with the table's floating bars).
        h(ScrollAreaRoot, { asChild: true, type: "always" }, {
          default: () => [
            h("div", { ref: listEl, class: "ledger-columns-panel-list" }, [
              h(ScrollAreaViewport, { class: "ledger-columns-panel-list-viewport" }, {
                default: () =>
                  zones.value
                    .filter(zone => zone.columns.length > 0)
                    .map(zone =>
                      h(
                        "div",
                        {
                          key: zone.id,
                          class: "ledger-columns-panel-zone",
                          "data-pinned": zone.id !== "center" || undefined
                        },
                        [
                          zone.id !== "center" ? zoneCaption(zone.id, props.labels, props.icons) : null,
                          ...zone.columns.map((column, index) =>
                            h(ColumnsPanelItem, {
                              key: column.id,
                              column,
                              draggedId: draggedId.value,
                              icons: props.icons,
                              index,
                              labels: props.labels,
                              manager,
                              orderable: orderable.value,
                              table: props.table,
                              zone: zone.id
                            })
                          )
                        ]
                      )
                    )
              }),
              h(ScrollAreaScrollbar, { class: "ledger-scrollbar", orientation: "vertical" }, {
                default: () => h(ScrollAreaThumb, { class: "ledger-scrollbar-thumb" })
              })
            ])
          ]
        })
      ]);
  }
});

function zoneCaption(zone: keyof typeof zoneCaptions, labels: DataTableLabels, icons: DataTableIcons) {
  const caption = zoneCaptions[zone];
  const Glyph = icons[caption.icon];

  // A ledger-owned div, not a styled paragraph: the caption's box, type, and color all live in
  // the stylesheet, so the host cannot out-specify them with an unlayered reset.
  return h("div", { class: "ledger-columns-panel-zone-label" }, [h(Glyph, { size: 12 }), labels[caption.label]]);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- documented prop shape of the item component
export interface ColumnsPanelItemProps<TData extends RowData> {
  column: Column<TData, unknown>;
  table: TableInstance<TData>;
  labels: DataTableLabels;
  icons: DataTableIcons;
  index: number;
  zone: ColumnZone;
  orderable: boolean;
  manager: DragDropManager;
  draggedId: string | null;
}

const ColumnsPanelItem = defineComponent({
  name: "ColumnsPanelItem",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    labels: { type: Object as PropType<DataTableLabels>, required: true },
    icons: { type: Object as PropType<DataTableIcons>, required: true },
    index: { type: Number, required: true },
    zone: { type: String as PropType<ColumnZone>, required: true },
    orderable: { type: Boolean, required: true },
    manager: { type: Object as PropType<DragDropManager>, required: true },
    draggedId: { type: String as PropType<string | null>, default: null }
  },
  setup(props) {
    const rootEl = ref<HTMLElement | null>(null);
    const handleEl = ref<HTMLElement | null>(null);

    // `type`/`accept` both carry the zone, so a column only ever sorts among its own kind: moving
    // between zones is what the pin controls are for, and an empty zone has no drop target anyway.
    let sortable: Sortable | undefined;

    const destroySortable = () => {
      sortable?.destroy();
      sortable = undefined;
    };

    // One effect owns the whole lifecycle: created when the gate opens (the element and handle
    // refs are read here, so late-binding refs land), every field synced while it lives, torn
    // down when the gate shuts.
    watchEffect(() => {
      if (props.orderable) {
        if (!sortable) {
          sortable = new Sortable(
            {
              accept: props.zone,
              disabled: !props.orderable,
              group: props.zone,
              id: props.column.id,
              index: props.index,
              // The clone follows the pointer while the row keeps its seat — the React edition's
              // useSortable default, restated here because the imperative API's default moves.
              plugins: defaults => [...defaults, Feedback.configure({ feedback: "clone" })],
              type: props.zone
            },
            props.manager
          );
        }

        sortable.element = rootEl.value ?? undefined;
        sortable.handle = handleEl.value ?? undefined;
        sortable.id = props.column.id;
        sortable.index = props.index;
        sortable.group = props.zone;
        sortable.type = props.zone;
        sortable.accept = props.zone;
        sortable.disabled = !props.orderable;
      } else {
        destroySortable();
      }
    });

    onBeforeUnmount(destroySortable);

    const title = columnHeaderText(props.column);
    const isDragging = computed(() => props.draggedId === props.column.id);
    const visible = computed(() => {
      props.table.atoms.columnVisibility.get();

      return props.column.getIsVisible();
    });
    const pinned = computed(() => {
      props.table.atoms.columnPinning.get();

      return props.column.getIsPinned();
    });
    const grouped = computed(() => {
      props.table.atoms.grouping.get();

      return props.column.getIsGrouped();
    });
    const canPin = props.column.getCanPin();
    // Ledger's own gate — the TanStack `columnResizingFeature` (and `getCanResize`) is unregistered.
    const canResize
      = props.table.options.meta?.ledger?.enableColumnResizing === true
        && columnEnableResizing(props.column.columnDef) !== false;
    const canGroup = props.table.options.enableGrouping === true && props.column.getCanGroup();

    // The field holds the OVERRIDE; empty falls back to whatever the definition prescribes — the
    // author's `size`, or growing where none is declared. The placeholder shows that fallback
    // rather than a blanket "auto", which would misdescribe every column that declares a size.
    // Author sizing comes from the RAW registry, never `columnDef.size`: TanStack merges its
    // `size: 150` default into every resolved definition, which would make "unsized"
    // unrepresentable (docs/sizing.md).
    // Read through the slice atom, not `table.state`: `.state` exists only on the hook's wrapper,
    // while a panel hosted in a header cell receives the core instance — atoms live on both.
    const width = computed(() => props.table.atoms.columnSizing.get()[props.column.id]);
    const declaredWidth = rawColumnSizing(props.column.columnDef)?.size ?? props.table.options.defaultColumn?.size;

    const handleWidthChange = (value: number | "") => {
      props.table.setColumnSizing(previous => {
        // Cleared: drop the entry entirely rather than zeroing it — the same move the resize drag
        // makes on Escape (use-column-resize.ts), and the only state the width engine reads as
        // "no override" (docs/sizing.md).
        if (value === "") {
          const { [props.column.id]: _dropped, ...rest } = previous;

          return rest;
        }

        return { ...previous, [props.column.id]: Number(value) };
      });
    };

    return () => {
      const widthValue = width.value;

      return h(
        "div",
        {
          ref: rootEl,
          class: "ledger-columns-panel-item",
          "data-column-id": props.column.id,
          "data-dragging": isDragging.value || undefined,
          "data-hidden": !visible.value || undefined
        },
        [
          props.orderable
            ? h("span", { ref: handleEl, class: "ledger-columns-panel-grip" }, [
                h(
                  LedgerButton,
                  {
                    class: "ledger-columns-panel-handle",
                    variant: "subtle",
                    size: "xs",
                    ariaLabel: props.labels.reorderColumn,
                    title: props.labels.reorderColumn
                  },
                  { default: () => h(props.icons.reorderColumn, { size: 14 }) }
                )
              ])
            : null,

          // A flex item defaults to `min-width: auto`, so the nowrap title would set an
          // unshrinkable floor — long names would shove the rest of the row instead of ellipsing
          // (the wrapper div + stylesheet carry the shrink). The title rides the wrapper, so it
          // answers on the truncated text, not only on the box.
          h(
            "div",
            { class: "ledger-columns-panel-label", title },
            h(
              LedgerCheckbox,
              {
                checked: visible.value,
                disabled: !props.column.getCanHide(),
                size: "sm",
                "onUpdate:checked": checked => props.column.toggleVisibility(checked)
              },
              { default: () => title }
            )
          ),

          // Rest-state marks for the two deviations the zone captions cannot carry. The toolbar
          // covers them while revealed, and the touch stylesheet drops them outright — there the
          // real controls sit inline and already say the same thing.
          grouped.value || widthValue !== undefined
            ? h("div", { class: "ledger-columns-panel-indicators" }, [
                grouped.value ? h(props.icons.groupByColumn, { size: 12 }) : null,
                widthValue !== undefined ? h("span", { class: "ledger-columns-panel-width-mark" }, `${widthValue}px`) : null
              ])
            : null,

          canResize || canGroup || canPin
            ? h("div", { class: "ledger-columns-panel-controls" }, [
                canResize
                  ? h(LedgerNumberInput, {
                      class: "ledger-columns-panel-width-input",
                      ariaLabel: props.labels.columnWidth,
                      max: props.column.columnDef.maxSize,
                      min: props.column.columnDef.minSize,
                      placeholder: declaredWidth === undefined ? props.labels.columnWidthAuto : String(declaredWidth),
                      step: 10,
                      style: { width: "72px" },
                      modelValue: widthValue ?? "",
                      "onUpdate:modelValue": handleWidthChange
                    })
                  : null,

                canGroup
                  ? h(
                      LedgerButton,
                      {
                        variant: grouped.value ? "light" : "subtle",
                        size: "xs",
                        ariaLabel: grouped.value ? props.labels.ungroupColumn : props.labels.groupByColumn,
                        title: grouped.value ? props.labels.ungroupColumn : props.labels.groupByColumn,
                        "aria-pressed": grouped.value,
                        onClick: () => props.column.toggleGrouping()
                      },
                      { default: () => h(props.icons.groupByColumn, { size: 14 }) }
                    )
                  : null,

                // One radio-like group, not three toggle buttons: the pin state is a single choice
                // of position, and the selected segment says which without a tooltip. The label
                // key serves twice — the accessible name and the hover title.
                canPin
                  ? h(
                      "div",
                      { class: "ledger-columns-panel-segmented", role: "group" },
                      pinSegments.map(segment => {
                        const Glyph = props.icons[segment.key];
                        const active = pinned.value === segment.position;

                        return h(
                          LedgerButton,
                          {
                            key: segment.value,
                            class: "ledger-columns-panel-segment",
                            variant: active ? "light" : "subtle",
                            size: "xs",
                            ariaLabel: props.labels[segment.key],
                            title: props.labels[segment.key],
                            "aria-pressed": active,
                            onClick: () => props.column.pin(segment.position)
                          },
                          { default: () => h(Glyph, { size: 14 }) }
                        );
                      })
                    )
                  : null
              ])
            : null
        ]
      );
    };
  }
});
