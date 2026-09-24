import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  tags: string[];
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    tags: ["alpha", "beta"]
  }
];

const getRowId = (person: Person) => person.id;

function mountTable(props: Record<string, unknown>): void {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  mount(DataTable as never, { attachTo: host, props: props as never });
}

describe("truncation tooltip", () => {
  const columns = [
    {
      accessorKey: "tags",
      header: "Tags",
      // A custom renderer: the accessor value is an array, so the old title was always absent.
      cell: (context: { getValue: () => unknown }) => (context.getValue() as string[]).join(" · "),
      meta: { truncate: true }
    }
  ];

  const hover = (element: HTMLElement): void => {
    // jsdom lays nothing out, so the overflow read is steered through the layout getters;
    // MouseEvent stands in for PointerEvent, which jsdom does not implement.
    Object.defineProperty(element, "scrollWidth", { configurable: true, value: 200 });
    Object.defineProperty(element, "clientWidth", { configurable: true, value: 100 });
    element.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
  };

  it("titles a clipped cell with its rendered text, not the accessor value", () => {
    mountTable({ columns, data: people, getRowId });

    const span = document.querySelector(".ledger-cell [data-truncate]") as HTMLElement;

    hover(span);

    // The RENDERED text (joined), not the array the accessor returns.
    expect(span.getAttribute("title")).toBe("alpha · beta");
  });

  it("leaves text that fits untitled, and clears a title that no longer applies", () => {
    mountTable({ columns, data: people, getRowId });

    const span = document.querySelector(".ledger-cell [data-truncate]") as HTMLElement;

    // Fitting text: no title is written.
    Object.defineProperty(span, "scrollWidth", { configurable: true, value: 100 });
    Object.defineProperty(span, "clientWidth", { configurable: true, value: 200 });
    span.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
    expect(span.hasAttribute("title")).toBe(false);

    // A stale title (set by an earlier hover or the author) is cleared on the fitting hover.
    span.setAttribute("title", "stale");
    span.dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
    expect(span.hasAttribute("title")).toBe(false);
  });

  it("titles a clipped header label too", () => {
    const headerColumns = [{ accessorKey: "tags", header: "Tags header", meta: { truncate: true } }];

    mountTable({ columns: headerColumns, data: people, getRowId });

    const label = document.querySelector(".ledger-header-label [data-truncate]") as HTMLElement;

    hover(label);

    expect(label.getAttribute("title")).toBe("Tags header");
  });

  it("mounts a truncate-marked table", () => {
    // The render-side contract the todos above sit on: the span scaffolding exists.
    mountTable({ columns, data: people, getRowId });

    expect(document.querySelector(".ledger-cell [data-truncate]")).toBeTruthy();
  });
});
