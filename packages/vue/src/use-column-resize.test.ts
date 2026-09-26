import { defineComponent, h, nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";

// The pointer-driven resize drag, ported from the React edition's use-column-resize.test.tsx.
// The drags dispatch real event sequences — pointerdown at the handle, pointermove/up/cancel
// and keydown bubbling from the document to the window listeners — exactly as a browser would
// deliver them. jsdom implements neither layout nor PointerEvent: the MouseEvent stand-in (the
// repo's recorded technique, truncate.test.ts) carries every field the handlers read (button,
// clientX, target, currentTarget), and content widths arrive through stubbed scrollWidth reads.

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

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    size: 120,
    minSize: 60
  },
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

function mountTable(props: Record<string, unknown>): VueWrapper {
  return mount(DataTable as never, { attachTo: attachHost(), props: props as never });
}

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

const q = (selector: string): HTMLElement | null =>
  document.querySelector(selector) as HTMLElement | null;

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

const buttonByName = (name: string): HTMLElement | null =>
  [...document.querySelectorAll("button")].find(button =>
    button.getAttribute("aria-label") === name || button.textContent?.trim() === name) ?? null;

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

const pressEscape = (): void => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
};

const doubleClick = (element: Element): void => {
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
};

const resizer = (): Element => document.querySelector(":scope .ledger-header .ledger-resizer") as Element;

async function renderResizable() {
  const onColumnSizingChange = vi.fn();

  mountTable({
    enableColumnResizing: true,
    columns,
    data: people,
    getRowId,
    onColumnSizingChange
  });
  await tick();

  const handle = q(":scope .ledger-header .ledger-resizer");
  expect(handle).toBeTruthy();

  return { onColumnSizingChange, handle: handle as Element };
}

/**
 * The harness the React edition drove through startTransition + Suspense: the transition
 * rendered the new state, a sibling suspended, and React threw the render away — leaving the
 * shared TanStack core carrying values the screen never saw. Vue has no discarded renders, but
 * the same hazard — the core running ahead of the screen — is the pre-flush window: the button
 * writes the state and the pointer lands in the same synchronous run, before Vue has flushed
 * the re-render. The handle still on screen belongs to the render before the write, which is
 * exactly the situation the captured `ResizerSpec` exists for. (The "really leaves" tests use
 * the same harness WITH the flush awaited, for the committed counterpart.)
 */
function mountResizeHarness({
  button,
  initialColumns = columns,
  initialSizing,
  onColumnSizingChange
}: {
  button: { label: string; columns?: Array<ColumnDef<Person, any>>; sizing?: Record<string, number> };
  initialColumns?: Array<ColumnDef<Person, any>>;
  initialSizing?: Record<string, number>;
  onColumnSizingChange: (next: Record<string, number>) => void;
}): { press: () => void } {
  const Harness = defineComponent({
    setup() {
      const defs = ref(initialColumns);
      const sizing = ref<Record<string, number> | undefined>(initialSizing);

      return () => [
        h(DataTable as never, {
          columnSizing: sizing.value,
          columns: defs.value,
          data: people,
          enableColumnResizing: true,
          getRowId,
          onColumnSizingChange: (next: Record<string, number>) => {
            onColumnSizingChange(next);

            // The controlled mirror — only when the harness owns a sizing state at all.
            if (sizing.value !== undefined) {
              sizing.value = next;
            }
          }
        } as never),
        h("button", {
          type: "button",
          onClick: () => {
            if (button.columns !== undefined) {
              defs.value = button.columns;
            }

            if (button.sizing !== undefined) {
              sizing.value = button.sizing;
            }
          }
        }, [button.label])
      ];
    }
  });

  mount(Harness, { attachTo: attachHost() });

  return {
    press: () => {
      buttonByName(button.label)?.click();
    }
  };
}

