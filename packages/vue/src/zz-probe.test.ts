import { defineComponent, h, nextTick, ref } from "vue";

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [{ id: "1", name: "Carol" }];
const getRowId = (person: Person) => person.id;

const first = [{ accessorKey: "name", cell: (ctx: any) => `first:${ctx.getValue()}`, header: "Name" }];
const second = [{ accessorKey: "name", cell: (ctx: any) => `second:${ctx.getValue()}`, header: "Name" }];

describe("debug3 hook-mode columns swap", () => {
  it("core def swap in hook mode", async () => {
    let table!: ReturnType<typeof useDataTable>;
    const columnsRef = ref(first);

    const Host = defineComponent({
      setup() {
        table = useDataTable({
          get data() {
            return people;
          },
          get columns() {
            return columnsRef.value;
          },
          getRowId
        });

        return () => h("div");
      }
    });

    const w = mount(Host);
    await nextTick();

    console.log("t0 def:", table.getColumn("name")?.columnDef.cell?.({ getValue: () => "X" } as any));

    columnsRef.value = second;
    await nextTick();
    await nextTick();

    const ledgerCols = (table.options.meta as any)?.ledger?.columns as any[];
    console.log("t1 ledger cell:", ledgerCols?.[0]?.cell?.({ getValue: () => "X" }));
    const cols = table.options.columns as any[];
    console.log("t1 options cell:", cols[0].cell?.({ getValue: () => "X" } as any));
    console.log("t1 columnDef cell:", (table.getColumn("name") as any)?.columnDef.cell?.({ getValue: () => "X" }));
    console.log("t1 options.columns === second:", (table.options.columns as unknown[])[0] === second[0]);

    w.unmount();
    expect(true).toBe(true);
  });
});
