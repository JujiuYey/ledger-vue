import type { RowData } from "@tanstack/vue-table";
import type { Component, CSSProperties, PropType } from "vue";

import type { DataTableLabels } from "./labels";
import type { LedgerSize } from "./size";
import type { TableInstance } from "./types";
import { computed, defineComponent, h, useId } from "vue";
import clsx from "clsx";

import { LedgerButton, LedgerSelect, svgGlyph } from "./controls";
import { useDataTableContext } from "./context";
import { resolveLabels } from "./labels";
import { SIZES } from "./size";

/**
 * The pagination bar: summary on the start side, rows-per-page and page controls on the end side.
 * One core rendering, two skins — the built-in bar (inside <DataTable>, reading the table's own
 * `size` through the context) and the standalone `DataTablePagination` compound for custom
 * placement. TanStack's 0-based `pageIndex` converts to the pagination control's 1-based `value`
 * here and nowhere else.
 */
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* The control's own glyphs. The registry carries the chrome's swappable affordances; the pager's
   chevrons are its anatomy (the React edition took them from Mantine's Pagination the same way). */
const IconChevronLeft = svgGlyph(() => [h("path", { d: "m15 18-6-6 6-6" })]);
const IconChevronRight = svgGlyph(() => [h("path", { d: "m9 18 6-6-6-6" })]);
const IconChevronsLeft = svgGlyph(() => [h("path", { d: "m11 17-5-5 5-5" }), h("path", { d: "m18 17-5-5 5-5" })]);
const IconChevronsRight = svgGlyph(() => [h("path", { d: "m6 17 5-5-5-5" }), h("path", { d: "m13 17 5-5-5-5" })]);

export interface PaginationBarCoreProps<TData extends RowData> {
  table: TableInstance<TData>;
  labels: DataTableLabels;
  pageSizeOptions: number[];
  /**
   * The table's size: the words at its type, the controls at its control size (`size.ts`).
   */
  size: LedgerSize;
  className?: string;
  style?: CSSProperties;
}

const PaginationBarCore = defineComponent({
  name: "PaginationBarCore",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    labels: { type: Object as PropType<DataTableLabels>, required: true },
    pageSizeOptions: { type: Array as PropType<number[]>, required: true },
    size: { type: String as PropType<LedgerSize>, required: true },
    className: { type: String, default: undefined },
    style: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props) {
    const pageSizeLabelId = useId();
    const pagination = computed(() => props.table.atoms.pagination.get());
    // `options.rowCount` (server mode) wins inside TanStack; client mode counts pre-paginated rows.
    const total = computed(() => props.table.getRowCount());
    const pageCount = computed(() => Math.max(1, props.table.getPageCount()));
    // The size on screen is always offerable, whoever set it: a controlled `pagination` (or a
    // persisted one) may hold a size the author never listed, and a select whose value is absent
    // from its options renders blank. Always de-duplicated and ascending, so the list a reader
    // sees does not depend on how the current size got there.
    const sizeOptions = computed(() =>
      [...new Set([...props.pageSizeOptions, pagination.value.pageSize])].sort((left: number, right: number) => left - right)
    );

    return () => {
      const { pageIndex, pageSize } = pagination.value;
      const from = total.value === 0 ? 0 : pageIndex * pageSize + 1;
      const to = Math.min(total.value, (pageIndex + 1) * pageSize);
      const controlSize = SIZES[props.size].control;

      return h(
        "div",
        { class: props.className, style: props.style, "data-size": props.size },
        [
          h("span", { class: "ledger-pagination-summary" }, props.labels.paginationSummary(from, to, total.value)),

          h("div", { class: "ledger-pagination-side" }, [
            h("div", { class: "ledger-pagination-group" }, [
              // The visible text IS the label — pointing at it beats duplicating it into an
              // aria-label, which would let the two drift apart (WCAG 2.5.3, label in name).
              h("span", { key: "label", id: pageSizeLabelId, class: "ledger-pagination-caption" }, props.labels.rowsPerPage),

              h(LedgerSelect, {
                ariaLabelledby: pageSizeLabelId,
                modelValue: String(pageSize),
                options: sizeOptions.value.map(String),
                size: controlSize,
                style: { width: "84px" },
                "onUpdate:modelValue": (value: string | null) => value !== null && props.table.setPageSize(Number(value))
              })
            ]),

            h(LedgerPagination, {
              size: controlSize,
              total: pageCount.value,
              value: pageIndex + 1,
              "onUpdate:value": page => props.table.setPageIndex(page - 1)
            })
          ])
        ]
      );
    };
  }
});

/**
 * The page control: edge (first/last) and step (previous/next) buttons around the compact range
 * of page numbers — the shape Mantine's Pagination drew, with its `siblings: 1` / `boundaries: 1`
 * defaults. `value` is 1-based.
 */
const DOTS = "dots";

