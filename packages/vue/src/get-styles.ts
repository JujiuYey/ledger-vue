import type { CSSProperties, InjectionKey } from "vue";
import { inject, provide } from "vue";

import clsx from "clsx";

/**
 * The Styles API (docs/styling.md), Vue edition. Mantine's `useStyles` machinery — theme,
 * vars resolvers, the styles-revision refreeze — does not exist here; what remains is the
 * contract the stylesheet and consumers depend on: the static kebab-case class per selector,
 * the consumer's `classNames` / `styles` overrides, and the root's `className` / `style` /
 * `attributes` props, merged with Mantine's precedence in one small pure function.
 *
 * (`useStylesRevision` exists only to defeat React re-render cascades — no Vue counterpart,
 * a recorded deviation. The getter identity is stable for as long as its inputs are.)
 */

export type DataTableStylesNames
  = | "root"
    | "main"
    | "header"
    | "scroller"
    | "footer"
    | "table"
    | "thead"
    | "tbody"
    | "tfoot"
    | "headerRow"
    | "headerCell"
    | "headerLabel"
    | "headerActions"
    | "sortIndicator"
    | "resizer"
    | "filterPopover"
    | "row"
    | "cell"
    | "selectionCell"
    | "expanderCell"
    | "detailPanel"
    | "cellEditor"
    | "instantCell"
    | "instantSpinner"
    | "rowDragCell"
    | "rowDragOverlay"
    | "footerRow"
    | "footerCell"
    | "empty"
    | "loaderRow"
    | "loaderRowContent"
    | "paginationBar";

export interface DataTableCssVariables {
  root:
    | "--ledger-striped-color"
    | "--ledger-hover-color"
    | "--ledger-border-color"
    | "--ledger-radius"
    | "--ledger-font-size";
}

/**
 * Static kebab-case classes — the styling contract's public selector map (docs/styling.md).
 */
export const dataTableClasses: Record<DataTableStylesNames, string> = {
  root: "ledger-root",
  main: "ledger-main",
  header: "ledger-header",
  scroller: "ledger-scroller",
  footer: "ledger-footer",
  table: "ledger-table",
  thead: "ledger-thead",
  tbody: "ledger-tbody",
  tfoot: "ledger-tfoot",
  headerRow: "ledger-header-row",
  headerCell: "ledger-header-cell",
  headerLabel: "ledger-header-label",
  headerActions: "ledger-header-actions",
  sortIndicator: "ledger-sort-indicator",
  resizer: "ledger-resizer",
  filterPopover: "ledger-filter-popover",
  row: "ledger-row",
  cell: "ledger-cell",
  selectionCell: "ledger-selection-cell",
  expanderCell: "ledger-expander-cell",
  detailPanel: "ledger-detail-panel",
  cellEditor: "ledger-cell-editor",
  instantCell: "ledger-instant-cell",
  instantSpinner: "ledger-instant-spinner",
  rowDragCell: "ledger-row-drag-cell",
  rowDragOverlay: "ledger-row-drag-overlay",
  footerRow: "ledger-footer-row",
  footerCell: "ledger-footer-cell",
  empty: "ledger-empty",
  loaderRow: "ledger-loader-row",
  loaderRowContent: "ledger-loader-row-content",
  paginationBar: "ledger-pagination-bar"
};

/**
 * Per-call extras — the style/className a call site composes in (the pinned cell's sticky
 * offset, the root's column variables), plus any other props the caller wants carried
 * (attributes handlers included). The style accepts Vue's `CSSProperties` (what `pinning.ts`
 * hands back) or a plain record.
 */
export interface GetStylesOptions {
  style?: CSSProperties | Record<string, string | number | undefined>;
  className?: string;
  [key: string]: unknown;
}

/**
 * What a call resolves to: spread through `v-bind`. `class` / `style` compose with anything
 * merged around them; every other key passes through (attributes, `data-*` state).
 */
export type GetStylesResult = {
  class: string | undefined;
  style: Record<string, string | number | undefined> | undefined;
} & Record<string, unknown>;

export interface GetStylesProps {
  classNames?: Partial<Record<DataTableStylesNames, string>>;
  styles?: Partial<Record<DataTableStylesNames, Partial<CSSStyleDeclaration>>>;
  className?: string;
  style?: Record<string, string | number | undefined>;
  attributes?: Record<string, string | number | boolean>;
}

export type GetStyles = (selector: DataTableStylesNames, options?: GetStylesOptions) => GetStylesResult;

/**
 * Mantine's Styles API merge semantics, in one pure function:
 *
 * - `class`: the static kebab-case class, then the call's own `className`, then the
 *   consumer's `classNames[selector]` — and on the root only, the consumer's `className`
 *   prop, which always lands on the root element;
 * - `style`: the call's own style (CSS variables, geometry) first, then the consumer's
 *   `styles[selector]` override, then — root only — the consumer's `style` prop, so an
 *   author can always win;
 * - `attributes` pass through onto every element they are spread onto (`data-*` state,
 *   handlers included).
 */
export function createGetStyles({
  classNames,
  styles,
  className,
  style,
  attributes
}: GetStylesProps): GetStyles {
  return (selector, options) => {
    const result: Record<string, unknown> = { ...attributes };

    const cssClass = clsx(
      dataTableClasses[selector],
      options?.className,
      classNames?.[selector],
      selector === "root" ? className : undefined
    );
    result.class = cssClass === "" ? undefined : cssClass;

    const mergedStyle: Record<string, string | number | undefined> = {
      ...options?.style,
      ...(styles?.[selector] as Record<string, string | number | undefined> | undefined),
      ...(selector === "root" ? style : undefined)
    } as Record<string, string | number | undefined>;
    result.style = Object.keys(mergedStyle).length > 0 ? mergedStyle : undefined;

    return result as GetStylesResult;
  };
}

/**
 * How the resolved getter reaches the parts the context does not carry (the render context
 * deliberately has no `getStyles` field — the React edition's context did): the root provides
 * its consumer-resolved getter under this key, and every rendered part injects it. Standalone
 * use outside a table falls back to the static classes only.
 */
const GetStylesKey: InjectionKey<GetStyles> = Symbol("LedgerGetStyles");

export function provideGetStyles(value: GetStyles): void {
  provide(GetStylesKey, value);
}

export function useGetStyles(): GetStyles {
  // A function default would be handed back as-is by `inject`, so the fallback resolves eagerly.
  return inject<GetStyles | null>(GetStylesKey, null) ?? createGetStyles({});
}
