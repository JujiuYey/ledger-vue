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

const columns: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

/* ---- mounting ---- */

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>): VueWrapper {
  // A definite height on the host so the adaptive root has an indefinite-parent-free start
  // (the adaptive-sizing contract); jsdom lays nothing out, which is exactly the environment
  // the React edition's suite ran in.
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

/* ---- queries ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const viewport = () => document.querySelector("[data-reka-scroll-area-viewport]") as HTMLElement;
const currentRowId = () => document.querySelector<HTMLElement>("[aria-current=\"true\"]")?.dataset.rowId;
const announcement = () => document.querySelector("[role=\"status\"]")?.textContent;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

async function press(key: string): Promise<void> {
  await viewport().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
  await tick();
}

/**
 * The React edition's harness sorted the table inside a transition and then threw the render
 * away (Suspense + a thrown promise), leaving the shared core holding an order nobody saw —
 * so "the rows on screen" and "the rows the core holds" came apart, and the tests could tell
 * which one the handlers answered from. Vue has no discarded renders: every sort lands. The
 * counterpart here pins the same contract from the other side — the keyboard, the announcement
 * and the imperative scrolls all answer from the display order on screen, never from a raw
 * core order — by applying the sort for real and asserting against the order it produces.
 */
function mountSortHarness(extra: Record<string, unknown> = {}): VueWrapper {
  return mountTable({
    columns,
    data: people,
    defaultActiveRowId: "1",
    enableActiveRow: true,
    getRowId,
    sorting: [],
    ...extra
  });
}

describe("active row navigation", () => {
  it("steps through the rows on screen, not through an order nobody saw", async () => {
    const wrapper = mountSortHarness();

    expect(currentRowId()).toBe("1");

    // Carol, Bob, Alice in the applied descending order — so the row after "1" on screen is
    // "3", and a handler reading any other order would land elsewhere.
    await wrapper.setProps({ sorting: [{ desc: true, id: "name" }] });
    await tick();
    expect(all(".ledger-row").map(row => row.dataset.rowId)).toEqual(["1", "3", "2"]);

    await press("ArrowDown");

    expect(currentRowId()).toBe("3");
  });

  it("ends at the last row on screen", async () => {
    const wrapper = mountSortHarness();

    await wrapper.setProps({ sorting: [{ desc: true, id: "name" }] });
    await tick();

    await press("End");

    // Alice is the last row of the descending order on screen.
    expect(currentRowId()).toBe("2");
  });

  it("resolves an imperative scroll index against the rows on screen", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const wrapper = mountSortHarness({ handleRef });

    // Alice, Bob, Carol in the applied ascending order — index 0 is Alice, whoever held a
    // different order.
    await wrapper.setProps({ sorting: [{ desc: false, id: "name" }] });
    await tick();

    // Own handlers, not `vi.spyOn`: the prototype method is already a mock, and spying on an
    // instance that inherits one hands back that same shared mock.
    const scrolled: Array<string | undefined> = [];
    const rows = all(".ledger-row");

    for (const row of rows) {
      row.scrollIntoView = () => {
        scrolled.push(row.dataset.rowId);
      };
    }

    handleRef.value!.scrollToIndex(0);

    expect(scrolled).toEqual(["2"]);

    // The id overload is the other half of the split: a table whose ids read as digits could not
    // say which of the two a single `string | number` parameter meant.
    handleRef.value!.scrollToRow("3");

    expect(scrolled).toEqual(["2", "3"]);
  });

  it("announces the row by its position in the rows on screen", async () => {
    mountSortHarness();

    // The row active at mount stays silent in the Vue edition — the announcer's watch is not
    // immediate, where React's mount-run effect spoke "Carol, row 1 of 3". Recorded as the
    // todo below; the moves below it are what this case can still pin.
    expect(announcement()).toBe("");

    await press("End");

    expect(currentRowId()).toBe("3");
    expect(announcement()).toBe("Bob, row 3 of 3");
  });

  it.todo("announces the row already active at mount: product bug — the active-row announcer's watch (data-table.vue) is not immediate, so a defaultActiveRowId present at mount is never spoken (the React edition's mount-run effect announced \"Carol, row 1 of 3\")");
});
