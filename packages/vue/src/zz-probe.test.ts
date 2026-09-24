import { describe, it } from "vitest";
import { nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach } from "vitest";

import DataTable from "./data-table.vue";

enableAutoUnmount(afterEach);

interface Node { id: string; name: string; children?: Node[] }
const tree: Node[] = [
  { children: [{ id: "1a", name: "Ann" }, { id: "1b", name: "Ben" }], id: "1", name: "Carol" },
  { id: "2", name: "Alice" }
];
const hosts: HTMLElement[] = [];
function mountTable(props: Record<string, unknown>) {
  const host = document.createElement("div");
  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);
  return mount(DataTable as never, { attachTo: host, props: props as never });
}
afterEach(() => { for (const e of hosts.splice(0)) e.remove(); });

describe("probe", () => {
  it("dumps the tree DOM", async () => {
    mountTable({
      columns: [{ accessorKey: "name", header: "Name" }],
      data: tree,
      getRowId: (n: Node) => n.id,
      getSubRows: (n: Node) => n.children,
      enableRowSelection: true
    });
    await nextTick(); await nextTick();
    console.log("BEFORE EXPAND rows:", document.querySelectorAll(".ledger-row").length);
    console.log("expander-like buttons:", [...document.querySelectorAll(".ledger-tbody button")].map(b => b.closest("td")?.className));
    const btn = document.querySelector(".ledger-tbody button");
    (btn as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick(); await nextTick();
    console.log("AFTER EXPAND rows:", document.querySelectorAll(".ledger-row").length);
    console.log("row ids:", [...document.querySelectorAll(".ledger-row")].map(r => (r as HTMLElement).dataset.rowId));
  });
});
