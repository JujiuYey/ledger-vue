# ledger-vue

**A Vue-native `<DataTable>` built on TanStack Table v9 and TanStack Virtual v3 — the Vue
edition of [`ledger`](https://github.com/coldsmirk/ledger) (`@coldsmirk/ledger-mantine`).**

Same design doctrine as the original: the behavior layer speaks TanStack's language (raw
`ColumnDef`s, TanStack state shapes, TanStack option names), the presentation layer is owned by
a single layered stylesheet with kebab-case classes and `--ledger-*` custom properties. One
package publishes: `@coldsmirk/ledger-vue`; `ledger-vue-playground` is the demo app.

```
pnpm install
pnpm test            # Vitest once
pnpm typecheck       # vue-tsc per package
pnpm dev             # playground at http://127.0.0.1:5331
pnpm build           # library + playground
```

## Status

Ported from the React original (v0.4.0 feature set). See `PORTING-NOTES.md` for the porting
conventions and the full React → Vue mapping.

## Install

```bash
pnpm add @coldsmirk/ledger-vue
```

```ts
import { DataTable, createColumnHelper } from "@coldsmirk/ledger-vue";
import "@coldsmirk/ledger-vue/styles.css";          // once, app entry
import { zhCN } from "@coldsmirk/ledger-vue/locales"; // optional locale preset
```

Peers: `vue ^3.5`. Dependencies: `@tanstack/vue-table`, `@tanstack/vue-virtual`, `@dnd-kit/dom`
(drag reordering), `clsx`.

## The 60-second table

```vue
<script setup lang="ts">
import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("firstName", { header: "First name" }),
  helper.accessor("salary", { header: "Salary", meta: { align: "end" } })
];
</script>

<template>
  <div style="height: 480px">
    <DataTable :data="people" :columns="columns" with-table-border striped highlight-on-hover />
  </div>
</template>
```

## API mapping from the React original

The behavior surface keeps its names; only the framework mechanics change:

| React (`@coldsmirk/ledger-mantine`) | Vue (`@coldsmirk/ledger-vue`) |
| --- | --- |
| `<DataTable data={data} columns={columns} …/>` | `<DataTable :data :columns …/>` |
| Controlled slice `state.x` + `onXChange` | `v-model:x` (emits the resolved value) or `:x` + `@update:x` |
| Uncontrolled `defaultX` | `defaultX` (unchanged) |
| `ref` imperative handle | `handleRef` prop **and** `defineExpose` (template ref) |
| `<DataTable.Search />` static components | named imports `DataTableSearch`, `DataTableColumnsPanel`, `DataTablePagination`, `DataTableSelectionBar` (also attached as `DataTable.Search` etc. at runtime) |
| `useDataTable(options)` re-runs per render | composable runs once; reactive inputs (`data`, `columns`, every state slice) accept a ref/getter — plain values are adopted as-is |
| Mantine theme carries colors/metrics | tokens are library-owned (`--ledger-*` on `.ledger-root`, dark via `data-color-scheme` or the OS preference); `colorScheme` prop forces a mode |
| Mantine `ScrollArea` | native overflow scroller (thin scrollbars, `overscroll-behavior: none`) |
| `flexRender` from `@tanstack/react-table` | `flexRender` from `@tanstack/vue-table`; renderers return `VNodeChild` |
| Styles API `classNames`/`styles` props | same prop names, same selectors, no theme variables |

Everything else — the `meta` extension surface (`label`, `align`, `truncate`, `filter`,
`edit`, `cellProps`, `headerCellProps`, `footerCellProps`, `export`, `hiddenFrom`,
`visibleFrom`), the feature switches, the client/server modes, the injected columns, editing
(cell/row/instant), pinning, grouping, row pinning, CSV export, persistence, virtualization —
keeps the React package's contract verbatim.

### Deliberate deviations

- **Theming**: there is no host component library. The stylesheet defines its own light/dark
  token values; override `--ledger-*` properties on any ancestor to retheme, or drop in the
  token block of a Mantine-based app (the names mirror Mantine's defaults).
- **Breakpoints**: `hiddenFrom`/`visibleFrom` accept `"xs" | "sm" | "md" | "lg" | "xl"`
  against a fixed px scale (576/768/992/1200/1400).
- **Concurrency artifacts**: React-only machinery (`useStylesRevision`, requested-value
  bookkeeping for concurrent transitions) has no Vue counterpart and is omitted; `useSlice`
  and `useCommittedTable` keep their names and contracts.
- **Compound components**: dot-notation JSX is impossible in Vue templates; the four chrome
  components are named exports (see table above). They wire to the table via the `table` prop.

## License

MIT — the vendored Lucide path data is ISC (© Lucide Icons contributors; chevron/search/x
glyphs derived from Feather, MIT © Cole Bemis).
