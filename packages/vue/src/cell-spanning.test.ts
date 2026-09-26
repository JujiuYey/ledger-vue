import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";

enableAutoUnmount(afterEach);

interface Entry {
  id: string;
  dept: string;
  name: string;
}

const entries: Entry[] = [
  {
    id: "1",
    dept: "Design",
    name: "Carol"
  },
  {
    id: "2",
    dept: "Design",
    name: "Alice"
  },
  {
    id: "3",
    dept: "Ops",
    name: "Bob"
  }
];

/* ---- mounting ---- */

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>): VueWrapper {
  // The data-table.test.ts harness: a definite height on the host so the adaptive root has an
  // indefinite-parent-free start, and jsdom lays nothing out — the environment the React
  // edition's suite ran in (its MantineProvider/StrictMode wrapper has no Vue counterpart).
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return mount(DataTable as never, { attachTo: host, props: props as never });
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

/* ---- queries (the React edition's container, read straight off the document) ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

const rowsOf = (root: ParentNode = document) => all(".ledger-tbody .ledger-row", root);

describe("cell spanning", () => {
  it("marks a run that reaches the last row as the body's bottom edge", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];
    const data: Entry[] = [
      {
        id: "1",
        dept: "Design",
        name: "Carol"
      },
      {
        id: "2",
        dept: "Ops",
        name: "Alice"
      },
      {
        id: "3",
        dept: "Ops",
        name: "Bob"
      }
    ];

    mountTable({ columns, data, getRowId: (entry: Entry) => entry.id });

    const rows = rowsOf();
    const dept = (index: number) => rows[index]?.querySelector<HTMLTableCellElement>(':scope td[data-ledger-column-id="dept"]');

    // The Ops run anchors on the middle row and ends on the last: its anchor shares the bottom
    // edge, while the row it sits on is not itself last.
    expect(dept(1)?.rowSpan).toBe(2);
    expect(dept(1)?.hasAttribute("data-last")).toBe(true);
    expect(rows[1]?.hasAttribute("data-last")).toBe(false);
    expect(rows[2]?.hasAttribute("data-last")).toBe(true);
    // A single-row cell above keeps its separator.
    expect(dept(0)?.hasAttribute("data-last")).toBe(false);
  });

  it("merges adjacent equal cells into one row-spanning cell and skips the covered ones", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    mountTable({ columns, data: entries, getRowId: (entry: Entry) => entry.id });

    const rows = rowsOf();
    expect(rows).toHaveLength(3);

    const firstDept = rows[0]?.querySelector<HTMLTableCellElement>(':scope td[data-ledger-column-id="dept"]');
    expect(firstDept?.rowSpan).toBe(2);
    expect(firstDept?.getAttribute("aria-rowspan")).toBe("2");

    // The covered cell renders nothing — the anchor's rowSpan owns the grid slot.
    expect(rows[1]?.querySelectorAll(":scope td")).toHaveLength(1);
    expect(rows[2]?.querySelectorAll(":scope td")).toHaveLength(2);
  });

  it("marks the leading column by display position, not by DOM position", () => {
    // A covered cell renders nothing, so the next cell in the row becomes `:first-child` while
    // sitting in the middle of the table. Column borders key on `data-leading` because of it —
    // otherwise every row under a merged run loses a border it should have.
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    mountTable({
      columns,
      data: entries,
      getRowId: (entry: Entry) => entry.id,
      withColumnBorders: true
    });

    const rows = rowsOf();
    const covered = rows[1]?.querySelector<HTMLElement>(":scope td");

    // Row 2 renders only "name": first in the DOM, second in the table.
    expect(covered?.dataset.ledgerColumnId).toBe("name");
    expect(covered?.matches(":first-child")).toBe(true);
    expect(covered?.hasAttribute("data-leading")).toBe(false);

    // The real leading column keeps the marker wherever it renders.
    expect(rows[0]?.querySelector(':scope td[data-ledger-column-id="dept"]')?.hasAttribute("data-leading")).toBe(true);
    expect(rows[0]?.querySelector(':scope td[data-ledger-column-id="name"]')?.hasAttribute("data-leading")).toBe(false);
  });

  it("spans columns per row and drops the covered trailing cells", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanColumns: ({ row }) => row.original.name === "Bob" ? Infinity : 1
      },
      { accessorKey: "name", header: "Name" }
    ];

    mountTable({ columns, data: entries, getRowId: (entry: Entry) => entry.id });

    const rows = rowsOf();
    const summaryCells = rows[2]?.querySelectorAll<HTMLTableCellElement>(":scope td");

    expect(summaryCells).toHaveLength(1);
    expect(summaryCells?.[0]?.colSpan).toBe(2);    expect(rows[0]?.querySelectorAll(":scope td")).toHaveLength(2);
  });

  it("ignores spanning while virtualized", () => {
    const columns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "dept",
        header: "Department",
        spanRows: true
      },
      { accessorKey: "name", header: "Name" }
    ];

    mountTable({
      virtualizedRows: true,
      columns,
      data: entries,
      getRowId: (entry: Entry) => entry.id
    });

    for (const row of rowsOf()) {
      expect(row.querySelectorAll(":scope td")).toHaveLength(2);
    }

    expect(q("td[rowspan]")).toBeNull();
  });
});
