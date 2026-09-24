import type { Component, FunctionalComponent } from "vue";
import { h, type VNode } from "vue";

/**
 * The table chrome's glyphs and the `icons` registry that swaps them (docs/styling.md#icons).
 *
 * The defaults are vendored from Lucide (https://lucide.dev): path data copied verbatim from
 * `lucide-static` v1.34.0, so there is no icon-library dependency and the set is a default, not
 * a lock — any component satisfying `DataTableIconProps` slots in, and `lucide-vue-next`
 * components satisfy it as-is.
 *
 * License of the vendored path data — ISC, Copyright (c) 2026 Lucide Icons and Contributors:
 * permission to use, copy, modify, and/or distribute this software for any purpose with or
 * without fee is hereby granted, provided that the above copyright notice and this permission
 * notice appear in all copies. The chevron, search and x glyphs are derived from Feather
 * (MIT, Copyright (c) 2013-present Cole Bemis).
 */
export interface DataTableIconProps {
  /**
   * Rendered width and height in px. The chrome passes 12–16 for controls and 40 for the
   * empty/error indicators.
   */
  size?: number;
  strokeWidth?: number;
}

export type DataTableIconComponent = Component<DataTableIconProps>;

const Icon: FunctionalComponent<DataTableIconProps> = (props, { slots }) => {
  return h(
    "svg",
    {
      "aria-hidden": true,
      fill: "none",
      height: props.size ?? 16,
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": props.strokeWidth ?? 2,
      viewBox: "0 0 24 24",
      width: props.size ?? 16
    },
    slots.default ? slots.default() : []
  );
};

Icon.props = {
  size: Number,
  strokeWidth: Number
};

function glyph(paths: () => VNode[]): FunctionalComponent<DataTableIconProps> {
  const G: FunctionalComponent<DataTableIconProps> = (props) => {
    return h(Icon, props, { default: paths });
  };

  return G;
}

// Glyphs, named for their Lucide source icons. Module-private: components reach them through
// the resolved registry, never directly.

const IconInbox = glyph(() => [
  h("polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12" }),
  h("path", { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" })
]);

const IconTriangleAlert = glyph(() => [
  h("path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }),
  h("path", { d: "M12 9v4" }),
  h("path", { d: "M12 17h.01" })
]);

const IconChevronUp = glyph(() => [h("path", { d: "m18 15-6-6-6 6" })]);

const IconChevronDown = glyph(() => [h("path", { d: "m6 9 6 6 6-6" })]);

const IconChevronRight = glyph(() => [h("path", { d: "m9 18 6-6-6-6" })]);

const IconChevronsUpDown = glyph(() => [
  h("path", { d: "m7 15 5 5 5-5" }),
  h("path", { d: "m7 9 5-5 5 5" })
]);

const IconFunnel = glyph(() => [
  h("path", { d: "M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" })
]);

const IconGripVertical = glyph(() => [
  h("circle", { cx: "9", cy: "12", r: "1" }),
  h("circle", { cx: "9", cy: "5", r: "1" }),
  h("circle", { cx: "9", cy: "19", r: "1" }),
  h("circle", { cx: "15", cy: "12", r: "1" }),
  h("circle", { cx: "15", cy: "5", r: "1" }),
  h("circle", { cx: "15", cy: "19", r: "1" })
]);

/**
 * The three pin states speak one language — where the column sits relative to the table's edges
 * (a pushpin cannot say start from end, which is why `pin` / `pin-off` were passed over).
 */
const IconArrowLeftToLine = glyph(() => [
  h("path", { d: "M3 19V5" }),
  h("path", { d: "m13 6-6 6 6 6" }),
  h("path", { d: "M7 12h14" })
]);

const IconArrowRightToLine = glyph(() => [
  h("path", { d: "M17 12H3" }),
  h("path", { d: "m11 18 6-6-6-6" }),
  h("path", { d: "M21 5v14" })
]);

/**
 * Neither edge: the column moves with the scroll again.
 */
const IconMoveHorizontal = glyph(() => [
  h("path", { d: "m18 8 4 4-4 4" }),
  h("path", { d: "M2 12h20" }),
  h("path", { d: "m6 8-4 4 4 4" })
]);

/**
 * "Put it back the way it was": counter-clockwise is the industry's undo, clockwise its
 * refresh — the table shows both, so they must not be the same glyph.
 */
const IconRotateCcw = glyph(() => [
  h("path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }),
  h("path", { d: "M3 3v5h5" })
]);

const IconRotateCw = glyph(() => [
  h("path", { d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" }),
  h("path", { d: "M21 3v5h-5" })
]);

const IconSearch = glyph(() => [
  h("path", { d: "m21 21-4.34-4.34" }),
  h("circle", { cx: "11", cy: "11", r: "8" })
]);

const IconX = glyph(() => [
  h("path", { d: "M18 6 6 18" }),
  h("path", { d: "m6 6 12 12" })
]);

const IconListTree = glyph(() => [
  h("path", { d: "M8 5h13" }),
  h("path", { d: "M13 12h8" }),
  h("path", { d: "M13 19h8" }),
  h("path", { d: "M3 10a2 2 0 0 0 2 2h3" }),
  h("path", { d: "M3 5v12a2 2 0 0 0 2 2h3" })
]);

/**
 * Every glyph the table chrome renders, one slot per affordance. Slots are named for the
 * `DataTableLabels` key of the same affordance where one exists (`pinStart`, `retry`,
 * `clearSelection`, …), so the two registries read as one vocabulary.
 */
export interface DataTableIcons {
  /* Header */
  sortAsc: DataTableIconComponent;
  sortDesc: DataTableIconComponent;
  /**
   * The neutral both-directions affordance an unsorted sortable column shows.
   */
  sortable: DataTableIconComponent;
  filterColumn: DataTableIconComponent;

  /* Rows — one chevron, rotated open by the stylesheet (expand-all and groups included). */
  expandRow: DataTableIconComponent;
  /**
   * The drag handle of the injected row-ordering column, and the ghost that follows a drag.
   */
  reorderRow: DataTableIconComponent;

  /* States */
  empty: DataTableIconComponent;
  noResults: DataTableIconComponent;
  error: DataTableIconComponent;
  retry: DataTableIconComponent;

  /* Global search */
  search: DataTableIconComponent;

  /* Selection */
  clearSelection: DataTableIconComponent;

  /* Columns panel */
  resetColumns: DataTableIconComponent;
  reorderColumn: DataTableIconComponent;
  /**
   * Both the group toggle and the grouped rest-state mark.
   */
  groupByColumn: DataTableIconComponent;
  pinStart: DataTableIconComponent;
  unpin: DataTableIconComponent;
  pinEnd: DataTableIconComponent;
}

export const defaultIcons: DataTableIcons = {
  sortAsc: IconChevronUp,
  sortDesc: IconChevronDown,
  sortable: IconChevronsUpDown,
  filterColumn: IconFunnel,
  expandRow: IconChevronRight,
  reorderRow: IconGripVertical,
  empty: IconInbox,
  noResults: IconSearch,
  error: IconTriangleAlert,
  retry: IconRotateCw,
  search: IconSearch,
  clearSelection: IconX,
  resetColumns: IconRotateCcw,
  reorderColumn: IconGripVertical,
  groupByColumn: IconListTree,
  pinStart: IconArrowLeftToLine,
  unpin: IconMoveHorizontal,
  pinEnd: IconArrowRightToLine
};

export function resolveIcons(icons: Partial<DataTableIcons> | undefined): DataTableIcons {
  return icons ? { ...defaultIcons, ...icons } : defaultIcons;
}
