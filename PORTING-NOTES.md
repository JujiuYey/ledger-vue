# Porting notes — the Vue edition conventions

**Read this before touching anything.** This repository is the Vue port of the React package
`@coldsmirk/ledger-mantine` (source of truth: `/Users/jujiuyey/Projects/ledger/packages/mantine/src`).
The React source is the SPEC: read the corresponding file there before porting, keep its
structure, comments, and naming, and adapt only where these notes say so. All text in the repo
is English. Single-line Conventional Commits.

## What already exists (foundation — do NOT rewrite)

`env.ts`, `utils.ts`, `labels.ts`, `locales.ts`, `csv.ts`, `filter-fns.ts`, `element-props.ts`,
`data-attributes.ts`, `size.ts`, `ledger-commands.ts`, `toggle-fns.ts`, `ledger-features.ts`,
`icons.ts`, `types.ts`, `use-slice.ts`, `context.ts`, `use-data-table.ts`, `build-columns.ts`,
`styles.css`, plus `package.json` / `vite.config.ts` / workspace configs.

## The React → Vue mapping (the whole doctrine, short)

1. **Imports**: `@tanstack/react-table` → `@tanstack/vue-table` (it re-exports all of
   table-core: `functionalUpdate`, `tableFeatures`, filter/sort/aggregation fns, row-model
   factories, every type). `@tanstack/react-virtual` → `@tanstack/vue-virtual`.
2. **Types**: `ReactNode` → `VueContent` (`VNodeChild`, from `./types`). React DOM prop types →
   Vue's `HTMLAttributes` families from `"vue"` (`TdHTMLAttributes<HTMLTableCellElement>` etc.;
   the ledger aliases `LedgerTdProps` / `LedgerThProps` / `LedgerTrProps` live in types.ts).
   `MantineSize` → `LedgerSize` (from `./size`). `MantineBreakpoint` → the string union
   `"xs" | "sm" | "md" | "lg" | "xl"`.
3. **Components**: SFCs with `<script setup lang="ts" generic="TData extends RowData">` when the
   component needs the data generic; plain `defineComponent`/functional `h()` components for
   tiny internal pieces. File naming: `data-table.vue` for SFCs, `.ts` for composables and
   render helpers (React `.tsx` component files that become non-SFC render functions stay `.ts`).
4. **Hooks → composables**: `useFoo` stays `useFoo` in a `.ts` file, called once in setup.
   React re-render inputs become `ReactiveInput<T>` (ref/getter/plain, `toValue()` to read);
   refs and `computed()` replace `useMemo`+deps; `watch(..., { flush: "post" })` replaces
   commit-phase effects; `onScopeDispose`/`onUnmounted` replace effect cleanups.
   `useEventCallback` has NO equivalent and NO replacement — Vue handlers are just stable
   closures defined in setup.
5. **State slices**: `useSlice` (exists) returns `[ref, setter]`. Controlled slices read their
   prop through a getter; `v-model:x` on `<DataTable>` maps to `x` + `@update:x`.
6. **Context**: `provideDataTableContext` / `useDataTableContext` (exists, in `context.ts`) —
   the exact field set of the React `DataTableContextValue` minus `getStyles` (dropped: see 8).
