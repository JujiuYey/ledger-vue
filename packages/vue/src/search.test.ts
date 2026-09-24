import { defineComponent, h, nextTick } from "vue";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTableSearch } from "./search";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

const rows = [{ id: "1", name: "Alice" }];
const columns = [{ accessorKey: "name", header: "Name" }];

const hosts: Array<HTMLElement> = [];

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

function mountHarness(): void {
  const host = document.createElement("div");

  host.style.height = "400px";
  document.body.appendChild(host);
  hosts.push(host);

  const Harness = defineComponent({
    setup() {
      const table = useDataTable({
        data: rows,
        columns,
        getRowId: row => row.id,
        enableGlobalFilter: true
      });

      return () => [
        h(DataTableSearch, { debounce: 200, table } as never),
        h("button", {
          onClick: () => table.resetGlobalFilter(true),
          type: "button"
        }, "External reset"),
        h("output", { "data-testid": "filter-value" }, String(table.atoms.globalFilter.get() ?? ""))
      ];
    }
  });

  mount(Harness, { attachTo: host });
}

const textbox = (): HTMLInputElement => document.querySelector(".ledger-search input") as HTMLInputElement;
const filterValue = (): string | null => document.querySelector("[data-testid=\"filter-value\"]")?.textContent ?? null;

async function type(text: string): Promise<void> {
  const input = textbox();

  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

describe("DataTableSearch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cancels a pending search when cleared", async () => {
    mountHarness();
    await nextTick();

    await type("Alice");
    await textbox()
      ?.closest(".ledger-search")
      ?.querySelector<HTMLButtonElement>("[aria-label=\"Clear filter\"]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    vi.advanceTimersByTime(250);

    expect(filterValue()).toBe("");
  });

  it("cancels a pending search when the filter resets externally", async () => {
    mountHarness();
    await nextTick();

    await type("Alice");

    document
      .querySelector("button")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    vi.advanceTimersByTime(250);
    await nextTick();

    expect(textbox().value).toBe("");
    expect(filterValue()).toBe("");
  });
});
