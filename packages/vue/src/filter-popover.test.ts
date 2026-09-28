import { nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableHandle } from "./types";

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

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { filter: "select" }
  }
];

/* ---- mounting ---- */

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>): VueWrapper {
  // The harness of data-table.test.ts: a definite-height host so the adaptive root has an
  // indefinite-parent-free start. jsdom lays nothing out, which is exactly the environment the
  // React edition's suite ran in.
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

/* ---- queries (the popover rides reka-ui's Popover root: panels TELEPORT to document.body,
 * so every open/closed question is a document-level query, never one against the wrapper) ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

const panel = () => q(".ledger-popover-panel");

const bodyRows = () => all(".ledger-tbody .ledger-row");

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/**
 * The React suite's waitFor counterpart: polls the assertion across Vue's microtask flushes AND
 * the macrotask queue — the text filter debounces through a real 200ms timer, which no number
 * of nextTicks will ever fire, and the reka popover's presence state machine settles a tick
 * after the open ref moves.
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

async function openFilter(columnName: string): Promise<void> {
  q(`[aria-label="Filter ${columnName}"]`)?.click();
  await eventually(() => expect(panel()).toBeTruthy());
}

/** fireEvent.change, jsdom edition: set the value, deliver the input event Vue listens for. */
function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("filter popover", () => {
  it("stays open while picking a combobox option and applies the filter", async () => {
    // Regression: in the React edition the Mantine select's dropdown lived in a body-level
    // portal, where picking an option read as an outside click and closed the whole filter
    // popover mid-interaction. The Vue select's list is inline inside the panel, but the
    // contract under test is the same one: picking an option is an inside-the-panel
    // interaction and the popover must survive it.
    mountTable({ columns, data: people, getRowId });

    await openFilter("Name");

    const selectTrigger = q(".ledger-select-trigger", panel()!);

    expect(selectTrigger).toBeTruthy();
    selectTrigger?.click();

    await eventually(() => expect(all(".ledger-select-option").length).toBeGreaterThan(0));

    const option = all(".ledger-select-option").find(candidate => candidate.textContent === "Alice");

    expect(option).toBeTruthy();
    option?.click();

    await eventually(() => expect(bodyRows()).toHaveLength(1));

    expect(panel()).toBeTruthy();
    expect(q(".ledger-tbody .ledger-row td")?.textContent).toBe("Alice");

    // The select's own clear button is the only clear affordance and carries the label.
    q("[aria-label=\"Clear filter\"]")?.click();

    await eventually(() => expect(bodyRows()).toHaveLength(3));
  });

  it("filters through the inline date-range inputs", async () => {
    // React title: "filters through the inline @mantine/dates range calendar" — this edition
    // draws the same range as two native date inputs carrying the YYYY-MM-DD strings the filter
    // fn compares (filter-popover.ts), so the calendar-day clicks become bound writes. The rows
    // are built around the current month so the bounds are deterministic on any run date.
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    interface Entry {
      id: string;
      day: string;
    }

    const entries: Entry[] = [
      { id: "1", day: `${month}-05` },
      { id: "2", day: `${month}-15` },
      { id: "3", day: `${month}-25` }
    ];

    const dateColumns: Array<ColumnDef<Entry, any>> = [
      {
        accessorKey: "day",
        header: "Day",
        meta: { filter: "date-range" }
      }
    ];

    mountTable({ columns: dateColumns, data: entries, getRowId: (entry: Entry) => entry.id });

    await openFilter("Day");

    const bound = (label: string) => q(`[aria-label="${label}"]`, panel()!) as HTMLInputElement;

    // One flush between writes — React's fireEvent each ran inside act(); the second bound reads
    // the state the first wrote, so it cannot land in the same synchronous block.
    setValue(bound("Min"), `${month}-10`);
    await tick();
    setValue(bound("Max"), `${month}-20`);

    await eventually(() => expect(bodyRows()).toHaveLength(1));

    // The inputs are inline in the panel (no nested portal), so the popover survives the interaction.
    expect(panel()).toBeTruthy();
    expect(q(".ledger-tbody .ledger-row td")?.textContent).toBe(`${month}-15`);

    // The caption under the inputs clears the whole range — and goes away with it.
    const clearCaption = () => all("button", panel()!).find(button => button.textContent === "Clear filter");

    expect(clearCaption()).toBeTruthy();
    clearCaption()?.click();

    await eventually(() => expect(bodyRows()).toHaveLength(3));
    expect(clearCaption()).toBeUndefined();
  });

  it("applies pending text when the popover closes", async () => {
    const textColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    mountTable({ columns: textColumns, data: people, getRowId });

    const trigger = q("[aria-label=\"Filter Name\"]");

    trigger?.click();
    await eventually(() => expect(q("input", panel()!)).toBeTruthy());

    const input = q("input", panel()!) as HTMLInputElement;

    setValue(input, "Alice");
    await tick();

    // The popover closes inside the 200ms window — no debounce wait ever passes — and the typed
    // filter must land with it (the React edition's flushOnUnmount, here flushOnDispose).
    trigger?.click();

    await eventually(() => expect(panel()).toBeNull());
    await eventually(() => expect(bodyRows()).toHaveLength(1));
  });

  it("synchronizes the text input when its filter is cleared externally", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const textColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    mountTable({ columns: textColumns, data: people, getRowId, handleRef });

    await openFilter("Name");

    const input = q("input", panel()!) as HTMLInputElement;

    setValue(input, "Alice");
    await eventually(() => expect(bodyRows()).toHaveLength(1));

    handleRef.value?.table.resetColumnFilters();

    await eventually(() => expect(bodyRows()).toHaveLength(3));
    expect(input.value).toBe("");
  });

  it("clears the applied text filter from the input's own clear button", async () => {
    const textColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    mountTable({ columns: textColumns, data: people, getRowId });

    await openFilter("Name");

    const input = q("input", panel()!) as HTMLInputElement;

    setValue(input, "Alice");
    await eventually(() => expect(bodyRows()).toHaveLength(1));

    q("[aria-label=\"Clear filter\"]")?.click();

    await eventually(() => expect(bodyRows()).toHaveLength(3));
    expect((q("input", panel()!) as HTMLInputElement).value).toBe("");
  });

  it("clears the range filter from the button at the end of its input row", async () => {
    interface Item {
      id: string;
      amount: number;
    }

    const items: Item[] = [
      { id: "1", amount: 5 },
      { id: "2", amount: 15 },
      { id: "3", amount: 25 }
    ];

    const rangeColumns: Array<ColumnDef<Item, any>> = [
      {
        accessorKey: "amount",
        header: "Amount",
        meta: { filter: "range" }
      }
    ];

    mountTable({ columns: rangeColumns, data: items, getRowId: (item: Item) => item.id });

    await openFilter("Amount");
    await eventually(() => expect(q("[aria-label=\"Min\"]", panel()!)).toBeTruthy());

    setValue(q("[aria-label=\"Min\"]", panel()!) as HTMLInputElement, "10");

    await eventually(() => expect(bodyRows()).toHaveLength(2));

    q("[aria-label=\"Clear filter\"]")?.click();

    await eventually(() => expect(bodyRows()).toHaveLength(3));
    expect((q("[aria-label=\"Min\"]", panel()!) as HTMLInputElement).value).toBe("");
  });

  it("cancels pending text when an external reset is a table-state no-op", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const textColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "text" }
      }
    ];

    mountTable({ columns: textColumns, data: people, getRowId, handleRef });

    await openFilter("Name");

    const input = q("input", panel()!) as HTMLInputElement;

    setValue(input, "Alice");
    // The flush stands in for React's act()-wrapped fireEvent: the control's re-render with the
    // typed value has to land before the reset rewrites it.
    await tick();

    handleRef.value?.table.resetColumnFilters();
    await tick();

    expect(input.value).toBe("");

    await new Promise<void>(resolve => {
      setTimeout(resolve, 250);
    });

    expect(bodyRows()).toHaveLength(3);
  });

  it("degrades a server-mode multi-select to text without carrying an array into the input", async () => {
    const multi: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { filter: "multi-select" }
      }
    ];

    mountTable({
      columns: multi,
      data: people,
      defaultColumnFilters: [{ id: "name", value: ["Carol", "Alice"] }],
      filterMode: "server",
      getRowId
    });

    await openFilter("Name");

    const input = q("input", panel()!) as HTMLInputElement;

    expect(input).toBeTruthy();
    expect(input.value).toBe("");
  });
});
