import type { FilterFn, SortingState } from "@tanstack/vue-table";

import type { RowData } from "@tanstack/vue-table";

import type { ColumnDef, TableInstance, UseDataTableOptions } from "./types";

import { defineComponent, h, nextTick } from "vue";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { numberEditor, textEditor } from "./editors";
import { ledgerFilterFns } from "./filter-fns";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30
  },
  {
    id: "2",
    name: "Alice",
    age: 25
  },
  {
    id: "3",
    name: "Bob",
    age: 40
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" }
];

const editableColumns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: textEditor() }
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { edit: numberEditor() }
  }
];

const validatedColumns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: {
      edit: {
        render: textEditor(),
        validate: value => String(value ?? "").length > 0 ? null : "Name is required"
      }
    }
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { edit: numberEditor() }
  }
];

const getRowId = (person: Person) => person.id;
const startsWithFilter: FilterFn<any, any> = (row, columnId, value: string) => String(row.getValue(columnId)).startsWith(value);
const rejectFilter: FilterFn<any, any> = () => false;

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope. `act(...)` becomes the call plus a flush — the adapter syncs table options
 * on a pre-flush watcher, and the core mirrors controlled state into its atoms from there.
 */
// The build callback is deliberately untyped: v9's ColumnDef unions are invariant in
// TData, so a `UseDataTableOptions<Person>` literal is not assignable to the `any`-bound
// parameter type — the tests' Person columns would all fail. TData stays on the return.
function useTableInSetup<TData extends RowData>(build: () => UseDataTableOptions<any> | any): TableInstance<TData> {
  let table!: TableInstance<TData>;

  const Host = defineComponent({
    setup() {
      table = useDataTable(build());

      return () => h("div");
    }
  });

  mount(Host);

  return table;
}

