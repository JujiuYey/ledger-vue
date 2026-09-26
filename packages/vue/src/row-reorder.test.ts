import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableRowReorder } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import DataTable from "./data-table.vue";
import { pointerDropEdge } from "./row-reorder";

enableAutoUnmount(afterEach);

interface Item {
  id: string;
  name: string;
  stock: number;
}

const items: Item[] = [
  {
    id: "1",
    name: "Wireless Mouse",
    stock: 10
  },
  {
    id: "2",
    name: "Projector",
    stock: 20
  },
  {
    id: "3",
    name: "Webcam",
    stock: 30
  }
];

const getRowId = (item: Item) => item.id;

const columns: Array<ColumnDef<Item, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "stock", header: "Stock" }
];

/* ---- mounting (the data-table.test.ts harness) ---- */

const hosts: Array<HTMLElement> = [];

// Behavior props are mount-time in this edition — every case below renders its own fresh mount,
// exactly as the React spec's `view(...)` helper did.
function view(options: {
  onRowReorder?: (reorder: DataTableRowReorder<Item>) => void;
  enableRowOrdering?: boolean;
  enableRowPinning?: boolean;
  defaultRowPinning?: { top: string[]; bottom: string[] };
  defaultSorting?: Array<{ id: string; desc: boolean }>;
  getSubRows?: (item: Item) => Item[] | undefined;
}): VueWrapper {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return mount(DataTable as never, {
    attachTo: host,
    props: {
      columns,
      data: items,
      getRowId,
      ...options,
      enableRowOrdering: options.enableRowOrdering ?? true
    } as never
  });
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

/* ---- queries and events (testing-library's roles, real DOM events) ---- */

const handles = () => document.querySelectorAll('[aria-label="Drag to reorder row"]') as NodeListOf<HTMLButtonElement>;
const handle = (index: number) => handles()[index] as HTMLButtonElement;
const announcer = () => document.querySelector("[role=\"status\"]") as HTMLElement;
const rowOf = (element: HTMLElement) => element.closest("tr") as HTMLTableRowElement;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

async function keyDown(element: HTMLElement, key: string): Promise<void> {
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  await tick();
}

async function blur(element: HTMLElement): Promise<void> {
  element.dispatchEvent(new FocusEvent("blur"));
  await tick();
}

describe("row ordering gate", () => {
  it("injects one handle per row when the switch and the handler are both present", () => {
    view({ onRowReorder: vi.fn() });

    expect(handles()).toHaveLength(3);
  });

  it("injects nothing without the handler — there is nowhere for a move to land", () => {
    view({});

    expect(handles()).toHaveLength(0);
  });

  it("injects nothing while the switch is off", () => {
    view({ enableRowOrdering: false, onRowReorder: vi.fn() });

    expect(handles()).toHaveLength(0);
  });

  it("injects nothing for tree data", () => {
    view({ getSubRows: () => undefined, onRowReorder: vi.fn() });

    expect(handles()).toHaveLength(0);
  });

  it("gives pinned rows no handle — their order is pinning state, not data order", () => {
    view({
      defaultRowPinning: { bottom: ["3"], top: ["1"] },
      enableRowPinning: true,
      onRowReorder: vi.fn()
    });

    expect(handles()).toHaveLength(1);
  });

  it("keeps every handle while enableRowPinning is off, whatever rowPinning holds", () => {
    view({ defaultRowPinning: { bottom: [], top: ["1"] }, onRowReorder: vi.fn() });

    expect(handles()).toHaveLength(3);
  });

  it("disables the handles while sorting controls the visible order", async () => {
    const onRowReorder = vi.fn();
    view({ defaultSorting: [{ desc: false, id: "name" }], onRowReorder });

    const first = handle(0);
    expect(first.getAttribute("aria-disabled")).toBe("true");

    await keyDown(first, " ");
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    await keyDown(first, " ");
    expect(onRowReorder).not.toHaveBeenCalled();
  });
});

describe("keyboard reordering", () => {
  it("lifts, steps, announces, and commits arrayMove indexes", async () => {
    const onRowReorder = vi.fn();
    view({ onRowReorder });

    const first = handle(0);
    await keyDown(first, " ");

    expect(first.getAttribute("aria-pressed")).toBe("true");
    expect(announcer().textContent).toContain("Wireless Mouse lifted");

    await keyDown(first, "ArrowDown");

    // From rest the first step skips the no-op position: the row would land at index 1, shown
    // as "after Projector".
    expect(rowOf(handle(1)).dataset.dropSide).toBe("after");
    expect(announcer().textContent).toBe("After Projector");

    await keyDown(first, " ");

    expect(onRowReorder).toHaveBeenCalledTimes(1);
    const reorder = onRowReorder.mock.calls[0]![0] as DataTableRowReorder<Item>;
    expect(reorder.fromIndex).toBe(0);
    expect(reorder.toIndex).toBe(1);
    expect(reorder.row.id).toBe("1");
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Wireless Mouse dropped");
  });

  it("jumps to the edges with Home and End", async () => {
    const onRowReorder = vi.fn();
    view({ onRowReorder });

    const middle = handle(1);
    await keyDown(middle, " ");
    await keyDown(middle, "End");

    expect(rowOf(handle(2)).dataset.dropSide).toBe("after");
    expect(announcer().textContent).toBe("After Webcam");

    await keyDown(middle, "Home");

    expect(rowOf(handle(0)).dataset.dropSide).toBe("before");
    expect(announcer().textContent).toBe("Before Wireless Mouse");

    await keyDown(middle, " ");

    const reorder = onRowReorder.mock.calls[0]![0] as DataTableRowReorder<Item>;
    expect(reorder.fromIndex).toBe(1);
    expect(reorder.toIndex).toBe(0);
  });

  it("stepping into the wall from the first row shows no target", async () => {
    const onRowReorder = vi.fn();
    view({ onRowReorder });

    const first = handle(0);
    await keyDown(first, " ");
    await keyDown(first, "ArrowUp");

    expect(document.querySelector("[data-drop-side]")).toBeNull();

    // Dropping without a target is a drop back in place — announced, never committed.
    await keyDown(first, " ");
    expect(onRowReorder).not.toHaveBeenCalled();
    expect(announcer().textContent).toBe("Wireless Mouse dropped");
  });

  it("Escape cancels the lift without committing", async () => {
    const onRowReorder = vi.fn();
    view({ onRowReorder });

    const first = handle(0);
    await keyDown(first, " ");
    await keyDown(first, "ArrowDown");
    await keyDown(first, "Escape");

    expect(onRowReorder).not.toHaveBeenCalled();
    expect(document.querySelector("[data-drop-side]")).toBeNull();
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Reorder canceled");
  });

  it("focus leaving the handle abandons the lift", async () => {
    const onRowReorder = vi.fn();
    view({ onRowReorder });

    const first = handle(0);
    await keyDown(first, " ");
    await blur(first);

    expect(onRowReorder).not.toHaveBeenCalled();
    expect(first.hasAttribute("aria-pressed")).toBe(false);
    expect(announcer().textContent).toBe("Reorder canceled");
  });

  it("the lifted row dims in place through data-dragging", async () => {
    view({ onRowReorder: vi.fn() });

    const first = handle(0);
    await keyDown(first, " ");

    expect(Object.hasOwn(rowOf(first).dataset, "dragging")).toBe(true);

    await keyDown(first, "Escape");

    expect(Object.hasOwn(rowOf(first).dataset, "dragging")).toBe(false);
  });
});

function band(top: number, bottom: number) {
  return { bottom, top };
}

const measure = (row: { top: number; bottom: number }) => row;

describe("pointerDropEdge", () => {
  const rows = [band(0, 40), band(40, 80), band(80, 120)];

  it("splits a row at its midline", () => {
    expect(pointerDropEdge(rows, measure, 10)).toEqual({ row: rows[0], side: "before" });
    expect(pointerDropEdge(rows, measure, 30)).toEqual({ row: rows[0], side: "after" });
  });

  it("reads above every row as before the first and below every row as after the last", () => {
    expect(pointerDropEdge(rows, measure, -5)).toEqual({ row: rows[0], side: "before" });
    expect(pointerDropEdge(rows, measure, 500)).toEqual({ row: rows[2], side: "after" });
  });

  it("gives the gap between two rows to the row above", () => {
    const gapped = [band(0, 40), band(60, 100)];

    expect(pointerDropEdge(gapped, measure, 50)).toEqual({ row: gapped[0], side: "after" });
  });

  it("never lands on a zero-height row", () => {
    const collapsed = [band(0, 40), band(40, 40), band(40, 80)];

    expect(pointerDropEdge(collapsed, measure, 41)).toEqual({ row: collapsed[2], side: "before" });
    expect(pointerDropEdge([band(0, 0)], measure, 10)).toBeNull();
  });
});
