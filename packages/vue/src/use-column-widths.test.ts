import type { RowData } from "@tanstack/vue-table";
import type { TableInstance } from "./types";
import type { ColumnDef } from "./types";
import type { ColumnWidthSpec } from "./use-column-widths";

import { computed, defineComponent, h, nextTick, shallowRef } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { resolveColumnWidths, useColumnWidths } from "./use-column-widths";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

function spec(id: string, sizing: { size?: number; minSize?: number; maxSize?: number } = {}): ColumnWidthSpec {
  return {
    id,
    size: sizing.size,
    minSize: sizing.minSize,
    maxSize: sizing.maxSize
  };
}

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope (effect-scope disposal included). `rerender(...)` becomes a ref write plus
 * `await nextTick()` — the adapter syncs table options on a pre-flush watcher.
 */
function useInSetup<T>(composable: () => T): T {
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

/**
 * The pinned-aware display order the colgroup renders — the same inputs `data-table.vue` feeds
 * the width engine. The atom reads are the tracked reactivity; the meta identity covers
 * definition swaps.
 */
function displayColumnsOf<TData extends RowData>(table: TableInstance<TData>) {
  return computed(() => {
    table.atoms.columnOrder.get();
    table.atoms.columnVisibility.get();
    table.atoms.columnPinning.get();
    void table.options.meta?.ledger?.columns;

    return [
      ...table.getStartVisibleLeafColumns(),
      ...table.getCenterVisibleLeafColumns(),
      ...table.getEndVisibleLeafColumns()
    ];
  });
}

describe("resolveColumnWidths", () => {
  it("distributes surplus to grow columns proportionally to their bases", () => {
    // fixed 100; grow bases 100 + 300; available 1000 → surplus 500 split 1:3.
    const widths = resolveColumnWidths(
      [spec("a", { size: 100 }), spec("b", { minSize: 100 }), spec("c", { minSize: 300 })],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      a: 100,
      b: 225,
      c: 675
    });
    expect(widths.total).toBe(1000);
  });

  it("gives the first grow column the integer remainder so the total is exact", () => {
    // surplus 100 over bases 80+80+80: floor shares 33/33, first absorbs 34.
    const widths = resolveColumnWidths([spec("a"), spec("b"), spec("c")], {}, 340);

    expect(widths.byId).toEqual({
      a: 114,
      b: 113,
      c: 113
    });
    expect(widths.total).toBe(340);
  });

  it("falls back to bases and overflows when the container is too small", () => {
    const widths = resolveColumnWidths(
      [spec("a", { size: 200 }), spec("b", { minSize: 120 })],
      {},
      250
    );

    expect(widths.byId).toEqual({
      a: 200,
      b: 120
    });
    expect(widths.total).toBe(320);
  });

  it("fills the container proportionally when every column is fixed", () => {
    // No grow columns: 100+300 into 800 keeps the 1:3 ratio instead of leaving a gap.
    const widths = resolveColumnWidths(
      [spec("a", { size: 100 }), spec("b", { size: 300 })],
      {},
      800
    );

    expect(widths.byId).toEqual({
      a: 200,
      b: 600
    });
    expect(widths.total).toBe(800);
  });

  it("respects maxSize while redistributing grow-column surplus", () => {
    const widths = resolveColumnWidths(
      [
        spec("a", { minSize: 100, maxSize: 110 }),
        spec("b", { minSize: 100 }),
        spec("c", { minSize: 300 })
      ],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      a: 110,
      b: 223,
      c: 667
    });
    expect(widths.total).toBe(1000);
  });

  it("never expands fixed columns past maxSize just to fill the viewport", () => {
    const widths = resolveColumnWidths(
      [
        spec("select", {
          size: 40,
          minSize: 40,
          maxSize: 40
        }),
        spec("name", { size: 160, maxSize: 240 })
      ],
      {},
      1000
    );

    expect(widths.byId).toEqual({
      select: 40,
      name: 240
    });
    expect(widths.total).toBe(280);
  });

  it("falls back to equal distribution when every grow basis is zero", () => {
    const widths = resolveColumnWidths(
      [spec("a", { minSize: 0 }), spec("b", { minSize: 0 })],
      {},
      100
    );

    expect(widths.byId).toEqual({ a: 50, b: 50 });
    expect(widths.total).toBe(100);
  });

  it("lets columnSizing entries override the definition and clamps to min/max", () => {
    const widths = resolveColumnWidths(
      [
        spec("a", {
          size: 100,
          minSize: 80,
          maxSize: 160
        }),
        spec("b", { size: 50, minSize: 60 })
      ],
      { a: 500 },
      0
    );

    expect(widths.byId).toEqual({
      a: 160,
      b: 60
    });
  });

  it("resolves to bases in unmeasured environments (available width 0)", () => {
    const widths = resolveColumnWidths([spec("a"), spec("b", { minSize: 200 })], {}, 0);

    expect(widths.byId).toEqual({
      a: 80,
      b: 200
    });
    expect(widths.total).toBe(280);
  });
});

describe("useColumnWidths", () => {
  it("does not reuse geometry when delimiter-bearing column ids change", async () => {
    // `Row`, not `RowData`: the local interface must not shadow the TanStack type of the same
    // name the display-order helper constrains its generic with.
    interface Row {
      value: string;
    }

    const firstColumns: Array<ColumnDef<Row>> = [
      {
        id: "a",
        accessorKey: "value",
        size: 20
      },
      {
        id: "b:20,c",
        accessorKey: "value",
        size: 30
      }
    ];
    const secondColumns: Array<ColumnDef<Row>> = [
      {
        id: "a:20,b",
        accessorKey: "value",
        size: 20
      },
      {
        id: "c",
        accessorKey: "value",
        size: 30
      }
    ];
    const columns = shallowRef(firstColumns);
    const widths = useInSetup(() => {
      const table = useDataTable({ columns, data: [] });

      return useColumnWidths(table, displayColumnsOf(table), null, undefined, 40);
    });

    expect(widths.byId).toEqual({ a: 20, "b:20,c": 30 });

    columns.value = secondColumns;
    await nextTick();

    expect(widths.byId).toEqual({ "a:20,b": 20, c: 30 });
  });

  it("sizes the injected columns by the width the table's size gives, an override's own bounds winning", async () => {
    interface Sized {
      value: number;
    }

    const sizedColumns: Array<ColumnDef<Sized>> = [
      {
        id: "a",
        accessorKey: "value",
        size: 100
      }
    ];
    const injectedWidth = shallowRef(40);
    const widths = useInSetup(() => {
      const table = useDataTable({
        columns: sizedColumns,
        data: [],
        enableRowSelection: true
      });

      return useColumnWidths(table, displayColumnsOf(table), null, undefined, injectedWidth);
    });

    expect(widths.byId["ledger:select"]).toBe(40);

    injectedWidth.value = 48;
    await nextTick();
    expect(widths.byId["ledger:select"]).toBe(48);

    // The injected-column override is a mount-time option in the Vue edition (a live app does
    // not flip it per frame), so its bounds win on a fresh table rather than a rerender.
    const overridden = useInSetup(() => {
      const table = useDataTable({
        columns: sizedColumns,
        data: [],
        enableRowSelection: true,
        selectionColumn: { size: 56, maxSize: 56 }
      });

      return useColumnWidths(table, displayColumnsOf(table), null, undefined, 48);
    });

    expect(overridden.byId["ledger:select"]).toBe(56);
  });
});
