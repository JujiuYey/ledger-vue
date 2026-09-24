import { nextTick } from "vue";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
}

const people: Person[] = Array.from({ length: 30 }, (_, index) => {
  return {
    id: String(index + 1),
    name: `Person ${index + 1}`
  };
});

const getRowId = (person: Person) => person.id;
const columns = [{ accessorKey: "name", header: "Name" }];

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

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/** The rows-per-page control: a select-only combobox labelled by its own visible caption. */
function pageSizeValue(): string | null {
  return q(".ledger-select-value")?.textContent ?? null;
}

async function openPageSizeOptions(): Promise<void> {
  await q("[role=\"combobox\"]", q(".ledger-pagination-bar") as ParentNode)?.dispatchEvent(
    new MouseEvent("click", { bubbles: true })
  );
  await tick();
}

const openOptionTexts = () => all("[role=\"option\"]").map(option => option.textContent ?? "");

describe("pagination bar", () => {
  // The bar is mounted with an explicit `withPaginationBar: true` throughout: its documented
  // default (true) is broken — data-table.vue gates the bar on the raw prop, which is undefined
  // unless passed (see the todo in data-table.test.ts).

  it("offers the page size on screen even when it is not one of the options", async () => {
    mountTable({
      columns,
      data: people,
      defaultPagination: { pageIndex: 0, pageSize: 7 },
      enablePagination: true,
      getRowId,
      withPaginationBar: true
    });
    await tick();

    // A select whose value is absent from its data renders blank.
    expect(pageSizeValue()).toBe("7");
    expect(all(".ledger-tbody .ledger-row")).toHaveLength(7);
  });

  it("shows a listed page size once, in ascending order", async () => {
    mountTable({
      columns,
      data: people,
      defaultPagination: { pageIndex: 0, pageSize: 20 },
      enablePagination: true,
      getRowId,
      pageSizeOptions: [50, 20, 10],
      withPaginationBar: true
    });
    await tick();

    expect(pageSizeValue()).toBe("20");

    await openPageSizeOptions();

    // The current size is already listed — it must not appear twice, and the order a reader
    // sees does not depend on how it got there.
    expect(openOptionTexts()).toEqual(["10", "20", "50"]);
  });

  it("sorts an unlisted current page size into place", async () => {
    mountTable({
      columns,
      data: people,
      defaultPagination: { pageIndex: 0, pageSize: 25 },
      enablePagination: true,
      getRowId,
      pageSizeOptions: [50, 10],
      withPaginationBar: true
    });
    await tick();

    await openPageSizeOptions();

    expect(openOptionTexts()).toEqual(["10", "25", "50"]);
  });
});
