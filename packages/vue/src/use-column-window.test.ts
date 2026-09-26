import type { RowData } from "@tanstack/vue-table";
import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableHandle, Header } from "./types";
import type { ColumnWindowView } from "./use-column-window";

import { nextTick, ref } from "vue";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { measureColumnWindow, renderedColCount, windowHeaderCells, windowRowCells } from "./use-column-window";

enableAutoUnmount(afterEach);

// ------------------------------------------------------------------------------------------------
// The pure core
// ------------------------------------------------------------------------------------------------

/* Ten 100px columns: offsets [0, 100, …, 1000]. */
const OFFSETS = Array.from({ length: 11 }, (_, index) => index * 100);

describe("measureColumnWindow", () => {
  it("windows the visible span plus overscan", () => {
    // Visible 450–700 touches columns 4..6; ±1 overscan → [3, 8).
    expect(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 1,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: 450
    })).toEqual({ end: 8, start: 3 });
  });

  it("clamps at the edges", () => {
    expect(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 4,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: 0
    })).toEqual({ end: 7, start: 0 });

    expect(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 4,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: 750
    })).toEqual({ end: 10, start: 3 });
  });

  it("normalizes the RTL negative scroll offset", () => {
    expect(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 0,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: -450
    })).toEqual(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 0,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: 450
    }));
  });

  it("narrows the visible strip by the pinned overlays", () => {
    // 250px viewport minus 100px pinned-start and 50px pinned-end leaves a 100px strip:
    // 450–550 touches columns 4 and 5 only.
    expect(measureColumnWindow({
      clientWidth: 250,
      offsets: OFFSETS,
      overscan: 0,
      pinnedEndWidth: 50,
      pinnedStartWidth: 100,
      scrollLeft: 450
    })).toEqual({ end: 6, start: 4 });
  });

  it("keeps at least one column when the viewport has no measured width", () => {
    expect(measureColumnWindow({
      clientWidth: 0,
      offsets: OFFSETS,
      overscan: 0,
      pinnedEndWidth: 0,
      pinnedStartWidth: 0,
      scrollLeft: 0
    })).toEqual({ end: 1, start: 0 });
  });
});

// ------------------------------------------------------------------------------------------------
// Tiling helpers
// ------------------------------------------------------------------------------------------------

function view(partial: Partial<ColumnWindowView> & Pick<ColumnWindowView, "start" | "end">): ColumnWindowView {
  const pinnedStartCount = partial.pinnedStartCount ?? 0;
  const pinnedEndCount = partial.pinnedEndCount ?? 0;
  const centerCount = partial.centerCount ?? 10;
  const total = pinnedStartCount + centerCount + pinnedEndCount;

  return {
    centerCount,
    displayIndexById: partial.displayIndexById
      ?? new Map(Array.from({ length: total }, (_, index) => [`c${index}`, index])),
    leadingSpace: partial.leadingSpace ?? 0,
    pinnedEndCount,
    pinnedStartCount,
    end: partial.end,
    start: partial.start,
    totalLeafCount: total,
    trailingSpace: partial.trailingSpace ?? 0
  };
}

/**
 * A header stub: the tiling helper only reads `getLeafHeaders()[i].column.id`.
 */
function fakeHeader(id: string, leafIds: string[] = [id]) {
  return {
    getLeafHeaders: () => leafIds.map(leafId => { return { column: { id: leafId } }; }),
    id
  } as unknown as Header<RowData, unknown>;
}