7. **TanStack instance reads**: components read reactive state through
   `table.atoms.<slice>.get()` INSIDE `computed()`/templates (the adapter's Vue atoms), or
   plain reads inside render functions. `flexRender` comes from `@tanstack/vue-table` and is
   used via `h(() => flexRender(renderer, ctx))` or inside render functions directly.
8. **Styles API**: the React `getStyles`/`useStyles`/Styles-Api machinery is REPLACED by a
   small helper `src/get-styles.ts`: `getStyles(selector, options?)` returns
   `{ class: string, style?: ... }` merging the static class map (same kebab-case classes),
   consumer `classNames`/`styles` props, and `vars`. Own it in ONE place; Agent B writes it
   per the React `classes` map in data-table.tsx. The `useStylesRevision` refreeze exists only
   to defeat React re-render cascades — no Vue counterpart, omitted (recorded deviation).
9. **CSS**: `styles.css` is THE stylesheet, all in `@layer ledger`, kebab-case classes under
   `ledger-`, state via data-attributes, tokens via `--ledger-*` (now self-defined at the top of
   the file — light values plus `[data-color-scheme="dark"]` / `prefers-color-scheme` dark
   overrides). All former `var(--mantine-x)` reads are already renamed to `var(--ledger-x)`.
   Cell padding: the component writes `--ledger-cell-padding-block/inline` inline on each
   `<table>` from the size scale; the stylesheet consumes them.
   **Only the agent that owns chrome controls (E) appends to styles.css.** Others collect needed
   additions and report them in the final message.
10. **Chrome controls**: no Mantine. Small internal controls live in `src/controls.ts`:
    `LedgerButton`, `LedgerCheckbox`, `LedgerTextInput`, `LedgerSelect`, `LedgerNumberInput`,
    `LedgerPopover` (positioned, outside-click + Escape close), `LedgerSpinner` — styled with
    new kebab classes (`ledger-button`, `ledger-checkbox`, …) that Agent E adds to styles.css.
    Lucide-glyph registry is `icons.ts` (exists): render via `h(icon, { size })`.
11. **dnd**: `@dnd-kit/dom` is framework-agnostic (no React needed) — row and column reorder
    port against it directly, mirroring the React usage.
12. **Testing**: Vitest + `@vue/test-utils` + `@testing-library/vue` (both available), jsdom;
    specs colocated `<name>.test.ts(x)`; render under `app = mount(...)`, and wrap state
    assertions after `await nextTick()` / `await wrapper.vm.$nextTick()`.

## Known deviations (already decided — record, don't relitigate)

- `DataTable.Search` dot-notation is impossible in Vue templates → named exports
  `DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`, `DataTableSelectionBar`
  (also attached as static properties on the `DataTable` object for parity:
  `DataTable.Search = DataTableSearch` works at runtime; document the named imports).
- React's concurrent-rendering defenses (`useCommittedTable` tearing guards, `useSlice`
  requested-value bookkeeping, `useStylesRevision`) are simplified to their Vue-necessary
  invariant; the modules keep the same names and public shapes.
- `getStyles` has no Mantine theme resolution; color props (`stripedColor`, `borderColor`,
  `radius`) resolve from the same value forms (CSS color strings, or `{ dark, light }` pairs
  are NOT supported — plain CSS values only) into root CSS vars.
- Controlled callbacks: unchanged — setters resolve updaters and call `onXChange(resolved)`.
- `colorScheme?: "light" | "dark"` prop on `<DataTable>` renders `data-color-scheme` on the
  root (defaults to following the OS).

## File → agent ownership (do not edit files you don't own)

- A (logic): `persist.ts`, `edit-meta.ts`, `use-committed-table.ts`, `use-row-commands.ts`,
  `use-responsive-columns.ts`, `use-pinned-row-offsets.ts`, `column-order.ts`, `pinning.ts`
- B (render core): `data-table.vue`, `table-header.tsx`→`table-header.ts`,
  `table-body.tsx`→`table-body.ts`, `table-footer.tsx`→`table-footer.ts`, `truncate.ts`,
  `get-styles.ts`, `selection.ts`, `expander.ts`, `index.ts`
- C (geometry): `use-column-widths.ts`, `autosize-column.ts`, `use-column-window.ts`,
  `use-column-resize.ts`, `use-column-reorder.ts`, `row-reorder.ts`, `row-reorder-cell.ts`
- D (editing): `use-cell-editing.ts`, `use-instant-editing.ts`, `use-row-editing.ts`,
  `cell-editor.ts`, `editors.ts`
- E (chrome): `search.ts`, `pagination-bar.ts`, `selection-bar.ts`, `columns-panel.ts`,
  `filter-popover.ts`, `controls.ts`, styles.css additions
- F (playground), G (tests) — later waves.