async function flush(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/** The instance's live state, read through the reactive atoms. */
function stateOf(table: any): Record<string, unknown> {
  return Object.fromEntries(Object.keys(table.initialState).map(key => [key, (table.atoms as Record<string, { get: () => unknown }>)[key]!.get()]));
}

describe("useDataTable", () => {
  it("sorts client-side through the full asc → desc → cleared cycle", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId
    }));

    const names = () => table.getRowModel().rows.map(row => row.getValue("name"));

    table.getColumn("name")?.toggleSorting(false);
    await flush();
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);

    table.getColumn("name")?.toggleSorting(true);
    await flush();
    expect(names()).toEqual(["Carol", "Bob", "Alice"]);

    table.getColumn("name")?.clearSorting();
    await flush();
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
  });

  it("keeps a controlled slice pinned to the prop and reports resolved values", async () => {
    const onSortingChange = vi.fn();
    const sorting: SortingState = [];
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      sorting,
      onSortingChange
    }));

    table.getColumn("age")?.toggleSorting(false);
    await flush();

    expect(onSortingChange).toHaveBeenCalledWith([{ id: "age", desc: false }]);
    // Controlled: the instance still renders the prop's (empty) sorting — silence is a refusal.
    expect(table.atoms.sorting.get()).toEqual([]);
  });

  it("injects the selection and expander columns pinned to the start", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      enableRowSelection: true,
      renderDetailPanel: () => null
    }));
    await flush();

    const leafIds = table.getAllLeafColumns().map(column => column.id);

    expect(leafIds.slice(0, 2)).toEqual(["ledger:select", "ledger:expander"]);
    expect((table.atoms.columnPinning.get().start ?? []).slice(0, 2)).toEqual([
      "ledger:select",
      "ledger:expander"
    ]);
  });

  it("keeps injected column ids out of the consumer's columnPinning slice", async () => {
    const onColumnPinningChange = vi.fn();
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      enableRowSelection: true,
      onColumnPinningChange
    }));
    await flush();

    // `column.pin()` resolves against the merged state, which carries the injected id — without
    // the write-side strip it would land `ledger:select` in the consumer's slice and in
    // persisted layout, and `pin("end")` would render the column twice.
    table.getColumn("ledger:select")?.pin("end");
    await flush();

    for (const [value] of onColumnPinningChange.mock.calls) {
      expect(value).toEqual({ end: [], start: [] });
    }

    expect(table.atoms.columnPinning.get()).toEqual({ end: [], start: ["ledger:select"] });

    // A consumer pin alongside the injected ids strips only the internal ones.
    table.getColumn("name")?.pin("end");
    await flush();

    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ end: ["name"], start: [] });
    expect(table.atoms.columnPinning.get()).toEqual({ end: ["name"], start: ["ledger:select"] });
  });

  it("wires filter variants from meta.filter for columns without their own filterFn", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns: [
        {
          accessorKey: "name",
          header: "Name",
          meta: { filter: "multi-select" }
        }
      ],
      getRowId
    }));

    table.getColumn("name")?.setFilterValue(["Alice", "Bob"]);
    await flush();

    expect(table.getRowModel().rows).toHaveLength(2);
  });

  it("multi-select filtering is strict set membership, never substring matching", async () => {
    // Regression: no TanStack built-in gives exact membership over both scalar and array cells —
    // v8's arrIncludesSome even substring-matched scalars, so "active" also matched "inactive".
    interface Account {
      id: string;
      state: string;
    }

    const accounts: Account[] = [
      { id: "1", state: "active" },
      { id: "2", state: "inactive" }
    ];

    const table = useTableInSetup<Account>(() => ({
      data: accounts,
      columns: [
        {
          accessorKey: "state",
          header: "State",
          meta: { filter: "multi-select" }
        }
      ],
      getRowId: (account: any) => account.id
    }));

    table.getColumn("state")?.setFilterValue(["active"]);
    await flush();

    const { rows } = table.getRowModel();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.getValue("state")).toBe("active");
  });

  it("keeps every row in the model while pagination is off, past the default page size", async () => {
    // The regression: `state.pagination` is always supplied and `paginatedRowModel` is part of
    // the canonical feature set, so without an explicit bypass v9 sliced every table to the
    // 20-row default page — silently, with no pager to reveal the missing rows.
    const crowd = Array.from({ length: 25 }, (_, index) => {
      return {
        id: String(index + 1),
        name: `Person ${index + 1}`,
        age: 20 + index
      };
    });

    const table = useTableInSetup<Person>(() => ({
      data: crowd,
      columns,
      getRowId
    }));
    await flush();

    expect(table.getRowModel().rows).toHaveLength(25);
  });

  it("slices the model to one page once pagination is enabled", async () => {
    const crowd = Array.from({ length: 25 }, (_, index) => {
      return {
        id: String(index + 1),
        name: `Person ${index + 1}`,
        age: 20 + index
      };
    });

    const table = useTableInSetup<Person>(() => ({
      data: crowd,
      columns,
      getRowId,
      enablePagination: true
    }));
    await flush();

    expect(table.getRowModel().rows).toHaveLength(20);
    expect(table.getPageCount()).toBe(2);

    table.nextPage();
    await flush();
    expect(table.getRowModel().rows).toHaveLength(5);

    // N/A (React `rerender({ paginated: false })`): the React edition flipped the pagination
    // switch reactively per render; the Vue edition reads the feature switches once at mount
    // (a live app does not flip them per frame — PORTING-NOTES), so the flip-back half of the
    // original does not port.
  });

  it("translates server pagination mode and resets pageIndex when inputs change", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      enablePagination: true,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 }
    }));
    await flush();

    expect(table.options.manualPagination).toBe(true);
    expect(table.getPageCount()).toBe(10);
    expect(table.atoms.pagination.get().pageIndex).toBe(3);

    table.setGlobalFilter("ali");
    await flush();

    // §10.4: in server mode ledger performs the deterministic reset itself.
    expect(table.atoms.pagination.get().pageIndex).toBe(0);
  });

  // N/A (React StrictMode): "does not reset server pagination during a root StrictMode mount" —
  // Vue has no StrictMode simulated mounts; the deterministic reset is driven by the input watch
  // alone, and a mount with no input change writes nothing.

  it.each([
    { autoResetAll: false },
    { autoResetPageIndex: false },
    { autoResetAll: false, autoResetPageIndex: true }
  ])("respects the server pagination reset policy %#", async resetPolicy => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 },
      tableOptions: resetPolicy
    }));
    await flush();

    table.setGlobalFilter("ali");
    await flush();

    expect(table.atoms.pagination.get().pageIndex).toBe(3);
  });

  it("keeps the deterministic zero reset authoritative when autoResetAll is true", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      paginationMode: "server",
      rowCount: 100,
      defaultPagination: { pageIndex: 3, pageSize: 10 },
      tableOptions: { autoResetAll: true }
    }));
    await flush();

    table.getRowModel();
    table.setGlobalFilter("ali");
    table.getRowModel();
    await flush();

    expect(table.atoms.pagination.get().pageIndex).toBe(0);
    expect(table.options.autoResetAll).toBeUndefined();
    expect(table.options.autoResetPageIndex).toBe(false);
    expect(table.options.autoResetExpanded).toBe(true);
  });

  it("merges custom filter functions while keeping ledger filter ids reserved", async () => {
    const filterFns = {
      fuzzy: startsWithFilter,
      "ledger-one-of": rejectFilter
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      enableGlobalFilter: true,
      filterFns,
      tableOptions: {
        globalFilterFn: "fuzzy"
      }
    }));

    table.setGlobalFilter("Ali");
    await flush();

    expect(table.getRowModel().rows.map(row => row.original.name)).toEqual(["Alice"]);
    expect(table.options.features.filterFns?.["ledger-one-of"]).toBe(ledgerFilterFns["ledger-one-of"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ledger-one-of"));

    warn.mockRestore();
  });

  it("resets every state slice to its declared default", async () => {
    const defaults = {
      sorting: [{ id: "age", desc: true }],
      columnFilters: [{ id: "name", value: "a" }],
      globalFilter: "a",
      pagination: { pageIndex: 2, pageSize: 1 },
      rowSelection: { 2: true },
      expanded: { 2: true },
      columnVisibility: { age: false },
      columnPinning: { start: ["name"], end: [] },
      columnOrder: ["age", "name"],
      columnSizing: { name: 240 },
      grouping: ["name"],
      rowPinning: { top: ["2"], bottom: [] }
    };
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      defaultSorting: defaults.sorting,
      defaultColumnFilters: defaults.columnFilters,
      defaultGlobalFilter: defaults.globalFilter,
      defaultPagination: defaults.pagination,
      defaultRowSelection: defaults.rowSelection,
      defaultExpanded: defaults.expanded,
      defaultColumnVisibility: defaults.columnVisibility,
      defaultColumnPinning: defaults.columnPinning,
      defaultColumnOrder: defaults.columnOrder,
      defaultColumnSizing: defaults.columnSizing,
      defaultGrouping: defaults.grouping,
      defaultRowPinning: defaults.rowPinning
    }));
    await flush();

    table.setSorting([]);
    table.setColumnFilters([]);
    table.setGlobalFilter("");
    table.setPagination({ pageIndex: 0, pageSize: 20 });
    table.setRowSelection({});
    table.setExpanded({});
    table.setColumnVisibility({});
    table.setColumnPinning({ start: [], end: [] });
    table.setColumnOrder([]);
    table.setColumnSizing({});
    table.setGrouping([]);
    table.setRowPinning({ top: [], bottom: [] });
    await flush();

    table.resetSorting();
    table.resetColumnFilters();
    table.resetGlobalFilter();
    table.resetPagination();
    table.resetRowSelection();
    table.resetExpanded();
    table.resetColumnVisibility();
    table.resetColumnPinning();
    table.resetColumnOrder();
    table.resetColumnSizing();
    table.resetGrouping();
    table.resetRowPinning();
    await flush();

    expect(stateOf(table)).toMatchObject(defaults);
  });

  it("resets pagination and global filtering to ledger fallbacks", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId
    }));
    await flush();

    table.setPagination({ pageIndex: 4, pageSize: 50 });
    table.setGlobalFilter("alice");
    await flush();

    table.resetPagination();
    table.resetGlobalFilter(true);
    await flush();

    expect(table.atoms.pagination.get()).toEqual({ pageIndex: 0, pageSize: 20 });
    expect(table.atoms.globalFilter.get()).toBe("");
  });

  it("keeps the current editor active when commit rejects navigation", async () => {
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns: validatedColumns,
      getRowId,
      onEditCommit: vi.fn()
    }));
    await flush();
    const editing = () => table.options.meta?.ledger?.editing;

    editing()?.start({ rowId: "1", columnId: "name" });
    await flush();
    editing()?.drafts.write("1", "name", "");
    await flush();
    editing()?.start({ rowId: "2", columnId: "age" });
    await flush();

    // The value fails its own `validate`, so there is nowhere to move on to.
    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });

    editing()?.stop({ commit: true });
    await flush();

    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });
  });

  it("lets only the latest navigation request win after an async commit", async () => {
    const inFlight = Promise.withResolvers<void>();
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns: editableColumns,
      getRowId,
      onEditCommit: () => inFlight.promise
    }));
    await flush();
    const editing = () => table.options.meta?.ledger?.editing;

    editing()?.start({ rowId: "1", columnId: "name" });
    await flush();
    editing()?.drafts.write("1", "name", "Changed");
    await flush();
    editing()?.start({ rowId: "2", columnId: "name" });
    editing()?.start({ rowId: "3", columnId: "age" });
    await flush();

    inFlight.resolve();
    await inFlight.promise;
    await flush();

    expect(editing()?.cell).toEqual({ rowId: "3", columnId: "age" });
  });

  it("keeps the current editor active when a commit promise rejects", async () => {
    const inFlight = Promise.withResolvers<void>();
    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns: editableColumns,
      getRowId,
      onEditCommit: () => inFlight.promise
    }));
    await flush();
    const editing = () => table.options.meta?.ledger?.editing;

    editing()?.start({ rowId: "1", columnId: "name" });
    await flush();
    editing()?.drafts.write("1", "name", "Changed");
    await flush();
    editing()?.start({ rowId: "2", columnId: "age" });
    await flush();

    inFlight.reject(new Error("commit failed"));
    await inFlight.promise.catch(() => undefined);
    await flush();

    expect(editing()?.cell).toEqual({ rowId: "1", columnId: "name" });
  });

  it("lets tableOptions through as the base layer but overrides managed keys with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const table = useTableInSetup<Person>(() => ({
      data: people,
      columns,
      getRowId,
      sortingMode: "client",
      tableOptions: { manualSorting: true, autoResetAll: false }
    }));
    await flush();

    // The managed translation wins over the escape hatch…
    expect(table.options.manualSorting).toBe(false);
    // …while unmanaged keys pass through untouched.
    expect(table.options.autoResetAll).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("tableOptions.manualSorting"));

    warn.mockRestore();
  });

  it("warns when selection is enabled without getRowId", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    useTableInSetup<Person>(() => ({
      data: people,
      columns,
      enableRowSelection: true
    }));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("getRowId"));

    warn.mockRestore();
  });
});