describe("windowHeaderCells", () => {
  it("renders leaf headers inside the window between the two spacers", () => {
    const headers = Array.from({ length: 10 }, (_, index) => fakeHeader(`c${index}`));
    const cells = windowHeaderCells(headers, view({ end: 6, start: 3 }));

    expect(cells.map(cell => cell.kind === "spacer" ? cell.edge : cell.header.id))
      .toEqual(["leading", "c3", "c4", "c5", "trailing"]);
    expect(cells.map(cell => cell.kind === "header" ? cell.ariaColIndex : null).filter(index => index !== null))
      .toEqual([4, 5, 6]);
  });

  it("keeps pinned headers outside the spacers", () => {
    const headers = Array.from({ length: 12 }, (_, index) => fakeHeader(`c${index}`));
    const cells = windowHeaderCells(
      headers,
      view({
        centerCount: 10,
        end: 5,
        pinnedEndCount: 1,
        pinnedStartCount: 1,
        start: 3
      })
    );

    expect(cells.map(cell => cell.kind === "spacer" ? cell.edge : cell.header.id))
      .toEqual(["c0", "leading", "c4", "c5", "trailing", "c11"]);
  });

  it("clamps a straddling group to its rendered leaves", () => {
    // Group A covers c0..c4, group B covers c5..c9; window [3, 7) cuts through both.
    const headers = [
      fakeHeader("a", ["c0", "c1", "c2", "c3", "c4"]),
      fakeHeader("b", ["c5", "c6", "c7", "c8", "c9"])
    ];
    const cells = windowHeaderCells(headers, view({ end: 7, start: 3 }));

    expect(cells.map(cell => cell.kind === "spacer" ? cell.edge : `${cell.header.id}:${cell.colSpan}`))
      .toEqual(["leading", "a:2", "b:2", "trailing"]);
  });

  it("drops a group with nothing rendered", () => {
    const headers = [
      fakeHeader("a", ["c0", "c1", "c2"]),
      fakeHeader("b", ["c3", "c4", "c5"]),
      fakeHeader("c", ["c6", "c7", "c8", "c9"])
    ];
    const cells = windowHeaderCells(headers, view({ end: 10, start: 6 }));

    expect(cells.map(cell => cell.kind === "spacer" ? cell.edge : `${cell.header.id}:${cell.colSpan}`))
      .toEqual(["leading", "c:4"]);
  });

  it("lets a header whose rendered leaves flank a hidden run absorb its spacer col", () => {
    // One group over everything: pinned c0, hidden c1..c2, windowed c3..c4.
    const headers = [fakeHeader("g", ["c0", "c1", "c2", "c3", "c4"])];
    const cells = windowHeaderCells(
      headers,
      view({
        centerCount: 4,
        end: 4,
        pinnedStartCount: 1,
        start: 2
      })
    );

    // colSpan: 1 pinned + 1 spacer col + 2 windowed.
    expect(cells).toEqual([
      {
        ariaColIndex: 1,
        colSpan: 4,
        header: headers[0],
        kind: "header"
      }
    ]);
  });
});

describe("windowRowCells / renderedColCount", () => {
  it("slices the display-ordered cells into the three rendered segments", () => {
    const cells = Array.from({ length: 12 }, (_, index) => `c${index}`);
    const segments = windowRowCells(
      cells,
      view({
        centerCount: 10,
        end: 5,
        pinnedEndCount: 1,
        pinnedStartCount: 1,
        start: 3
      })
    );

    expect(segments).toEqual({
      leading: ["c0"],
      trailing: ["c11"],
      windowed: ["c4", "c5"]
    });
  });

  it("counts rendered cols including spacers for full-width cells", () => {
    expect(renderedColCount(null, 12)).toBe(12);
    expect(renderedColCount(
      view({
        centerCount: 10,
        end: 5,
        pinnedEndCount: 1,
        pinnedStartCount: 1,
        start: 3
      }),
      12
    )).toBe(6);
    expect(renderedColCount(view({ end: 4, start: 0 }), 10)).toBe(5);
  });
});

// ------------------------------------------------------------------------------------------------
// The component against a window
// ------------------------------------------------------------------------------------------------

interface Wide {
  id: string;
  [key: string]: string;
}

