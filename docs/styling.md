# Styling and theming

The presentation layer is ledger's own: appearance props with the familiar `Table` names for the common knobs, the Styles API for surgical control, CSS variables for the pipeline values, and data-attributes for every state. All library rules live in the `ledger` cascade layer and consume only `--ledger-*` custom properties — the design tokens are defined in the stylesheet itself, light values by default and dark values under the OS dark preference or `data-color-scheme="dark"`, so dark mode and theming need nothing from any host.

## Appearance props

Eleven `Table` appearance props keep the names and semantics they had in the React edition, and ledger renders every one of them itself:

`striped` (`boolean | "odd" | "even"`), `stripedColor`, `highlightOnHover`, `highlightOnHoverColor`, `withTableBorder`, `withColumnBorders`, `withRowBorders` (default `true`), `borderColor`, `verticalSpacing` / `horizontalSpacing` (a number of px; default: the [size](#size)'s), `tabularNums`.

The color props (`stripedColor`, `highlightOnHoverColor`, `borderColor`) take plain CSS color strings — there is no theme resolver to name colors through, and `{ dark, light }` pairs are not supported (a recorded deviation from the React edition); dark adaptation comes from setting the variable to a scheme-aware value of your own.

One more rounds the table box: **`radius`** (`number | "sm" | "md" | "lg" | "xl"` or any CSS length — a number is px, the names resolve on the classic radius scale) rounds the root and the header + body + footer frame, which clips its content to the curve — and the `withTableBorder` frame follows it, so a framed table can be its own card instead of sitting inside one. The closing line under the last row is ledger's own switch, `withBottomBorder` — see [Borders](#borders).

## Size

`size` (`LedgerSize`, default `"sm"`) sets the table's density as one word, the way `size` sizes an input: the type, the cell padding, a row's natural height and the size of every control drawn in a cell — the selection checkbox, the expander and the drag handle, the filter button, the inline editors, the pagination bar's controls — move together. Rows land on the classic input heights (30 / 36 / 42 / 50 / 60, plus the separator), so a row reads level with an input of the same size beside it; `sm` is the classic table look (7px over 14px type). Controls in a cell take the size one step down from `sm` up, and the editing contexts carry that control size as `size` ([editing.md](editing.md#editors)).

| `size` | Type | Padding (block / inline) | Row | Controls | Glyph | Injected column |
| --- | --- | --- | --- | --- | --- | --- |
| `xs` | 12px | 5px / 8px | 31px | `xs` | 12px | 36px |
| `sm` | 14px | 7px / 10px | 37px | `xs` | 14px | 40px |
| `md` | 16px | 8px / 12px | 43px | `sm` | 16px | 48px |
| `lg` | 18px | 10px / 16px | 51px | `md` | 18px | 62px |
| `xl` | 20px | 14px / 20px | 61px | `lg` | 20px | 76px |

`verticalSpacing` / `horizontalSpacing` override the size's padding when set (a number of px), and a `font-size` on the root `style` overrides its type. The type rides `--ledger-font-size` on the root, the padding rides `--ledger-cell-padding-block` / `--ledger-cell-padding-inline` on each `<table>`, the row height is the virtualizer's default estimate ([virtualization.md](virtualization.md)), and the injected columns' width follows the size unless an override sets bounds of its own ([sizing.md](sizing.md)). An application sets its default through a wrapper component of its own — see [App-wide defaults](#app-wide-defaults).

All the border and background props are rendered by ledger itself:

- Stripes and hover flow through the row-background pipeline (below) instead of `:nth-of-type` rules — virtualization spacer rows would break parity, and pinned cells must cover the tint.
- `withTableBorder` draws its frame on the `main` region so it wraps the (separately rendered) header, body, and footer as one box and stays at the viewport edge under horizontal scroll — four real borders, so `radius` draws continuous corners (see [Borders](#borders)).
- `withRowBorders` / `withColumnBorders` become root data-attributes and paint at **cell level** in ledger's layer: the tables are `border-collapse: separate` (inline — a host's unlayered `collapse` would win otherwise), because Chrome does not repaint collapsed borders at stuck sticky positions — cell-level borders travel with pinned rows and columns.

### Borders

Three edges, one line each — and a ledger-owned switch for the middle one, shaped like its `Table` family:

- **Row separators** (`withRowBorders`, default `true`) sit *between* rows: the header's bottom edge and every body row except the last — the classic `Table` rule, so a table inside a bordered container closes with the container's edge instead of doubling it. The last row carries `data-last`; a `spanRows` run that reaches it marks its anchor cell `data-last` too.
- **The closing line** (`withBottomBorder`, default `false`) is for a table that stands alone: an inset 1px seam on the scroller's last pixel (it adds no height and stays put under scroll) and, with a footer, the footer's trailing edge as well.
- **The frame** (`withTableBorder`) is four real borders around `main`, so `radius` draws continuous corners; it owns every edge, and under it the closing seam and the footer's trailing line stay off whatever `withBottomBorder` says.

A footer always separates from the body with the same seam above it while row borders are on (`data-with-footer` on the root). The pagination bar draws its own top line only when no other edge exists — no frame and no closing line.

## The Styles API

`classNames`, `styles`, `className`, `style`, and `attributes` are the five channels, resolved in one pure function (`get-styles.ts`) and provided to the whole rendered tree under an injection key; the static selector-to-class map ships as `DataTable.classes`. Selectors map 1:1 to kebab-case classes under the `ledger-` prefix:

| Selector | Class | Element |
| --- | --- | --- |
| `root` | `.ledger-root` | The outer flex column |
| `main` | `.ledger-main` | The header + body frame (ARIA table; carries the `withTableBorder` border) |
| `header` | `.ledger-header` | The header viewport — mirrors the body's horizontal scroll |
| `scroller` | `.ledger-scroller` | The body scroll area — the only elastic region |
| `footer` | `.ledger-footer` | The totals viewport below the scroller — mirrors the body's horizontal scroll |
| `table` | `.ledger-table` | Every `<table>` element (header, body, and footer tables) |
| `thead` / `tbody` / `tfoot` | `.ledger-thead` … | Table sections |
| `headerRow` / `headerCell` | `.ledger-header-row` / `.ledger-header-cell` | Header rows and `<th>`s |
| `headerLabel` | `.ledger-header-label` | The (sortable) label button |
| `headerActions` | `.ledger-header-actions` | The hover-revealed action cluster |
| `sortIndicator` | `.ledger-sort-indicator` | Chevron + multi-sort badge |
| `resizer` | `.ledger-resizer` | The resize handle |
| `filterPopover` | `.ledger-filter-popover` | The filter trigger and its dropdown surface |
| `row` / `cell` | `.ledger-row` / `.ledger-cell` | Data rows and `<td>`s |
| `selectionCell` / `expanderCell` | `.ledger-selection-cell` / `.ledger-expander-cell` | Injected column cells |
| `detailPanel` | `.ledger-detail-panel` | Master–detail panel cell |
| `cellEditor` | `.ledger-cell-editor` | Inline editor host |
| `instantCell` / `instantSpinner` | `.ledger-instant-cell` / `.ledger-instant-spinner` | Instant-column host, and its out-of-flow pending loader |
| `rowDragCell` / `rowDragOverlay` | `.ledger-row-drag-cell` / `.ledger-row-drag-overlay` | Row-ordering handle cell, and the pointer ghost (a snapshot of the whole lifted row) |
| `footerRow` / `footerCell` | `.ledger-footer-row` / `.ledger-footer-cell` | Totals row |
| `empty` | `.ledger-empty` | The empty / error state block |
| `loaderRow` / `loaderRowContent` | `.ledger-loader-row` / `.ledger-loader-row-content` | Infinite-loading trailing row, and the centred flex line inside its cell |
| `paginationBar` | `.ledger-pagination-bar` | The built-in bar (and the standalone compound) |

```vue
<DataTable
  :class-names="{ headerCell: 'my-header' }"
  :styles="{ empty: { minHeight: '8rem' } }"
  …
/>
```

The merge order is fixed: `class` is the static class, then the call's own class, then your `classNames[selector]` — and on the root only, your `className` prop, which always lands on the root element; `style` is the call's own values (CSS variables, geometry) first, then your `styles[selector]`, then — root only — your `style` prop, so an author can always win. `attributes` passes through onto every element of the slot it resolves for. The resolver runs inside one `computed` behind a stable provided getter, so every channel reaches the rows — virtualized rows included — as soon as what it resolves to changes.

## DOM props

The Styles API dresses a **slot**: `attributes` reaches every element of that slot with one resolved answer, so it cannot vary from row to row, and it is resolved from the component's props rather than from the element's own subject. That is what the DOM prop hooks are for — one per rendered element, each taking a static object or a function of the element's subject, and each merged over the Styles API's answer under the rules below:

| Prop | Element | Subject |
| --- | --- | --- |
| `rowProps` | every data `<tr>` | `Row<TData>` |
| `headerRowProps` / `footerRowProps` | every header / footer `<tr>` | `HeaderGroup<TData>` |
| `viewportProps` | the internal scroll viewport | — (static only) |
| `meta.cellProps` | that column's `<td>`s | `Cell<TData, TValue>` |
| `meta.headerCellProps` / `meta.footerCellProps` | that column's header / footer cell | `Header<TData, TValue>` |

```vue
<DataTable
  :row-props="row => ({
    'data-overdue': row.original.overdue || undefined,
    'title': row.original.note,
    'onMouseenter': () => prefetch(row.original.id)
  })"
  :viewport-props="{ onScroll: event => syncMinimap(event.currentTarget.scrollTop) }"
  :columns="[
    {
      accessorKey: 'amount',
      meta: { cellProps: cell => ({ style: { color: cell.getValue<number>() < 0 ? 'red' : undefined } }) }
    }
  ]"
  …
/>
```

The props bind to their element through `v-bind`, and the types are Vue's own attribute families — `LedgerTrProps` (`HTMLAttributes`) for rows, `LedgerTdProps` / `LedgerThProps` (`TdHTMLAttributes` / `ThHTMLAttributes`) for cells — so plain DOM attributes, inline styles, and handlers ride alongside `data-*` and `aria-*` keys. Four composition rules:

- **ledger's structural props win** — `role`, the `data-*` state contract below, and the ARIA indices. They are the contract the stylesheet and the accessibility tree are written against.
- **…but only where ledger sets one.** Where ledger has no opinion (a cell's `onClick` when the edit trigger is `double-click`, say) your value stands.
- **`class` and `style` compose**, yours last — an equal-specificity rule of yours wins. That includes ledger's own inline values: you *can* override a pinned cell's sticky offset, and the result is yours to own. An escape hatch that silently dropped your declaration would not be one.
- **Handlers chain**, ledger's first: its stop-propagation covenant and active-row bookkeeping run before your handler sees the event.

`ref` is excluded from all of them: these are prop hooks resolved per render — per virtual item, for rows — not component instances, and ledger owns the row ref for virtualization measurement. Synthetic rows (detail panels, loader and skeleton rows) have no subject and never receive `rowProps`.

## State is data-attributes, never state classes

Style states by attribute selector, never a state class. The inventory:

| Element | Attributes |
| --- | --- |
| root | `data-size="xs" \| "sm" \| "md" \| "lg" \| "xl"`, `data-striped="odd" \| "even"`, `data-highlight-on-hover`, `data-loading`, `data-empty`, `data-error`, `data-color-scheme="light" \| "dark"` (the `colorScheme` prop), `data-virtualized-rows`, `data-virtualized-columns`, `data-with-table-border`, `data-with-row-borders`, `data-with-column-borders`, `data-with-bottom-border`, `data-with-footer`, `data-scrolled-start`, `data-scrolled-end` |
| the synced tables | `data-tabular-nums` (the `tabularNums` prop — digits columnate across header, body and footer) |
| header cell | `data-align`, `data-sortable`, `data-sorted` (on the indicator), `data-pinned="start" \| "end"`, `data-pinned-edge`, `data-resizing`, `data-dragging`, `data-drop-side="before" \| "after"` |
| row | `data-selected`, `data-active` (the keyboard-cursor row), `data-expanded`, `data-clickable`, `data-parity="odd" \| "even"`, `data-pinned-row="top" \| "bottom"`, `data-row-id`, `data-detail-row`, `data-last` (the body's final row), `data-editing-row` (row-mode editing), `data-dragging` (a reorder lifted it), `data-drop-side="before" \| "after"` (the reorder drop edge) |
| cell | `data-align`, `data-editable`, `data-editing`, `data-last` (a `spanRows` anchor ending on the last row), `data-leading` (its column is first in display order — DOM order cannot say so once `spanRows` drops covered cells), `data-pinned`, `data-pinned-edge`, `data-truncate` (inner span), `data-group-cell` / `data-group-count` (grouped), `data-ledger-column-id` |
| editor | `data-pending` |

```css
.my-app .ledger-row[data-selected] .ledger-cell { font-weight: 600; }
```

## CSS custom properties

| Variable | Written by | Purpose |
| --- | --- | --- |
| `--ledger-row-bg` | stripe / hover / selected / active rules | The single row-background pipeline, painted on the row's **cells** (a row-level paint would lose to an unlayered host `tr` background); pinned cells read `--ledger-pinned-bg`, which follows it — a pinned column that fails to cover stripes or hover is unrepresentable |
| `--ledger-striped-color`, `--ledger-hover-color` | `stripedColor` / `highlightOnHoverColor` props (or your `styles` / `style`) | Tint overrides; default to `--ledger-color-default-hover` |
| `--ledger-header-bg` | you, in CSS (see below) | Header cell background; defaults to `--ledger-color-body`. Opaque by contract, not by decoration — a pinned header cell has to occlude the cells scrolling under it |
| `--ledger-border-color` | `borderColor` prop (or your `styles` / `style`) | Every ledger-painted line: the `withTableBorder` frame, row/column borders, and the seam overlays; defaults to `--ledger-color-default-border` |
| `--ledger-radius` | `radius` prop (or your `styles` / `style`) | The table box's corner radius, on the root and on the `main` frame (which clips to it); defaults to `0` |
| `--ledger-font-size` | `size` prop (or your `styles` / `style`) | The table's type, set on the root so every table under it inherits it ([Size](#size)) |
| `--ledger-cell-padding-block` / `--ledger-cell-padding-inline` | the `size` scale, or `verticalSpacing` / `horizontalSpacing` | Cell padding, written on each `<table>` and consumed by the base `th`/`td` rule |
| `--ledger-col-width-<id>`, `--ledger-col-start-<id>`, `--ledger-col-after-<id>` | column geometry | Width and pinned offsets per column; disjoint prefixes prevent one family from shadowing another, and resizing never re-renders rows |

The column-variable `<id>` suffix is a collision-free CSS-safe encoding, not necessarily the raw
column id: ASCII letters, digits, and hyphens stay readable, while punctuation and Unicode code
points are escaped.

The five variables a prop also writes — `--ledger-striped-color`, `--ledger-hover-color`,
`--ledger-border-color`, `--ledger-radius`, `--ledger-font-size` — can be set just as well
through the Styles API, which merges after the component's own values:

```vue
<DataTable
  :style="{ '--ledger-striped-color': 'var(--ledger-color-gray-light)' }"
  …
/>
```

Row-background precedence (last wins within the layer): stripe → hover → selected / active →
those two states' own hover step → the active row inside a selection → the editing row; a pinned
row holds the body color.

### Tinting the header

The header ships untinted, following the classic `<thead>`. `--ledger-header-bg` is the one
consumer-writable variable with no prop behind it — set it in CSS. The palette's only
"one step off the body" token, `--ledger-color-default-hover`, is already what stripes and hover
resolve to, so reusing it would make the header match its own odd rows. Use
`--ledger-color-gray-light`, which is defined for both schemes:

```css
.app-table { --ledger-header-bg: var(--ledger-color-gray-light); }
```

A single fixed value is the trap here — `--ledger-header-bg: #f8f9fa` reads as a blown-out white
band in dark mode.

## Icons

Every glyph the chrome renders — sort and filter indicators, the expander chevron, the pin
segments, the empty/error states — comes from one registry, `DataTableIcons`, one slot per
affordance ([api.md](api.md#icons) lists them all). The defaults are Lucide glyphs with their
path data vendored into the package, so replacing none costs no dependency; `icons` replaces any
subset:

```vue
<script setup lang="ts">
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-vue-next";

import { DataTable } from "@jujiuyey/ledger-vue";
</script>

<template>
  <DataTable
    :icons="{ sortAsc: ArrowUpNarrowWide, sortDesc: ArrowDownWideNarrow }"
    …
  />
</template>
```

A slot is any component accepting `DataTableIconProps` — `size` (12–16 in the controls, 40 in
the empty/error indicators) and `strokeWidth` — rendered with `h(icon, { size })`, which
`lucide-vue-next` components satisfy as-is; so does any icon set or hand-rolled `<svg>`
component that follows `currentColor`. Slot names mirror the `DataTableLabels` key of the same
affordance where one exists (`pinStart`, `retry`, `clearSelection`, …), so the two registries
read as one vocabulary.

The compound components rendered outside the table's tree take their own `icons` prop, exactly
like `labels`: `DataTableSearch` (`search`), `DataTableColumnsPanel` (the panel slots),
`DataTableSelectionBar` (`clearSelection`) — named exports in templates (the dot-spelled
statics `DataTable.Search` & co. exist on the `DataTable` object, but dot notation is not
resolvable in Vue templates). App-wide replacement goes through your wrapper — the next
section's mechanism.

One behavioral contract: the `expandRow` chevron is rotated open by the stylesheet (a `rotate`
on the button's `svg`), so a replacement should point right at rest.

## App-wide defaults

There is no theme object and no provider to feed defaults through — an application's defaults
are a wrapper component of its own around `<DataTable>` (and the compounds it uses), the
wrapper's own props becoming the defaults ([getting-started.md](getting-started.md)):

```vue
<script setup lang="ts">
import { DataTable, zhCN } from "@jujiuyey/ledger-vue";
</script>

<template>
  <DataTable
    highlight-on-hover
    :labels="zhCN"
    class-name="app-table"
    v-bind="$attrs"
  />
</template>
```

The compound components (`DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`,
`DataTableSelectionBar`) take their own `labels` and `icons` props — route them through the same
wrapper.

Those rendered outside the table's tree sit outside its Styles API and carry static classes instead, styleable directly: `.ledger-pagination-bar`, `.ledger-selection-bar`, and the columns panel's `.ledger-columns-panel` — with `-header`, `-list`, `-zone`, `-zone-label`, `-item`, `-handle`, `-label`, `-indicators` (the dimmed rest-state marks), `-controls` (the toolbar revealed on the hovered/focused row), and `-width-input` (the width field on a resizable row); the row being dragged carries `data-dragging`, a hidden column's row `data-hidden`.

## Layering, dark mode, RTL, motion

- Everything ships inside `@layer ledger`; cross-library layer order is the application's call (declare `@layer ledger` among your own layers up front if you need to arbitrate).
- Colors and metrics are the self-defined `--ledger-*` design tokens at the top of `styles.css` → dark mode is automatic: light values by default, dark values under the OS preference, under `data-color-scheme="dark"` (on the document element, or on one table — which is what the `colorScheme` prop writes on its root). Theming is overriding those tokens on any ancestor.
- Offsets and gradients use logical properties with explicit `[dir="rtl"]` mirrors for the pinned-edge shadows → RTL is automatic.
- Chevron rotations and columns-panel reveals respect `prefers-reduced-motion: reduce`; on devices
  without hover, columns-panel controls stay inline and clickable instead of relying on a reveal.

The kebab-case class contract is enforced mechanically by `@coldsmirk/stylelint-config` in CI — it does not rely on discipline.
