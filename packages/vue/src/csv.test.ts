import type { ColumnDef } from "./types";

import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { enableAutoUnmount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { toCsv } from "./csv";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

interface Order {
  id: string;
  customer: string;
  total: number;
}

const orders: Order[] = [
  {
    id: "1",
    customer: "Says \"hi\", ok",
    total: 12.5
  },
  {
    id: "2",
    customer: "Plain",
    total: 3
  }
];

const columns: Array<ColumnDef<Order, any>> = [
  { accessorKey: "customer", header: "Customer" },
  { accessorKey: "total", header: "Total" },
  { id: "actions", cell: () => null }
];

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope (effect-scope disposal included). `act(...)` becomes
 * `set + await nextTick()` — the adapter syncs table options on a pre-flush watcher.
 */
function useTableInSetup<T>(composable: () => T): T {
  let result!: T;

  const Host = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    }
  });

  mount(Host);

  return result;
}

describe("toCsv", () => {
  it("exports accessor columns with RFC 4180 quoting and skips display columns", () => {
    const table = useTableInSetup(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id
    }));

    const csv = toCsv(table);

    expect(csv).toBe(
      ["Customer,Total", "\"Says \"\"hi\"\", ok\",12.5", "Plain,3"].join("\r\n")
    );
  });

  it("honors the selected scope and a custom delimiter", async () => {
    const table = useTableInSetup(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id,
      enableRowSelection: true
    }));

    table.setRowSelection({ 2: true });
    await nextTick();

    const csv = toCsv(table, {
      scope: "selected",
      delimiter: ";",
      withHeaders: false
    });

    expect(csv).toBe("Plain;3");
  });

  it("exports columns in pinned-aware display order", () => {
    const table = useTableInSetup(() => useDataTable({
      data: orders,
      columns,
      getRowId: order => order.id,
      defaultColumnPinning: { start: [], end: ["customer"] }
    }));

    expect(toCsv(table).split("\r\n", 1)[0]).toBe("Total,Customer");
  });

  it("honors meta.export exclusion, header and value overrides, and the page scope", async () => {
    const metaColumns: Array<ColumnDef<Order, any>> = [
      {
        accessorKey: "customer",
        header: "Customer",
        meta: { export: { header: "Client", value: row => row.original.customer.toUpperCase() } }
      },
      {
        accessorKey: "total",
        header: "Total",
        meta: { export: false }
      },
      { accessorKey: "id", header: "Id" }
    ];

    const table = useTableInSetup(() => useDataTable({
      data: orders,
      columns: metaColumns,
      getRowId: order => order.id,
      enablePagination: true,
      defaultPagination: { pageIndex: 0, pageSize: 1 }
    }));

    // Excluded column gone, overridden header and derived value in place.
    expect(toCsv(table)).toBe(
      ["Client,Id", "\"SAYS \"\"HI\"\", OK\",1", "PLAIN,2"].join("\r\n")
    );

    // The page scope exports only the rows the current page shows.
    expect(toCsv(table, { scope: "page" })).toBe(
      ["Client,Id", "\"SAYS \"\"HI\"\", OK\",1"].join("\r\n")
    );

    await nextTick();
  });

  it("defuses formula-leading text only under escapeFormulas", () => {
    const risky: Order[] = [
      {
        id: "1",
        customer: "=SUM(A1:A9)",
        total: -5
      },
      {
        id: "2",
        customer: "+86 555 0100",
        total: 3
      }
    ];

    const table = useTableInSetup(() => useDataTable({
      data: risky,
      columns,
      getRowId: order => order.id
    }));

    // Off by default — the prefix quote is data to every non-spreadsheet consumer.
    expect(toCsv(table)).toBe(
      ["Customer,Total", "=SUM(A1:A9),-5", "+86 555 0100,3"].join("\r\n")
    );

    // On: string cells gain the OWASP `'` prefix; the numeric -5 keeps its sign.
    expect(toCsv(table, { escapeFormulas: true })).toBe(
      ["Customer,Total", "'=SUM(A1:A9),-5", "'+86 555 0100,3"].join("\r\n")
    );
  });

  it("defuses formula-leading header text and quotes after defusing", () => {
    const trapColumns: Array<ColumnDef<Order, any>> = [
      { accessorKey: "customer", header: "=Customer" },
      { accessorKey: "total", header: "Total" }
    ];
    const risky: Order[] = [
      {
        id: "1",
        customer: "@cmd, run",
        total: 1
      }
    ];

    const table = useTableInSetup(() => useDataTable({
      data: risky,
      columns: trapColumns,
      getRowId: order => order.id
    }));

    expect(toCsv(table, { escapeFormulas: true })).toBe(
      ["'=Customer,Total", "\"'@cmd, run\",1"].join("\r\n")
    );
  });

  it("exports a selected child whose parent is not selected", async () => {
    interface Node {
      id: string;
      customer: string;
      total: number;
      children?: Node[];
    }

    const nested: Node[] = [
      {
        children: [
          {
            customer: "Child",
            id: "1a",
            total: 1
          }
        ],
        customer: "Parent",
        id: "1",
        total: 10
      }
    ];

    const table = useTableInSetup(() => useDataTable({
      data: nested,
      columns: columns as Array<ColumnDef<Node, any>>,
      getRowId: node => node.id,
      getSubRows: node => node.children,
      enableRowSelection: true
    }));

    // The selected row model's `rows` is a tree — a child whose parent is unselected is not in it.
    table.setRowSelection({ "1a": true });
    await nextTick();

    expect(toCsv(table, { scope: "selected", withHeaders: false })).toBe("Child,1");

    // Parent and child together are two lines, each once, in the order they are drawn.
    table.setRowSelection({ 1: true, "1a": true });
    await nextTick();

    expect(toCsv(table, { scope: "selected", withHeaders: false }))
      .toBe(["Parent,10", "Child,1"].join("\r\n"));
  });
});