describe("useColumnResize", () => {
  it("drags 1:1 from the engine-resolved width and clamps to minSize", async () => {
    const { onColumnSizingChange, handle } = await renderResizable();

    pointerDown(handle, 300);

    pointerMove(345);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 165 });

    pointerMove(-600);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 60 });

    pointerUp();
    onColumnSizingChange.mockClear();

    // The session ended — further movement changes nothing.
    pointerMove(500);
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });

  it("drags from the width on screen, not one a discarded render named", async () => {
    const onColumnSizingChange = vi.fn();

    const { press } = mountResizeHarness({
      button: { label: "widen", sizing: { name: 400 } },
      initialSizing: { name: 120 },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    // The write puts the core ahead of the screen; the flushed render would draw the column
    // at 400, but the flush has not run — the column on screen is still 120 wide.
    press();

    pointerDown(resizer(), 300);
    pointerMove(310);

    // A drag is 1:1 from the edge the user grabbed, and the edge they grabbed is the one on
    // screen. Departing from 400 would jump the column the moment it is touched.
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 130 });

    pointerUp();
    await tick();
  });

  it("clamps a drag to the constraints of the render on screen", async () => {
    const onColumnSizingChange = vi.fn();
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        size: 120,
        minSize: 60,
        maxSize: 130
      },
      { accessorKey: "age", header: "Age" }
    ];

    const { press } = mountResizeHarness({
      button: { label: "cap", columns: narrow },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    // A maxSize nobody ever saw may not stop the drag the user is making (the cap write has
    // not flushed — the screen still shows the uncapped render).
    press();

    pointerDown(resizer(), 300);
    pointerMove(400);

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 220 });
    pointerUp();
    await tick();
  });

  it("restores the width on screen on Escape, not one a discarded render named", async () => {
    const onColumnSizingChange = vi.fn();

    const { press } = mountResizeHarness({
      button: { label: "widen", sizing: { name: 400 } },
      initialSizing: { name: 120 },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    press();

    pointerDown(resizer(), 300);
    pointerMove(340);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // Escape puts back the width the drag started from — the one the user was looking at.
    pressEscape();
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 120 });
    await tick();
  });

  it("autosizes a column a discarded render removed", async () => {
    const onColumnSizingChange = vi.fn();
    const withoutName: Array<ColumnDef<Person, any>> = [{ accessorKey: "age", header: "Age" }];

    const { press } = mountResizeHarness({
      button: { label: "drop", columns: withoutName },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    // The removal write has not flushed — the column and its handle are still on screen.
    press();

    for (const cell of document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]")) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 252 });
    }

    doubleClick(resizer());

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 260 });
    await tick();
  });

  it("autosizes to the footer when the footer is the widest thing rendered", async () => {
    const onColumnSizingChange = vi.fn();
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        footer: "Grand total across every region",
        size: 120,
        minSize: 60
      },
      { accessorKey: "age", header: "Age" }
    ];

    mountTable({
      enableColumnResizing: true,
      columns: withFooter,
      data: people,
      getRowId,
      onColumnSizingChange
    });
    await tick();

    for (const cell of document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]")) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 100 });
    }

    const footerCell = q(".ledger-footer .ledger-footer-cell");
    expect(footerCell).toBeTruthy();
    Object.defineProperty(footerCell as HTMLElement, "scrollWidth", { configurable: true, value: 300 });

    // "Fit the rendered content" means everything rendered: a totals row is content the column
    // has to hold, and a fit that clips it is not a fit.
    doubleClick(resizer());

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 308 });
  });

  it("stops writing sizing when the column it is dragging really leaves", async () => {
    const onColumnSizingChange = vi.fn();
    const withoutName: Array<ColumnDef<Person, any>> = [{ accessorKey: "age", header: "Age" }];

    const { press } = mountResizeHarness({
      button: { label: "drop", columns: withoutName },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    pointerDown(resizer(), 300);
    pointerMove(320);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 140 });

    // A real render takes the column away mid-drag. The handle is gone with it, so the pointer is
    // dragging nothing — and must not go on writing a width for a column that is not there.
    press();
    await tick();
    onColumnSizingChange.mockClear();

    pointerMove(500);
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });

  it("stops a drag when its own table loses the column, whatever another table shows", async () => {
    const onColumnSizingChange = vi.fn();
    const onOtherTableChange = vi.fn();
    const withoutName: Array<ColumnDef<Person, any>> = [{ accessorKey: "age", header: "Age" }];

    const Harness = defineComponent({
      setup() {
        const defs = ref(columns);

        return () => h("div", [
          h("div", { "data-testid": "first" }, [
            h(DataTable as never, {
              columns: defs.value,
              data: people,
              enableColumnResizing: true,
              getRowId,
              onColumnSizingChange: (next: Record<string, number>) => onColumnSizingChange(next)
            } as never)
          ]),

          // A second table on the same page, with a column of the same id. Ids are the
          // application's, and nothing makes them unique across tables.
          h(DataTable as never, {
            columns,
            data: people,
            enableColumnResizing: true,
            getRowId,
            onColumnSizingChange: (next: Record<string, number>) => onOtherTableChange(next)
          } as never),

          h("button", { type: "button", onClick: () => { defs.value = withoutName; } }, ["drop"])
        ]);
      }
    });

    mount(Harness, { attachTo: attachHost() });
    await tick();

    const first = (q('[data-testid="first"]') as HTMLElement)
      .querySelector(":scope .ledger-header .ledger-resizer") as Element;
    pointerDown(first, 300);
    pointerMove(320);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 140 });

    // The first table loses the column. The second still has one called `name`, and it has
    // nothing to do with this drag.
    buttonByName("drop")?.click();
    await tick();
    onColumnSizingChange.mockClear();

    pointerMove(500);
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });

  it("autosizes to the constraints of the render on screen", async () => {
    const onColumnSizingChange = vi.fn();
    const capped: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        size: 120,
        minSize: 60,
        maxSize: 130
      },
      { accessorKey: "age", header: "Age" }
    ];

    const { press } = mountResizeHarness({
      button: { label: "cap", columns: capped },
      onColumnSizingChange: next => onColumnSizingChange(next)
    });
    await tick();

    // The cap write has not flushed — the render on screen carries no maxSize.
    press();

    for (const cell of document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]")) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 252 });
    }

    // A maxSize nobody ever saw may not decide how wide the fit is allowed to be.
    doubleClick(resizer());

    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 260 });
    await tick();
  });

  it("restores the pre-drag width on Escape", async () => {
    const { onColumnSizingChange, handle } = await renderResizable();

    pointerDown(handle, 300);
    pointerMove(340);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    pressEscape();
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});
  });

  it("autosizes the column to its rendered content on resizer double-click", async () => {
    const { onColumnSizingChange, handle } = await renderResizable();

    // jsdom lays nothing out, so the rendered cells report a stubbed content width.
    const cells = document.querySelectorAll<HTMLElement>(".ledger-tbody td[data-ledger-column-id=\"name\"]");
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      Object.defineProperty(cell, "scrollWidth", { configurable: true, value: 252 });
    }

    doubleClick(handle);

    // Content width plus the breathing-room slack.
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 260 });
  });

  it("restores the pre-drag width and ends the session on pointercancel", async () => {
    const { onColumnSizingChange, handle } = await renderResizable();

    pointerDown(handle, 300);
    pointerMove(340);
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({ name: 160 });

    // A touch pan or OS gesture aborts the pointer stream without a pointerup.
    pointerCancel();
    expect(onColumnSizingChange).toHaveBeenLastCalledWith({});

    onColumnSizingChange.mockClear();
    pointerMove(500);
    expect(onColumnSizingChange).not.toHaveBeenCalled();
  });
});
