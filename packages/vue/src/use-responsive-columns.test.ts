import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef } from "./types";

import { defineComponent, h, nextTick } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { useResponsiveColumns } from "./use-responsive-columns";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  age: number;
  contact: string;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30,
    contact: "carol@example.com"
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "age",
    header: "Age",
    meta: { hiddenFrom: "sm" }
  },
  {
    accessorKey: "contact",
    header: "Contact",
    meta: { visibleFrom: "md" }
  }
];

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component so it gets a
 * real setup scope. The immediate breakpoint watcher arms during setup, so the stubbed
 * matchMedia must already be in place when `mount` runs.
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
 * Controllable matchMedia stub keyed by the breakpoint length inside the query string.
 */
function installMatchMedia(initial: Record<string, boolean>) {
  const state = { ...initial };
  const listeners = new Map<string, Set<() => void>>();

  const keyFor = (query: string) => Object.keys(state).find(value => query.includes(value)) ?? query;

  vi.stubGlobal("matchMedia", (query: string) => {
    const key = keyFor(query);

    return {
      media: query,
      get matches() {
        return state[key] ?? false;
      },
      addEventListener: (_type: string, listener: () => void) => {
        const set = listeners.get(key) ?? new Set();
        set.add(listener);
        listeners.set(key, set);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.get(key)?.delete(listener);
      }
    };
  });

  // React wrapped the listener sweep in act(); the Vue counterpart is the callers' nextTick.
  return (next: Record<string, boolean>) => {
    for (const [key, matches] of Object.entries(next)) {
      state[key] = matches;
      const keyListeners = listeners.get(key);

      if (keyListeners) {
        for (const listener of keyListeners) {
          listener();
        }
      }
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ---- mounting (one table at a time; queries read straight off the document) ---- */

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>): VueWrapper {
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

function elementByText(text: string, root: ParentNode = document): HTMLElement | null {
  return all("*", root).find(element => element.children.length === 0 && element.textContent === text) ?? null;
}

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

describe("useResponsiveColumns", () => {
  it("removes hiddenFrom columns above and visibleFrom columns below their breakpoints", async () => {
    // Wide viewport: at/above sm and md. The Vue edition's stock breakpoint scale is px-based
    // (sm 768px, md 992px) where the React edition's Mantine scale was em-based (48em/62em) —
    // the same breakpoints in the host's own units.
    const update = installMatchMedia({ "768px": true, "992px": true });

    mountTable({ columns, data: people, getRowId: (person: Person) => person.id });
    await tick();

    expect(elementByText("Name")).toBeTruthy();
    expect(elementByText("Age")).toBeNull();
    expect(elementByText("Contact")).toBeTruthy();

    // Narrow viewport: below both breakpoints — the pair swaps.
    update({ "768px": false, "992px": false });
    await tick();

    expect(elementByText("Age")).toBeTruthy();
    expect(elementByText("Contact")).toBeNull();
  });

  it("keeps every column when matchMedia is unavailable", () => {
    // The setup file ships a stub matchMedia; simulate a truly matchMedia-less environment
    // (SSR). The composable mounts bare here — no provider needs matchMedia in the Vue edition.
    vi.stubGlobal("matchMedia", undefined);

    const responsive = useInSetup(() => useResponsiveColumns(columns));

    expect(responsive.value).toHaveLength(3);
  });

  it("keeps a breakpoint value that contains commas in one piece", () => {
    // A breakpoint is any CSS length the author writes, and clamp() carries commas. The runtime
    // maps an unrecognized value through as its own CSS length (use-responsive-columns.ts
    // documents exactly that), but the ported meta type narrows to the stock scale where the
    // React edition's MantineBreakpoint resolved to plain `string` — the clamp() rides a
    // localized cast (type-surface gap, recorded).
    const clamped = "clamp(30em, 50vw, 60em)" as "xs" | "sm" | "md" | "lg" | "xl";
    const custom: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { hiddenFrom: clamped }
      }
    ];
    const queries: string[] = [];

    vi.stubGlobal("matchMedia", (query: string) => {
      queries.push(query);

      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      };
    });

    const responsive = useInSetup(() => useResponsiveColumns(custom));

    expect(queries).toContain(`(min-width: ${clamped})`);
    // One breakpoint, one query — and the column it names is hidden at and above it.
    expect(queries.filter(query => query.includes("30em"))).toHaveLength(1);
    expect(responsive.value.map(column => column.header)).toEqual(["Name"]);
  });
});