const WIDE_COLUMNS: Array<ColumnDef<Wide, any>> = Array.from({ length: 10 }, (_, index) => {
  return {
    accessorKey: `c${index}`,
    header: `Col ${index}`,
    size: 100
  };
});

const WIDE_DATA: Wide[] = [Object.fromEntries([["id", "r1"], ...Array.from({ length: 10 }, (_, index) => [`c${index}`, `v${index}`])]) as Wide];

/* ---- mounting (the component queries read straight off the document, one table at a time) ---- */

const hosts: Array<HTMLElement> = [];

function mountTable(props: Record<string, unknown>): VueWrapper {
  // A definite height on the host so the adaptive root has an indefinite-parent-free start
  // (the adaptive-sizing contract); jsdom lays nothing out, which is exactly the environment
  // the React edition's suite ran in.
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

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/** The reka ScrollArea's scrolling div — the seat Mantine's viewport held in the React edition. */
function bodyViewport(): HTMLElement {
  return document.querySelector<HTMLElement>(".ledger-scroller [data-reka-scroll-area-viewport]")!;
}

function setScrollLeft(viewport: HTMLElement, left: number) {
  Object.defineProperty(viewport, "scrollLeft", {
    configurable: true,
    value: left,
    writable: true
  });
}

/** React's `act(() => dispatchEvent(...))` becomes the dispatch plus one scheduler flush. */
async function scrollTo(viewport: HTMLElement, left: number) {
  setScrollLeft(viewport, left);
  viewport.dispatchEvent(new Event("scroll"));
  await nextTick();
}

/**
 * jsdom measures nothing, so `clientWidth` is 0 and the visible strip is empty — every scroll
 * delta then reads as a discrete leap and only the synchronous path ever runs. A real width
 * puts in-strip scrolls onto the deferred path the tests below pin down.
 */
function mockClientWidth(viewport: HTMLElement, width: number) {
  Object.defineProperty(viewport, "clientWidth", {
    configurable: true,
    value: width
  });
}

/**
 * The scroll-driven update strategy's test bed (use-column-window.ts): an in-strip shift rides
 * the scheduler-coalesced write (the React edition built the same behavior as a chased
 * transition), and the write path must survive the race a scroll storm creates. Mounts with a
 * mocked 250px viewport over ten 100px columns and overscan 1, so the settled window at
 * scrollLeft 0 is [0, 4) and an in-strip scroll to 120 targets [0, 5).
 */
async function mountMeasured() {
  mountTable({
    columns: WIDE_COLUMNS,
    data: WIDE_DATA,
    getRowId: (row: Wide) => row.id,
    virtualizedColumns: { overscan: 1 }
  });
  await tick();
  const viewport = bodyViewport();
  mockClientWidth(viewport, 250);
  // Re-measure under the real width: the mount ran at clientWidth 0.
  await scrollTo(viewport, 0);

  return { viewport };
}

function rowCellIds(): string[] {
  const row = document.querySelector<HTMLElement>(".ledger-tbody .ledger-row")!;

  return [...row.children].map(cell => (cell as HTMLElement).dataset.ledgerColumnId ?? "spacer");
}

describe("virtualizedColumns", () => {
  it("renders the window between spacer cols and carries the column ARIA", async () => {
    mountTable({
      columns: WIDE_COLUMNS,
      data: WIDE_DATA,
      getRowId: (row: Wide) => row.id,
      virtualizedColumns: { overscan: 2 }
    });
    await tick();

    // jsdom has no layout (clientWidth 0): one visible column plus overscan on each side.
    expect(rowCellIds()).toEqual(["c0", "c1", "c2", "spacer"]);

    const table = document.querySelector<HTMLElement>('[role="table"]')!;
    expect(table.getAttribute("aria-colcount")).toBe("10");

    const row = document.querySelector<HTMLElement>(".ledger-tbody .ledger-row")!;
    expect(row.children[0]!.getAttribute("aria-colindex")).toBe("1");

    // The trailing spacer col carries the exact hidden width.
    const bodyCols = [...document.querySelectorAll<HTMLElement>(".ledger-scroller colgroup col")];
    expect(bodyCols).toHaveLength(4);
    expect(bodyCols.at(-1)!.style.width).toBe("700px");

    // The header tiles the same window.
    const headerCells = [...document.querySelectorAll<HTMLElement>(".ledger-header-row > *")]
      .map(cell => cell.dataset.ledgerColumnId ?? "spacer");
    expect(headerCells).toEqual(["c0", "c1", "c2", "spacer"]);
  });

  it("shifts the window on horizontal scroll", async () => {
    mountTable({
      columns: WIDE_COLUMNS,
      data: WIDE_DATA,
      getRowId: (row: Wide) => row.id,
      virtualizedColumns: { overscan: 2 }
    });
    await tick();

    await scrollTo(bodyViewport(), 450);

    expect(rowCellIds()).toEqual(["spacer", "c2", "c3", "c4", "c5", "c6", "spacer"]);
    // First rendered data cell keeps its absolute position among all ten columns.
    const row = document.querySelector<HTMLElement>(".ledger-tbody .ledger-row")!;
    expect(row.children[1]!.getAttribute("aria-colindex")).toBe("3");
  });

  it("keeps pinned columns mounted outside the window", async () => {
    mountTable({
      columns: WIDE_COLUMNS,
      data: WIDE_DATA,
      defaultColumnPinning: { end: [], start: ["c9"] },
      getRowId: (row: Wide) => row.id,
      virtualizedColumns: { overscan: 1 }
    });
    await tick();

    // Pinned c9 leads the display order; the center windows to two columns.
    expect(rowCellIds()).toEqual(["c9", "c0", "c1", "spacer"]);
  });

  it("commits an in-strip shift through the deferred write", async () => {
    const { viewport } = await mountMeasured();
    expect(rowCellIds()).toEqual(["c0", "c1", "c2", "c3", "spacer"]);

    // A 120px delta is inside the 250px strip — the deferred path, not the teleport.
    await scrollTo(viewport, 120);

    expect(rowCellIds()).toEqual(["c0", "c1", "c2", "c3", "c4", "spacer"]);
  });

  it("keeps committing after a scroll back to the committed window strands the flight", async () => {
    const { viewport } = await mountMeasured();

    // Two scroll events in one tick: the first writes a shift toward [0, 5), the second measures
    // back to the committed [0, 4) and reverts the target mid-flight. The scheduler must
    // coalesce both writes into one render of the NEWEST window and leave the update path open —
    // the React edition had to build a chased transition for the same guarantee, and a flight it
    // stranded without committing a fresh range jammed the chase shut forever (the jitter
    // deadlock a fast scrollbar drag reliably found), so no later shift ever committed.
    setScrollLeft(viewport, 120);
    viewport.dispatchEvent(new Event("scroll"));
    setScrollLeft(viewport, 0);
    viewport.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(rowCellIds()).toEqual(["c0", "c1", "c2", "c3", "spacer"]);

    // The chase must still be open: the next in-strip shift commits.
    await scrollTo(viewport, 120);

    expect(rowCellIds()).toEqual(["c0", "c1", "c2", "c3", "c4", "spacer"]);
  });

  it("scrolls an unrendered column into view through the handle", async () => {
    const handle = ref<DataTableHandle<Wide> | null>(null);
    const scrollSpy = vi.fn();
    mountTable({
      columns: WIDE_COLUMNS,
      data: WIDE_DATA,
      getRowId: (row: Wide) => row.id,
      handleRef: handle,
      virtualizedColumns: true
    });
    await tick();
    const viewport = bodyViewport();
    viewport.scrollTo = scrollSpy;

    handle.value!.scrollToColumn("c7", { align: "start" });

    expect(scrollSpy).toHaveBeenCalledWith({ behavior: undefined, left: 700 });
  });
});
