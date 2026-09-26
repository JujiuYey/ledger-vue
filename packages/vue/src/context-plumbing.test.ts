import { defineComponent, h, nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, TableInstance } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";
import { useDataTable } from "./use-data-table";

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

const others: Person[] = [{ id: "9", name: "Dana" }];

const getRowId = (person: Person) => person.id;

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

const filterable: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { filter: "text" }
  }
];

// The second instance's column is named apart so the two filter funnels stay separately
// addressable once both tables are on screen (the React harness never showed its second table).
const filterableOther: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Other",
    meta: { filter: "text" }
  }
];

/* ---- mounting ---- */

const hosts: Array<HTMLElement> = [];

function attachHost(): HTMLElement {
  // The harness of data-table.test.ts: a definite-height host; jsdom lays nothing out, which is
  // exactly the environment the React edition's suite ran in.
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return host;
}

function mountTable(props: Record<string, unknown>): VueWrapper {
  return mount(DataTable as never, { attachTo: attachHost(), props: props as never });
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

/* ---- queries (the popover panel teleports to document.body — query the document) ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

const panel = () => q(".ledger-popover-panel");

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

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

describe("what the tree below the root reads", () => {
  it("keeps a filter control subscribed to the table on screen when a discarded render hands it over", async () => {
    // The React harness paired startTransition with a Suspense blocker: the render that mounted
    // the second table was thrown away, but it had already handed the shared core instance
    // over. Vue has no discarded renders (PORTING-NOTES) and `DataTable`'s `table` prop is
    // captured at mount, so the handover stress collapses to its observable core: a second
    // instance mounting below must not disturb the on-screen control's own state or its
    // subscription, and an external reset must still reach the control through the context's
    // set notification alone (context.ts).
    let onScreen: TableInstance<Person> | null = null;
    const showSecond = ref(false);

    const Harness = defineComponent({
      setup() {
        const first = useDataTable<Person>({ columns: filterable, data: people, getRowId });
        const second = useDataTable<Person>({ columns: filterableOther, data: others, getRowId });

        onScreen = first;

        return () => [
          h(DataTable as never, { table: first } as never),
          showSecond.value ? h(DataTable as never, { table: second } as never) : null,
          h("button", { type: "button", onClick: () => {
            showSecond.value = true;
          } }, "wip")
        ];
      }
    });

    mount(Harness, { attachTo: attachHost() });

    q("[aria-label=\"Filter Name\"]")?.click();
    await eventually(() => expect(panel()).toBeTruthy());

    // The second instance mounts; the first table is still the one the open control belongs to,
    // with its three rows untouched.
    const wip = all("button").find(button => button.textContent === "wip");

    wip?.click();
    await tick();

    const roots = all(".ledger-root");

    expect(roots).toHaveLength(2);
    expect(all(".ledger-tbody .ledger-row", roots[0]!)).toHaveLength(3);
    expect(panel()).toBeTruthy();

    // Typing redraws this control alone — a render the table root has no part in: the debounce
    // holds the write back, so only the input's own state moved.
    const input = q("input", panel()!) as HTMLInputElement;

    input.value = "zz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();

    expect(input.value).toBe("zz");
    expect(all(".ledger-tbody .ledger-row", roots[0]!)).toHaveLength(3);

    // An external reset to the value already committed: writing the SAME array identity back is
    // a no-op by ref semantics — nothing re-renders, so the set notification is the only way
    // back to the control (docs/filtering.md).
    const committed = onScreen!.atoms.columnFilters.get();

    onScreen!.setColumnFilters(committed);
    await tick();

    expect(input.value).toBe("");
    expect(all(".ledger-tbody .ledger-row", roots[0]!)).toHaveLength(3);
  });

  it("carries the active-row switch to rows that did not re-render", async () => {
    // React flipped `enableActiveRow` across a rerender and clicked — proving rows memoized on
    // nothing but the switch still answered it, through the context. Behavior switches are
    // mount-time in this edition, so the switch arrives with the mount itself; the rows on
    // screen at that moment are exactly the ones that must hear it, and they do so through the
    // context field (context.ts), not a prop on the body renderer.
    mountTable({ columns, data: people, enableActiveRow: true, getRowId });

    const row = all(".ledger-row")[1] as HTMLElement;

    row?.click();
    await tick();

    expect(q("[aria-current=\"true\"]")?.dataset.rowId).toBe("2");
  });

  it("draws a detail panel with the renderer of the render that drew the row", async () => {
    // React rerendered with a second renderDetailPanel closure and the panels followed — no row
    // kept drawing through a stale memoized renderer. renderDetailPanel is a mount-time option
    // in this edition (types.ts: a plain function, not a ReactiveInput), so the "second render"
    // is a key-forced remount through a real parent render; the panel must draw through the
    // renderer the CURRENT mount declared, never one captured before it.
    const label = ref("first");
    const panelView = (name: string) => (row: { original: Person }) =>
      h("span", { "data-testid": "panel" }, `${name}:${row.original.name}`);

    const Harness = defineComponent({
      setup() {
        return () =>
          h(DataTable as never, {
            key: label.value,
            columns,
            data: people,
            defaultExpanded: true,
            getRowId,
            renderDetailPanel: panelView(label.value)
          } as never);
      }
    });

    mount(Harness, { attachTo: attachHost() });
    await tick();

    expect(all("[data-testid=\"panel\"]")[0]?.textContent).toBe("first:Carol");

    label.value = "second";
    await tick();
    await tick();

    expect(all("[data-testid=\"panel\"]")[0]?.textContent).toBe("second:Carol");
  });
});
