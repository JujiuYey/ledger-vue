import { nextTick } from "vue";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" },
  { id: "3", name: "Bob" }
];

const getRowId = (person: Person) => person.id;
const columns = [{ accessorKey: "name", header: "Name" }];

interface Node {
  id: string;
  name: string;
  children?: Node[];
}

const tree: Node[] = [
  {
    children: [{ id: "1a", name: "Ann" }, { id: "1b", name: "Ben" }],
    id: "1",
    name: "Carol"
  },
  { id: "2", name: "Alice" }
];

const treeColumns = [{ accessorKey: "name", header: "Name" }];
const getNodeId = (node: Node) => node.id;

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>) {
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

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];
const names = () => all(".ledger-row .ledger-cell").map(cell => cell.textContent ?? "");
const rowIds = () => all(".ledger-row").map(row => (row as HTMLElement).dataset.rowId ?? "");
const selectedIds = () => all("[data-selected]").map(row => (row as HTMLElement).dataset.rowId ?? "");
const rowBoxes = () => all(".ledger-row input[type=\"checkbox\"]") as HTMLInputElement[];
const sortButton = (index: number): HTMLElement => all(".ledger-header-cell button")[index] as HTMLElement;
const sortState = () => all(".ledger-header-cell").map(cell => cell.getAttribute("aria-sort"));

async function click(element: Element | undefined, modifiers: { shiftKey?: boolean } = {}): Promise<void> {
  await element?.dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers }));
  await tick();
}

/**
 * Port of the React "row-state toggles" suites. The React file's first describe ("...against a
 * discarded render") exists to pin toggle semantics across discarded concurrent renders —
 * transitions, Suspense blockers and controlled-state races Vue does not have; those five
 * scenarios are N/A. The second describe ("...keep TanStack's own semantics") ports directly.
 */
describe("row-state toggles keep TanStack's own semantics", () => {
  const twoColumns = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "id", header: "Id" }
  ];

  it("cycles a column through ascending, descending and unsorted", async () => {
    mountTable({ columns, data: people, getRowId });
    await tick();

    await click(sortButton(0));
    expect(names()).toEqual(["Alice", "Bob", "Carol"]);

    await click(sortButton(0));
    expect(names()).toEqual(["Carol", "Bob", "Alice"]);

    // Removal is on by default, so the third click drops the column out of `sorting`.
    await click(sortButton(0));
    expect(names()).toEqual(["Carol", "Alice", "Bob"]);
    expect(sortState()).toEqual([null]);
  });

  it("adds a column to the sort on a multi-sort event and drops it again", async () => {
    mountTable({ columns: twoColumns, data: people, getRowId });
    await tick();

    await click(sortButton(0));
    await click(sortButton(1), { shiftKey: true });

    expect(sortState()).toEqual(["ascending", "ascending"]);

    // The second column keeps cycling on its own while the first stays put.
    await click(sortButton(1), { shiftKey: true });
    expect(sortState()).toEqual(["ascending", "descending"]);

    await click(sortButton(1), { shiftKey: true });
    expect(sortState()).toEqual(["ascending", null]);
  });

  it("caps a multi-sort at maxMultiSortColCount", async () => {
    mountTable({ columns: twoColumns, data: people, getRowId, tableOptions: { maxMultiSortColCount: 1 } });
    await tick();

    await click(sortButton(0));
    await click(sortButton(1), { shiftKey: true });

    expect(sortState()).toEqual([null, "ascending"]);
  });

  it("selects a parent with its children, and a child on its own", async () => {
    mountTable({ columns: treeColumns, data: tree, getRowId: getNodeId, getSubRows: (node: Node) => node.children, enableRowSelection: true });
    await tick();

    // Expand the parent so the cascaded children are rendered.
    await click(all(".ledger-expander-cell button")[0]);
    expect(rowIds()).toEqual(["1", "1a", "1b", "2"]);

    // The tree's parent checkbox cascades into its sub-rows...
    rowBoxes()[0]!.click();
    await tick();

    expect(selectedIds()).toEqual(["1", "1a", "1b"]);

    // ...and a child toggles on its own.
    rowBoxes()[2]!.click();
    await tick();
    expect(selectedIds()).toEqual(["1", "1a"]);
  });

  it("covers a shift range across a tree without duplicating a cascaded child", async () => {
    mountTable({ columns: treeColumns, data: tree, getRowId: getNodeId, getSubRows: (node: Node) => node.children, enableRowSelection: true });
    await tick();

    await click(all(".ledger-expander-cell button")[0]);

    // The parent's cascade selects the whole family; the Shift-click then extends the range
    // over an UNSELECTED row — the range re-covers the cascaded children without
    // duplicating or corrupting them.
    rowBoxes()[0]!.click();
    await tick();
    expect(selectedIds()).toEqual(["1", "1a", "1b"]);

    await rowBoxes()[3]?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await tick();

    expect(new Set(selectedIds())).toEqual(new Set(["1", "1a", "1b", "2"]));
  });

  it("leaves a row the selection predicate refuses out of a range", async () => {
    mountTable({
      columns: treeColumns,
      data: tree,
      getRowId: getNodeId,
      getSubRows: (node: Node) => node.children,
      enableRowSelection: (row: any) => row.original.name !== "Alice",
      enableMultiRowSelection: true
    });
    await tick();

    await click(all(".ledger-expander-cell button")[0]);

    // Anchor on 1a, Shift-click 1b: the range covers both, while Alice ("2") — refused by
    // the predicate — stays out of the block that surrounds her.
    rowBoxes()[1]!.click();
    await tick();
    await rowBoxes()[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    await tick();

    expect(selectedIds()).toEqual(["1a", "1b"]);
  });

  it("expands and collapses a whole tree from the header", async () => {
    mountTable({ columns: treeColumns, data: tree, getRowId: getNodeId, getSubRows: (node: Node) => node.children });
    await tick();
    expect(rowIds()).toEqual(["1", "2"]);

    const buttonByName = (name: string) =>
      all("button").find(button => button.getAttribute("aria-label") === name);

    await click(buttonByName("Expand all rows"));
    expect(rowIds()).toEqual(["1", "1a", "1b", "2"]);

    await click(buttonByName("Collapse all rows"));
    expect(rowIds()).toEqual(["1", "2"]);
  });

  it("selects one row of a tree when the table is single-select", async () => {
    mountTable({
      columns: treeColumns,
      data: tree,
      defaultExpanded: true,
      enableMultiRowSelection: false,
      enableRowSelection: true,
      getRowId: getNodeId,
      getSubRows: (node: Node) => node.children
    });
    await tick();

    // A single-select row clears the map before it writes itself. Cascading into its subtree
    // would leave the last descendant selected instead of the row that was clicked.
    // Single-select renders radios, not checkboxes — one choice at a time is what a radio means.
    await click(document.querySelector(".ledger-row input[type=\"radio\"]") as Element);

    expect(selectedIds()).toEqual(["1"]);
  });

  // N/A (React memo internals): "does not walk the display order again for an unrelated state
  // change" pins TanStack's `_displayIndexCache` staying cold across resize writes — a memo
  // the React edition's row memos relied on. The Vue edition has no row memos to feed, and the
  // controllers read the display order from the post-flush capture, so there is no comparable
  // observable to pin.
});
