import { defineComponent, h, nextTick } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, UseDataTableOptions } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SELECTION_COLUMN_ID } from "./build-columns";
import { DataTableColumnsPanel } from "./columns-panel";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  email: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    email: "carol@x.dev",
    age: 30
  },
  {
    id: "2",
    name: "Alice",
    email: "alice@x.dev",
    age: 25
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    size: 130
  },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "age", header: "Age" }
];

/* ---- mounting ---- */

const hosts: Array<HTMLElement> = [];

function attachHost(): HTMLElement {
  // A definite-height host, as in data-table.test.ts — the panel itself has no height needs,
  // but the harness stays identical across this suite.
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return host;
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

/**
 * The panel with no trigger — its primary shape, and the reason a test never has to open a
 * popover first (the React suite's `Panel` helper on the Vue harness).
 */
function mountPanel(options: Partial<UseDataTableOptions<Person>> = {}): VueWrapper {
  const host = attachHost();
  const Harness = defineComponent({
    setup() {
      const table = useDataTable<Person>({
        data: people,
        columns,
        getRowId: person => person.id,
        ...options
      } as UseDataTableOptions<Person>);

      return () => h(DataTableColumnsPanel as never, { table } as never);
    }
  });

  return mount(Harness, { attachTo: host });
}

/** The panel with a trigger in the default slot — the popover shape (a bare panel renders no rows). */
function mountPanelWithTrigger(): VueWrapper {
  const host = attachHost();
  const Harness = defineComponent({
    setup() {
      const table = useDataTable<Person>({
        data: people,
        columns,
        getRowId: person => person.id
      });

      return () =>
        h(DataTableColumnsPanel as never, { table } as never, {
          default: () => h("button", { type: "button" }, "Columns")
        });
    }
  });

  return mount(Harness, { attachTo: host });
}

/* ---- queries (the React suite's roles, read straight off the DOM) ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

const rows = () => all(".ledger-columns-panel-item");

/**
 * The column name a row shows — read from the checkbox label, not the row's `textContent`: the
 * pin segments carry accessible names that would leak into the latter.
 */
const titleOf = (row: HTMLElement) => row.querySelector(".ledger-columns-panel-label")?.textContent;

const titles = () => rows().map(row => titleOf(row));

const rowFor = (title: string) => rows().find(row => titleOf(row)?.includes(title))!;

const visibilityBox = (title: string) => rowFor(title).querySelector("input[type=\"checkbox\"]") as HTMLInputElement;

const widthInput = (title: string) => rowFor(title).querySelector("[aria-label=\"Width\"]") as HTMLInputElement;

const buttonByLabel = (label: string, root: ParentNode = document): HTMLElement | null =>
  all("button", root).find(button => button.getAttribute("aria-label") === label) ?? null;

const buttonByText = (text: string): HTMLElement | null =>
  all("button").find(button => button.textContent?.trim() === text) ?? null;

const zoneCaption = (text: string) =>
  all(".ledger-columns-panel-zone-label").find(caption => caption.textContent === text) ?? null;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/**
 * The React suite's waitFor counterpart, for the one test that opens the popover: the reka
 * presence state machine settles a tick or two after the open ref moves.
 */
async function eventually(assertion: () => void, timeout = 1500): Promise<void> {
  const start = Date.now();

  for (;;) {
    try {
      await tick();
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeout) {
        throw error;
      }

      await new Promise(resolve => {
        setTimeout(resolve, 10);
      });
    }
  }
}

