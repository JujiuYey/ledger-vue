import { nextTick } from "vue";

import type { ColumnDef } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";

// The pointer-driven header reorder, ported from the React edition's use-column-reorder.test.tsx.
// The Vue edition's useColumnReorder is the same pointer-based module the React spec drives (the
// @dnd-kit/dom dependency is the COLUMNS PANEL's, not the header's), so the drag dispatches real
// pointer sequences at the header cell and the window — no monitor interception needed. jsdom
// implements neither layout nor PointerEvent: the MouseEvent stand-in (the repo's recorded
// technique, truncate.test.ts) carries every field the handlers read, and the drop-target
// hit-test is steered through a stubbed document.elementFromPoint.

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
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" }
];

const getRowId = (person: Person) => person.id;

/* ---- mounting (the repo idiom: a definite-height host, auto-unmount, tick) ---- */

const hosts: Array<HTMLElement> = [];

function attachHost(): HTMLElement {
  // A definite height on the host so the adaptive root has an indefinite-parent-free start
  // (the adaptive-sizing contract); jsdom lays nothing out, which is exactly the environment
  // the React edition's suite ran in.
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return host;
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

const buttonByName = (name: string): HTMLElement | null =>
  [...document.querySelectorAll("button")].find(button =>
    button.getAttribute("aria-label") === name || button.textContent?.trim() === name) ?? null;

// The header cell is the first element carrying the column id (the header table precedes the
// body in the DOM).
const header = (id: string): HTMLElement =>
  document.querySelector(`[data-ledger-column-id="${CSS.escape(id)}"]`) as HTMLElement;

function renderReorderable() {
  const onColumnOrderChange = vi.fn();

  mount(DataTable as never, {
    attachTo: attachHost(),
    props: {
      enableColumnOrdering: true,
      columns,
      data: people,
      getRowId,
      onColumnOrderChange
    } as never
  });

  return { onColumnOrderChange };
}

// jsdom lays nothing out, so the drop-target hit-test is stubbed to the header the test intends.
function stubHitTest(target: Element) {
  document.elementFromPoint = vi.fn(() => target);
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "elementFromPoint");
});

/* ---- the pointer stream ---- */

const pointerDown = (element: Element, clientX: number): void => {
  element.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true, clientX }));
};

const pointerMove = (clientX: number): void => {
  document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX }));
};

const pointerUp = (): void => {
  document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
};

const pointerCancel = (): void => {
  document.dispatchEvent(new MouseEvent("pointercancel", { bubbles: true }));
};

describe("useColumnReorder", () => {
  it("commits a drag past the threshold onto the target's far side", async () => {
    const { onColumnOrderChange } = renderReorderable();
    stubHitTest(header("age"));

    pointerDown(header("name"), 10);
    pointerMove(60);
    pointerUp();
    await tick();

    expect(onColumnOrderChange).toHaveBeenLastCalledWith(["age", "name"]);
  });

  it("abandons a cancelled drag instead of committing it on the next pointerup", async () => {
    const { onColumnOrderChange } = renderReorderable();
    stubHitTest(header("age"));

    pointerDown(header("name"), 10);
    pointerMove(60);
    pointerCancel();

    // The stray pointerup of a later, unrelated interaction must find no session to commit.
    pointerUp();
    expect(onColumnOrderChange).not.toHaveBeenCalled();

    // And no click suppression leaks onto the next real header interaction.
    buttonByName("Name")?.click();
    await tick();

    expect(header("name").getAttribute("aria-sort")).toBe("ascending");
  });

  it("ignores a nested pointerdown while a drag session is live", () => {
    renderReorderable();
    const adds = vi.spyOn(globalThis, "addEventListener");
    const moveListeners = () => adds.mock.calls.filter(([type]) => type === "pointermove").length;

    pointerDown(header("name"), 10);
    const afterFirst = moveListeners();

    pointerDown(header("name"), 10);
    expect(moveListeners()).toBe(afterFirst);

    pointerUp();
  });
});
