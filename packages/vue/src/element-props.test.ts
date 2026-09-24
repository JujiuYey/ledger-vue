import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { mergeElementProps, resolveElementProps } from "./element-props";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  age: number;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30
  },
  {
    id: "2",
    name: "Alice",
    age: 25
  }
];

const getRowId = (person: Person) => person.id;

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

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

describe("mergeElementProps", () => {
  it("lets ledger's structural props win while class and style compose", () => {
    const merged: Record<string, unknown> = mergeElementProps(
      {
        class: "app-row",
        role: "presentation",
        style: {
          color: "red",
          margin: 4
        },
        "data-app": "yes"
      },
      {
        class: "ledger-row",
        role: "row",
        style: {
          color: "blue",
          padding: 8
        },
        "data-row-id": "1"
      }
    );

    expect(merged.role).toBe("row");
    // Vue edition: the composed key is `class` (the tests' `className` expectation becomes
    // `class`).
    expect(merged.class).toBe("ledger-row app-row");
    expect(merged.style).toEqual({
      color: "red",
      margin: 4,
      padding: 8
    });
    expect(merged["data-app"]).toBe("yes");
    expect(merged["data-row-id"]).toBe("1");
  });

  it("chains a handler both sides declare, ledger's first", () => {
    const order: string[] = [];
    const merged = mergeElementProps(
      { onClick: () => { order.push("consumer"); } },
      { onClick: () => { order.push("ledger"); } }
    );

    merged.onClick();
    expect(order).toEqual(["ledger", "consumer"]);
  });

  it("lets a consumer style entry override ledger's own inline value", () => {
    // The escape hatch is only one if it can win; a pinned cell's sticky offset included.
    const merged: Record<string, unknown> = mergeElementProps(
      { style: { insetInlineStart: 40 } },
      { style: { insetInlineStart: 0, position: "sticky" } }
    );

    expect(merged.style).toEqual({ insetInlineStart: 40, position: "sticky" });
  });

  it("keeps the consumer's value where ledger's own prop is undefined", () => {
    const onClick = vi.fn();
    const merged: Record<string, unknown> = mergeElementProps(
      { onClick },
      { onClick: undefined, role: "cell" }
    );

    (merged.onClick as () => void)();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("passes ledger's own props straight through when there are none to merge", () => {
    const owned = { role: "row" };

    expect(mergeElementProps(undefined, owned)).toBe(owned);
  });

  it("leaves class undefined when neither side sets one", () => {
    const merged: Record<string, unknown> = mergeElementProps({ "data-app": "yes" }, { role: "row" });

    expect(merged.class).toBeUndefined();
  });

  it("resolves the static and per-subject forms alike", () => {
    expect(resolveElementProps<{ id: string }, string>({ id: "static" }, "subject"))
      .toEqual({ id: "static" });
    expect(resolveElementProps<{ id: string }, string>(
      subject => {
        return { id: subject };
      },
      "subject"
    )).toEqual({ id: "subject" });
    expect(resolveElementProps(undefined, "subject")).toBeUndefined();
  });
});

describe("DOM prop escape hatches", () => {
  it("applies rowProps per row without displacing the state contract", async () => {
    const onRowClick = vi.fn();
    const onRowMouseEnter = vi.fn();
    const wrapper = mountTable({
      columns: [{ accessorKey: "name", header: "Name" }],
      data: people,
      getRowId,
      onRowClick,
      rowProps: (row: { id: string; original: Person }) => {
        return {
          class: row.original.age > 28 ? "senior" : undefined,
          "data-testid": `row-${row.id}`,
          onMouseenter: onRowMouseEnter,
          style: { opacity: 0.5 }
        };
      }
    });
    await tick();

    const first = q("[data-row-id=\"1\"]");

    expect(first?.className).toContain("ledger-row");
    expect(first?.className).toContain("senior");
    expect(first?.getAttribute("data-testid")).toBe("row-1");
    expect(first?.style.opacity).toBe("0.5");
    expect(first?.getAttribute("role")).toBe("row");
    expect(q("[data-row-id=\"2\"]")?.className).not.toContain("senior");

    await first?.dispatchEvent(new MouseEvent("mouseenter"));
    expect(onRowMouseEnter).toHaveBeenCalledTimes(1);

    // The consumer handler composes with ledger's own rather than replacing it.
    await first?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(onRowClick).toHaveBeenCalledTimes(1);

    await wrapper.unmount();
  });

  it("applies meta.cellProps, meta.headerCellProps, and meta.footerCellProps", async () => {
    const onCellClick = vi.fn();
    const wrapper = mountTable({
      columns: [
        {
          accessorKey: "name",
          footer: "Total",
          header: "Name",
          meta: {
            cellProps: (cell: { row: { id: string } }) => {
              return {
                "data-testid": `cell-${cell.row.id}`,
                onClick: onCellClick
              };
            },
            footerCellProps: { "data-testid": "name-footer" },
            headerCellProps: { "data-testid": "name-header" }
          }
        }
      ],
      data: people,
      getRowId
    });
    await tick();

    const cell = q("[data-testid=\"cell-1\"]");

    expect(cell?.getAttribute("role")).toBe("cell");
    expect(cell?.getAttribute("data-ledger-column-id")).toBe("name");
    expect(q("[data-testid=\"name-header\"]")?.getAttribute("role")).toBe("columnheader");
    expect(q("[data-testid=\"name-footer\"]")?.getAttribute("role")).toBe("cell");

    await cell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCellClick).toHaveBeenCalledTimes(1);

    await wrapper.unmount();
  });

  it("composes headerRowProps, footerRowProps, and viewportProps", async () => {
    const onScroll = vi.fn();
    const wrapper = mountTable({
      columns: [
        {
          accessorKey: "name",
          footer: "Total",
          header: "Name"
        }
      ],
      data: people,
      footerRowProps: { "data-testid": "footer-row" },
      getRowId,
      headerRowProps: (group: { depth: number }) => { return { "data-testid": `header-row-${group.depth}` }; },
      viewportProps: { "data-testid": "viewport", onScroll }
    });
    await tick();

    expect(q("[data-testid=\"header-row-0\"]")?.getAttribute("role")).toBe("row");
    expect(q("[data-testid=\"footer-row\"]")?.getAttribute("role")).toBe("row");

    const viewport = q("[data-testid=\"viewport\"]");

    // ledger's own viewport styling survives the merge.
    expect(viewport?.style.overscrollBehavior).toBe("none");

    await viewport?.dispatchEvent(new Event("scroll", { bubbles: true }));
    expect(onScroll).toHaveBeenCalledTimes(1);

    await wrapper.unmount();
  });
});
