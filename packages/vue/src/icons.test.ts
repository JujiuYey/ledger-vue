import { defineComponent, h, type VNode } from "vue";

import type { DataTableIconProps } from "./icons";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import DataTable from "./data-table.vue";
import { defaultIcons, resolveIcons } from "./icons";
import { DataTableSearch } from "./search";
import { useDataTable } from "./use-data-table";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
}

const people: Person[] = [
  { id: "1", name: "Carol" },
  { id: "2", name: "Alice" }
];

const columns = [{ accessorKey: "name", header: "Name" }];

const getRowId = (person: Person) => person.id;

/** Mounts a host whose setup builds the render function once (composables run in setup). */
function mountWithSetup(buildSetup: () => () => VNode): void {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);

  const Host = defineComponent({ setup: buildSetup });

  mount(Host, { attachTo: host });
}

const Custom = () => h("svg", { "data-testid": "custom" });

describe("icons registry", () => {
  it("resolves overrides per slot over the defaults", () => {
    const resolved = resolveIcons({ sortable: Custom });

    expect(resolved.sortable).toBe(Custom);
    expect(resolved.sortAsc).toBe(defaultIcons.sortAsc);
    expect(resolveIcons(undefined)).toBe(defaultIcons);
  });

  it("renders an icons override in the table chrome with the chrome's own size", async () => {
    const seen: DataTableIconProps[] = [];

    const SortGlyph = (props: DataTableIconProps) => {
      seen.push(props);

      return h("svg", { "data-testid": "custom-sortable" });
    };

    mountWithSetup(() => () => h(DataTable as never, {
      columns,
      data: people,
      getRowId,
      icons: { sortable: SortGlyph }
    }));
    await Promise.resolve();

    expect(document.querySelector("[data-testid=\"custom-sortable\"]")).toBeTruthy();
    expect(seen[0]?.size).toBe(14);
  });

  it("renders an icons override in a standalone compound component", async () => {
    mountWithSetup(() => {
      const table = useDataTable({
        data: people,
        columns,
        getRowId,
        enableGlobalFilter: true
      });

      return () => h(DataTableSearch, {
        icons: { search: () => h("svg", { "data-testid": "custom-search" }) },
        table
      } as never);
    });
    await Promise.resolve();

    expect(document.querySelector("[data-testid=\"custom-search\"]")).toBeTruthy();
  });
});