function numberRange(start: number, end: number): number[] {
  const length = Math.max(0, end - start + 1);

  return Array.from({ length }, (_unused, index) => index + start);
}

function getRange(current: number, total: number): Array<number | typeof DOTS> {
  const siblings = 1;
  const boundaries = 1;
  const totalPageNumbers = siblings * 2 + 3 + boundaries * 2;

  if (totalPageNumbers >= total) {
    return numberRange(1, total);
  }

  const leftSiblingIndex = Math.max(current - siblings, boundaries + 1);
  const rightSiblingIndex = Math.min(current + siblings, total - boundaries);
  const showLeftDots = leftSiblingIndex > boundaries + 2;
  const showRightDots = rightSiblingIndex < total - boundaries - 1;

  if (!showLeftDots && showRightDots) {
    return [...numberRange(1, boundaries + siblings * 2 + 2), DOTS, total];
  }

  if (showLeftDots && !showRightDots) {
    return [1, DOTS, ...numberRange(total - (boundaries + siblings * 2 + 2) + 1, total)];
  }

  return [1, DOTS, ...numberRange(leftSiblingIndex, rightSiblingIndex), DOTS, total];
}

const LedgerPagination = defineComponent({
  name: "LedgerPagination",
  props: {
    total: { type: Number, required: true },
    value: { type: Number, required: true },
    size: { type: String as PropType<LedgerSize>, required: true }
  },
  emits: {
    "update:value": (_page: number) => true
  },
  setup(props, { emit }) {
    const navigate = (page: number) => {
      if (page >= 1 && page <= props.total && page !== props.value) {
        emit("update:value", page);
      }
    };

    // The pager's navigation names are control anatomy, the same English defaults Mantine's
    // Pagination carried in the React edition (which took them from its own package, not the
    // labels registry); the page numbers name themselves.
    const edgeButton = (glyph: Component, label: string, page: number, disabled: boolean) =>
      h(LedgerButton, {
        class: "ledger-pagination-edge",
        variant: "subtle",
        size: props.size,
        disabled,
        ariaLabel: label,
        onClick: () => navigate(page)
      }, { default: () => h(glyph) });

    return () =>
      h("div", { class: "ledger-pagination-pages", "data-size": props.size, role: "group" }, [
        edgeButton(IconChevronsLeft, "First page", 1, props.value === 1),
        edgeButton(IconChevronLeft, "Previous page", props.value - 1, props.value === 1),

        getRange(props.value, props.total).map(item =>
          item === DOTS
            ? h("span", { key: "dots", class: "ledger-pagination-dots", "aria-hidden": true }, "…")
            : h(
                LedgerButton,
                {
                  key: item,
                  class: "ledger-pagination-page",
                  variant: item === props.value ? "light" : "subtle",
                  size: props.size,
                  "aria-current": item === props.value ? "page" : undefined,
                  onClick: () => navigate(item)
                },
                { default: () => String(item) }
              )
        ),

        edgeButton(IconChevronRight, "Next page", props.value + 1, props.value === props.total),
        edgeButton(IconChevronsRight, "Last page", props.total, props.value === props.total)
      ]);
  }
});

/**
 * The built-in bar rendered by <DataTable> (context-styled).
 */
export const PaginationBar = defineComponent({
  name: "PaginationBar",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    pageSizeOptions: { type: Array as PropType<number[]>, required: true }
  },
  setup(props) {
    const { labels, size } = useDataTableContext();

    return () =>
      h(PaginationBarCore, {
        className: "ledger-pagination-bar",
        labels,
        pageSizeOptions: props.pageSizeOptions,
        size,
        table: props.table
      });
  }
});

export interface DataTablePaginationProps<TData extends RowData> {
  table: TableInstance<TData>;
  pageSizeOptions?: number[];
  labels?: Partial<DataTableLabels>;
  /**
   * The size of the table the bar stands under (docs/styling.md#size); `sm`, the table's own
   * default, unless said.
   */
  size?: LedgerSize;
  className?: string;
  style?: CSSProperties;
}

const paginationDefaultProps = { size: "sm" as const };

/**
 * Standalone compound — place it anywhere, theme it via defaultProps.
 */
export const DataTablePagination = defineComponent({
  name: "DataTablePagination",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    pageSizeOptions: { type: Array as PropType<number[]>, default: () => DEFAULT_PAGE_SIZE_OPTIONS },
    labels: { type: Object as PropType<Partial<DataTableLabels>>, default: undefined },
    size: { type: String as PropType<LedgerSize>, default: paginationDefaultProps.size },
    className: { type: String, default: undefined },
    style: { type: Object as PropType<CSSProperties>, default: undefined }
  },
  setup(props) {
    return () =>
      h(PaginationBarCore, {
        className: clsx("ledger-pagination-bar", props.className),
        labels: resolveLabels(props.labels),
        pageSizeOptions: props.pageSizeOptions,
        size: props.size,
        style: props.style,
        table: props.table
      });
  }
});
