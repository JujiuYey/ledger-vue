import type { ColumnDef } from "./types";

import { defineComponent, h, nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyCenterOrder,
  moveColumnBeside,
  reorderColumnWithinZone,
  resolveColumnOrder
} from "./column-order";
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
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "age", header: "Age" }
];

const getRowId = (person: Person) => person.id;

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope (effect-scope disposal included). `act(...)` becomes
 * `set + await nextTick()` — the adapter syncs table options on a pre-flush watcher, so state
 * assertions read `table.atoms.<slice>.get()` (the Vue edition's `table.state`) after the tick.
 */
function useTableInSetup<T>(composable: () => T): T {
  let result!: T;

  const Host = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    }
  });

  mount(Host);

  return result;
}

describe("moveColumnBeside", () => {
  it("inserts on the requested side of the target", () => {
    expect(moveColumnBeside(["a", "b", "c"], "c", { id: "a", side: "before" })).toEqual(["c", "a", "b"]);
    expect(moveColumnBeside(["a", "b", "c"], "a", { id: "c", side: "after" })).toEqual(["b", "c", "a"]);
  });

  it("returns the order untouched when the target is no longer in it", () => {
    const order = ["a", "b"];

    expect(moveColumnBeside(order, "a", { id: "gone", side: "before" })).toBe(order);
  });
});

describe("applyCenterOrder", () => {
  it("permutes the center slots and leaves pinned columns sitting where they are", () => {
    // `email` is pinned, so its slot in the flat order is inert — it renders from its
    // columnPinning index instead, and must not be displaced by a center reorder.
    expect(applyCenterOrder(["name", "email", "age"], ["age", "name"])).toEqual(["age", "email", "name"]);
  });

  it("is a no-op for an unchanged sequence", () => {
    expect(applyCenterOrder(["a", "b", "c"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("resolveColumnOrder", () => {
  it("falls back to definition order while the slice is empty", () => {
    const table = useTableInSetup(() => useDataTable({
      data: people,
      columns,
      getRowId
    }));

    expect(resolveColumnOrder(table)).toEqual(["name", "email", "age"]);
  });

  it("drops ids the table no longer defines and appends the ones it never mentioned", () => {
    const table = useTableInSetup(() => useDataTable({
      data: people,
      columns,
      getRowId,
      defaultColumnOrder: ["age", "gone", "name"]
    }));

    expect(resolveColumnOrder(table)).toEqual(["age", "name", "email"]);
  });
});

describe("reorderColumnWithinZone", () => {
  it("rewrites the pinning slice for a pinned zone", async () => {
    const table = useTableInSetup(() => useDataTable({
      data: people,
      columns,
      getRowId,
      defaultColumnPinning: { start: ["name", "email"], end: [] }
    }));

    expect(reorderColumnWithinZone(table, "email", { id: "name", side: "before" })).toBe(true);

    await nextTick();

    expect(table.atoms.columnPinning.get().start).toEqual(["email", "name"]);
  });

  it("rejects cross-zone drops without changing either order slice", async () => {
    const table = useTableInSetup(() => useDataTable({
      data: people,
      columns,
      getRowId,
      defaultColumnPinning: { start: ["email"], end: [] }
    }));
    const previousOrder = table.atoms.columnOrder.get();
    const previousPinning = table.atoms.columnPinning.get();

    expect(reorderColumnWithinZone(table, "name", { id: "email", side: "before" })).toBe(false);

    await nextTick();

    expect(table.atoms.columnOrder.get()).toBe(previousOrder);
    expect(table.atoms.columnPinning.get()).toBe(previousPinning);
  });
});
