// The columns panel's drop target is resolved from the POINTER POSITION over the panel's own
// rows (operation.target does not resolve inside the teleported panel — see handleDragEnd).
// This suite captures the app-registered monitor listeners at mount and invokes them with
// crafted drag events, exactly as a real drag would deliver them.
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import type { ColumnDef, TableInstance } from "./types";

import { createColumnHelper, DataTableColumnsPanel, useDataTable } from "./index";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  email: string;
}

const people: Person[] = [
  { id: "1", name: "Carol", email: "carol@example.com" },
  { id: "2", name: "Alice", email: "alice@example.com" }
];

const getRowId = (person: Person) => person.id;

const helper = createColumnHelper<Person>();

const columns: Array<ColumnDef<Person, any>> = [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("email", { header: "Email" })
];

const hosts: Array<HTMLElement> = [];

const mountPanel = (): { wrapper: ReturnType<typeof mount>; table: TableInstance<Person> } => {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  const Harness = defineComponent({
    setup() {
      const table = useDataTable<Person>({
        data: people,
        columns,
        getRowId,
        enableColumnOrdering: true
      });

      (globalThis as any).__testTable = table;

      return () =>
        h("div", [
          h(DataTableColumnsPanel as never, { table } as never),
          h("div", { style: "height: 300px" }, [h("div", { class: "hook-host" })])
        ]);
    }
  });

  const wrapper = mount(Harness, { attachTo: host });

  return { wrapper, table: (globalThis as any).__testTable as TableInstance<Person> };
};

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

describe("columns panel drag reorder", () => {
  it("resolves the drop target from the pointer position and reorders the center columns", async () => {
    // capture the app-registered monitor listeners as they register
    const mod = await import("@dnd-kit/dom");
    const probe = new mod.DragDropManager();
    const monitorProto = Object.getPrototypeOf(probe.monitor);
    const listeners: Record<string, Array<(event: any) => void>> = {};
    const originalAdd = monitorProto.addEventListener;
    monitorProto.addEventListener = function (this: unknown, name: string, listener: (event: any) => void, ...rest: unknown[]) {
      (listeners[name] ??= []).push(listener);

      return (originalAdd as (...args: unknown[]) => unknown).call(this, name, listener, ...rest);
    };

    const { table } = mountPanel();
    await nextTick();

    monitorProto.addEventListener = originalAdd;
    expect((listeners.dragstart ?? []).length).toBeGreaterThan(0);
    expect((listeners.dragend ?? []).length).toBeGreaterThan(0);

    const panel = document.querySelector(".ledger-columns-panel") as HTMLElement;
    expect(panel).toBeTruthy();

    // the row rects as the panel laid them out: name first, email second. jsdom has no layout,
    // so the rows' rects are stubbed to their natural 36px-tall stacked geometry.
    const rows = [...panel.querySelectorAll("[data-column-id]")];
    rows.forEach((row, index) => {
      const y = index * 36;
      row.getBoundingClientRect = () => ({ x: 0, y, top: y, bottom: y + 36, left: 0, right: 338, width: 338, height: 36, toJSON: () => ({}) } as DOMRect);
    });
    const nameRect = rows.find(row => row.getAttribute("data-column-id") === "name")!.getBoundingClientRect();

    // the pointer lands over the NAME row (above the email row's own position)
    const pointerY = nameRect.y + nameRect.height / 2;
    const operation = {
      source: { id: "email" },
      target: null,
      position: { current: { x: nameRect.x + 10, y: pointerY } }
    };

    for (const listener of listeners.dragstart ?? []) {
      listener({ type: "dragstart", operation, canceled: false });
    }
    await nextTick();

    // the dragged row reads as dragging (the render layer binds draggedId)
    expect(document.querySelectorAll('.ledger-columns-panel-item[data-dragging]').length).toBeGreaterThan(0);

    for (const listener of listeners.dragend ?? []) {
      listener({ type: "dragend", operation, canceled: false });
    }
    await nextTick();
    await nextTick();

    // email moved above name: the order write lands in the table's columnOrder slice
    const order = table.atoms.columnOrder.get() as string[];
    expect(order.indexOf("email")).toBeLessThan(order.indexOf("name"));

    // and the panel's zone rows follow the new order
    const ids = [...document.querySelectorAll(".ledger-columns-panel-item")].map(el => el.getAttribute("data-column-id"));
    expect(ids.indexOf("email")).toBeLessThan(ids.indexOf("name"));
  });
});