describe("DataTable.ColumnsPanel", () => {
  it("renders bare, keeps hidden columns listed, and never lists ledger's injected columns", async () => {
    mountPanel({ defaultColumnVisibility: { email: false }, enableRowSelection: true });

    expect(titles()).toEqual(["Name", "Email", "Age"]);
    expect(document.body.innerHTML).not.toContain(SELECTION_COLUMN_ID);

    // The trap door this panel exists to close: a hidden column stays listed, so it can come
    // back without a page refresh. `data-hidden` is the stylesheet's hook for dimming the name.
    expect(visibilityBox("Email").checked).toBe(false);
    expect(rowFor("Email").dataset.hidden).toBe("true");

    visibilityBox("Email").click();
    await tick();

    expect(visibilityBox("Email").checked).toBe(true);
    expect(rowFor("Email").dataset.hidden).toBeUndefined();
  });

  it("names a row from meta.label ahead of the header, and the id only as a last resort", () => {
    const labelled: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { label: "Full name" }
      },
      // A render-function header has no text to fall back on — meta.label is the fix; without
      // either, the raw column id leaks into the panel.
      {
        id: "email",
        accessorKey: "email",
        header: () => h("span", "Email"),
        meta: { label: "Email address" }
      },
      {
        id: "age",
        accessorKey: "age",
        header: () => h("span", "Age")
      }
    ];

    mountPanel({ columns: labelled });

    expect(titles()).toEqual(["Full name", "Email address", "age"]);
  });

  it("disables the checkbox of a column that declares it cannot hide", () => {
    const fixed: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        enableHiding: false
      },
      { accessorKey: "age", header: "Age" }
    ];

    mountPanel({ columns: fixed });

    expect(visibilityBox("Name").disabled).toBe(true);
    expect(visibilityBox("Age").disabled).toBe(false);
  });

  it("moves a column through the three pin states", async () => {
    const onColumnPinningChange = vi.fn();

    mountPanel({ onColumnPinningChange });

    buttonByLabel("Pin to start", rowFor("Name"))?.click();
    await tick();
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: ["name"], end: [] });

    buttonByLabel("Pin to end", rowFor("Name"))?.click();
    await tick();
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: [], end: ["name"] });

    buttonByLabel("Unpin", rowFor("Name"))?.click();
    await tick();
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: [], end: [] });
  });

  it("never leaks ledger's injected column ids into the pinning slice", async () => {
    const onColumnPinningChange = vi.fn();

    mountPanel({ enableRowSelection: true, onColumnPinningChange });

    buttonByLabel("Pin to end", rowFor("Age"))?.click();
    await tick();

    // `atoms.columnPinning` carries the merged `ledger:select`, so any write derived from it
    // would echo that id back to the consumer and into persisted layout.
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: [], end: ["age"] });
  });

  it("lists the pinned zones ahead of the centre, in the table's display order", () => {
    mountPanel({ defaultColumnPinning: { start: ["age"], end: ["name"] } });

    expect(titles()).toEqual(["Age", "Email", "Name"]);
  });

  it("captions the pinned zones, and shows no captions while nothing is pinned", () => {
    const flat = mountPanel();

    expect(zoneCaption("Pinned start")).toBeNull();
    expect(zoneCaption("Pinned end")).toBeNull();

    flat.unmount();
    mountPanel({ defaultColumnPinning: { start: ["age"], end: ["name"] } });

    expect(zoneCaption("Pinned start")).toBeTruthy();
    expect(zoneCaption("Pinned end")).toBeTruthy();
  });

  it("fixes a width and clears it back to auto", async () => {
    const onColumnSizingChange = vi.fn();

    mountPanel({ enableColumnResizing: true, onColumnSizingChange });

    expect(widthInput("Name").value).toBe("");

    widthInput("Name").value = "160";
    widthInput("Name").dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // The override also survives at rest, as the row's dimmed width mark.
    expect(rowFor("Name").querySelector(".ledger-columns-panel-width-mark")?.textContent).toBe("160px");

    // Cleared means "no override", not zero: the entry is dropped entirely, so the width engine
    // reads the column as unsized again (docs/sizing.md) — and the mark goes with it.
    widthInput("Name").value = "";
    widthInput("Name").dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});
    expect(rowFor("Name").querySelector(".ledger-columns-panel-width-mark")).toBeNull();
  });

  it("shows what an unset width actually falls back to, never a blanket Auto", () => {
    mountPanel({ enableColumnResizing: true });

    // `name` declares `size: 130`, so clearing its override returns it to 130 — not to grow.
    // The placeholder has to say so, or the field lies about a fixed column.
    expect(widthInput("Name").placeholder).toBe("130");
    expect(widthInput("Email").placeholder).toBe("Auto");
  });

  it("offers width and grouping only while the table enables them", async () => {
    const bare = mountPanel();

    expect(widthInput("Name")).toBeNull();
    expect(q("[aria-label=\"Group by this column\"]", rowFor("Name"))).toBeNull();
    expect(all(".ledger-columns-panel-handle")).toHaveLength(0);

    bare.unmount();

    // Behavior switches are mount-time in this edition, so the React rerender is a fresh mount.
    mountPanel({ enableColumnOrdering: true, enableColumnResizing: true, enableGrouping: true });
    await tick();

    expect(widthInput("Name")).toBeTruthy();
    expect(q("[aria-label=\"Group by this column\"]", rowFor("Name"))).toBeTruthy();
    expect(all(".ledger-columns-panel-handle")).toHaveLength(3);
  });

  it("groups and ungroups through the panel, the only built-in trigger there is", async () => {
    const onGroupingChange = vi.fn();

    mountPanel({ enableGrouping: true, onGroupingChange });

    buttonByLabel("Group by this column", rowFor("Name"))?.click();
    await tick();
    expect(onGroupingChange).toHaveBeenLastCalledWith(["name"]);

    buttonByLabel("Ungroup", rowFor("Name"))?.click();
    await tick();
    expect(onGroupingChange).toHaveBeenLastCalledWith([]);
  });

  it("resets to the layout the application declared, not to an empty one", async () => {
    const onColumnPinningChange = vi.fn();

    mountPanel({ defaultColumnPinning: { start: ["name"], end: [] }, onColumnPinningChange });

    buttonByLabel("Unpin", rowFor("Name"))?.click();
    await tick();
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: [], end: [] });

    buttonByText("Reset")?.click();
    await tick();

    // Every TanStack resetColumnX() restores `table.initialState`, which useDataTable seeds from
    // the defaultX options — without that seeding the reset would land on an empty slice.
    expect(onColumnPinningChange).toHaveBeenLastCalledWith({ start: ["name"], end: [] });
  });

  it("opens from whatever trigger it is handed, and assumes nothing about it", async () => {
    mountPanelWithTrigger();

    expect(rows()).toHaveLength(0);

    buttonByText("Columns")?.click();

    // The panel opens in a popover that teleports to document.body — the rows are never under
    // the trigger's own wrapper, and the reka presence state machine settles a tick after the
    // open ref moves.
    await eventually(() => expect(titles()).toEqual(["Name", "Email", "Age"]));
  });
});
