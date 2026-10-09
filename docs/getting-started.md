# Getting started

`@jujiuyey/ledger-vue` renders a Vue-native `<DataTable>` on top of TanStack Table v9 (behavior) and TanStack Virtual v3 (row virtualization). One sentence teaches the whole API: **the behavior layer speaks TanStack's language, the presentation layer speaks the stylesheet's.**

## Installation

```bash
pnpm add @jujiuyey/ledger-vue
```

Peer dependencies (the host application provides them):

| Peer | Range |
| --- | --- |
| `vue` | `^3.5.0` |

`@tanstack/vue-table` and `@tanstack/vue-virtual` are **direct dependencies**, not peers — consumers import everything from `@jujiuyey/ledger-vue` and never from `@tanstack/*`. (So are `reka-ui` — the popover engine — and `@dnd-kit/dom`, the drag-and-drop engine behind reordering.) Everything a table needs (`createColumnHelper`, `flexRender`, every state type) is re-exported from the main entry.

## Stylesheet

Import the stylesheet once, in the app entry — no other stylesheet is required:

```ts
import "@jujiuyey/ledger-vue/styles.css";
```

All rules live in the `ledger` [cascade layer](https://developer.mozilla.org/docs/Web/CSS/@layer) and define their own `--ledger-*` design tokens: light values by default, dark values under the OS preference, under `data-color-scheme="dark"` on the document element (`<html>`), or under `data-color-scheme` on a table's own root — which the component's `colorScheme` prop writes. Dark mode needs nothing from the host, and theming is overriding those variables on any ancestor. See [styling.md](styling.md).

## First table

```vue
<script setup lang="ts">
import { createColumnHelper, DataTable } from "@jujiuyey/ledger-vue";

interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

defineProps<{ people: Person[] }>();

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("name", { header: "Name", size: 160 }),
  helper.accessor("email", { header: "Email", meta: { truncate: true } }),
  helper.accessor("age", { header: "Age", size: 80, meta: { align: "end" } })
];
</script>

<template>
  <DataTable
    :columns="columns"
    :data="people"
    :get-row-id="person => person.id"
    highlight-on-hover
    with-table-border
  />
</template>
```

Three things worth noticing:

- **Columns are raw TanStack `ColumnDef`s** — every TanStack column capability works unchanged. Presentation concerns (`align`, `truncate`, filter and editor wiring) ride the typed `meta` extension. See [columns.md](columns.md).
- **`getRowId` should return a stable id** whenever rows carry state (selection, expansion, editing). Index-based ids corrupt state across refetches; a dev-mode warning fires if selection or expansion is enabled without it.
- **`data` and `columns` need stable identities.** A fresh array on every read re-initializes the table continuously (the classic TanStack pitfall); define columns at module scope, or behind a `computed`/`ref` whose identity only moves when the content does. A dev-mode warning detects per-tick column churn.

Sorting and column pinning/hiding are enabled out of the box (their UI is the header label and [`DataTableColumnsPanel`](columns.md#the-columns-panel)); everything else (`enableRowSelection`, `enablePagination`, `virtualizedRows`, …) is one switch away. Defaults are catalogued in [api.md](api.md).

## Sizing: give it a place, not a height

The root fills whatever space its parent gives it and scrolls internally — it behaves like a well-mannered flex item, not a fixed-height widget:

```vue
<template>
  <div style="height: 100dvh; display: flex; flex-direction: column">
    <Toolbar />                                    <!-- rigid -->
    <DataTable style="flex: 1; min-height: 0" … /> <!-- takes the remaining space, scrolls inside -->
  </div>
</template>
```

There are no `height`/`maxHeight` props — the root takes Vue's ordinary `class`/`style`, so `flex`, `min-height`, `height`, `max-height`, and `width` are already the sizing vocabulary. The full contract (including content-height degradation and column width rules) is in [sizing.md](sizing.md).

## Two usage modes

**Sugar mode** — pass behavior options and presentation props to the component; it calls `useDataTable` internally. This is the default for ordinary pages.

**Hook mode** — create the instance yourself with the `useDataTable` composable, then hand it to `<DataTable :table="…">` and compose the compound components anywhere. ledger deliberately ships no toolbar: toolbars are the page's territory.

```vue
<script setup lang="ts">
import {
  createColumnHelper,
  DataTable,
  DataTableColumnsPanel,
  DataTablePagination,
  DataTableSearch,
  useDataTable
} from "@jujiuyey/ledger-vue";

const props = defineProps<{ people: Person[] }>();

const helper = createColumnHelper<Person>();
const columns = [ /* … */ ];

const table = useDataTable({
  data: () => props.people,           // reactive-critical inputs accept refs/getters
  columns,
  getRowId: person => person.id,
  enableGlobalFilter: true,
  enablePagination: true
});
</script>

<template>
  <div style="flex: 1; min-height: 0; display: flex; flex-direction: column">
    <div style="display: flex; justify-content: space-between">
      <DataTableSearch :table="table" :width="260" />

      <!-- the default slot is the trigger — the panel assumes nothing about what opens it -->
      <DataTableColumnsPanel :table="table">
        <button type="button">Columns</button>
      </DataTableColumnsPanel>
    </div>

    <DataTable :table="table" style="flex: 1; min-height: 0" :with-pagination-bar="false" />

    <DataTablePagination :table="table" />
  </div>
</template>
```

Call the composable once in setup: the instance is for the component's life, and reactive reads go through `table.atoms.<slice>.get()` — the vue-table shape's reactive atoms. With `table` present, behavior props beside it are dead (a dev-mode warning names them); sugar mode degrades to hook mode with zero rewrites because both share the same options. `useDataTable` returns the **bare TanStack table instance** (exported as `TableInstance`) — the full TanStack API is available on it, and the escape hatch never disagrees with the props.

## App-wide defaults and locale

Configuration is ordinary Vue — there is no provider and no theme object to feed defaults through. Every user-visible string flows through `labels` (English defaults, complete `zhCN` preset), passed to the table and every compound component that renders copy:

```ts
import { zhCN } from "@jujiuyey/ledger-vue/locales";
```

```vue
<DataTable :labels="zhCN" highlight-on-hover … />
```

App-wide defaults are a wrapper component of your own around `<DataTable>` (and the compounds it uses) — the defaults become the wrapper's props. See [i18n.md](i18n.md).

## Where to go next

- Feature guides: [columns](columns.md), [sorting](sorting.md), [filtering](filtering.md), [pagination](pagination.md), [selection](selection.md), [editing](editing.md), [rows](rows.md), [grouping](grouping.md), [pinning](pinning.md), [virtualization](virtualization.md)
- The state model, server modes, and escape hatches: [state.md](state.md)
- Styling and theming: [styling.md](styling.md)
- The complete prop/type reference: [api.md](api.md)
- Runnable demos: `packages/playground` (`pnpm --filter ledger-vue-playground dev`), one page per feature area, in English or Simplified Chinese, each showing its own source
