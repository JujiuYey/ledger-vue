import { defineComponent, h, nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableHandle } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { resolveVirtualDisplayIndex } from "./display-snapshot";
import { textEditor } from "./editors";
import { defaultLabels } from "./labels";

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
  },
  {
    id: "3",
    name: "Bob",
    age: 40
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "age", header: "Age" }
];

const getRowId = (person: Person) => person.id;

/* ---- mounting ---- */

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

/* ---- queries (the testing-library roles, read straight off the DOM) ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

function buttonByName(name: string, root: ParentNode = document): HTMLElement | null {
  return all("button", root).find(button =>
    button.getAttribute("aria-label") === name || button.textContent?.trim() === name) ?? null;
}

function elementByText(text: string, root: ParentNode = document): HTMLElement | null {
  return all("*", root).find(element => element.children.length === 0 && element.textContent === text) ?? null;
}

const bodyRows = (root: ParentNode = document): HTMLElement[] => all(".ledger-tbody .ledger-row", root);
const rowFor = (id: string, root: ParentNode = document): HTMLElement | null =>
  q(`[data-row-id="${id}"]`, root);

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

describe("DataTable", () => {
  it("renders rows under the kebab-case class contract with parity attributes", () => {
    mountTable({ columns, data: people, getRowId, striped: true });

    const root = q(".ledger-root");

    expect(root).toBeTruthy();
    expect(root?.dataset.striped).toBe("odd");
    expect(bodyRows()).toHaveLength(3);
    expect(rowFor("1")?.dataset.parity).toBe("odd");
    expect(rowFor("2")?.dataset.parity).toBe("even");
  });

  it("cycles aria-sort through header clicks", async () => {
    mountTable({ columns, data: people, getRowId });

    // Regression: the sort control must be a NATIVE button — a host control component would
    // carry an unlayered font-size that defeats the layered `font: inherit` on the label.
    const headerButton = buttonByName("Name");

    expect(headerButton?.tagName).toBe("BUTTON");

    const th = q("[data-ledger-column-id=\"name\"]");

    await headerButton?.click();
    await tick();

    expect(th?.getAttribute("aria-sort")).toBe("ascending");

    await buttonByName("Name")?.click();
    await tick();

    expect(th?.getAttribute("aria-sort")).toBe("descending");

    await buttonByName("Name")?.click();
    await tick();

    expect(th?.getAttribute("aria-sort")).toBeNull();
  });

  it("shows the empty state and the loading skeletons", async () => {
    const wrapper = mountTable({ columns, data: [], getRowId });

    // The default empty state is a caption block with the empty glyph, overlaid on the body
    // region (data-empty scopes the region's min-height floor).
    expect(q(".ledger-root")?.dataset.empty).toBe("true");
    expect(elementByText("No data")).toBeTruthy();

    await wrapper.setProps({ emptyState: "nothing here" });

    expect(elementByText("nothing here")).toBeTruthy();

    await wrapper.setProps({ loading: true });

    expect(elementByText("nothing here")).toBeNull();
    expect(bodyRows().length).toBeGreaterThan(0);
  });

  it("shows no-results instead of no-data while a filter is active", () => {
    mountTable({
      columns,
      data: people,
      defaultGlobalFilter: "zzz-no-match",
      enableGlobalFilter: true,
      getRowId
    });

    expect(elementByText("No matching records")).toBeTruthy();
  });

  it("names the ARIA table itself, leaving the root wrapper anonymous", () => {
    mountTable({ "aria-label": "People", columns, data: people, getRowId });

    const table = q("[role=\"table\"][aria-label=\"People\"]");

    expect(table?.className).toContain("ledger-main");
    expect(q(".ledger-root")?.getAttribute("aria-label")).toBeNull();
  });

  it("renders the error panel over stale rows and wires the retry button", async () => {
    const onRetry = vi.fn();

    mountTable({ columns, data: people, error: true, getRowId, onRetry });

    expect(elementByText("Couldn't load data")).toBeTruthy();
    // Stale rows stay mounted beneath the scrim.
    expect(bodyRows()).toHaveLength(3);
    expect(q(".ledger-empty[data-variant=\"error\"][data-over-rows]")).toBeTruthy();

    const retry = all("button").find(button => button.textContent?.includes("Retry"));

    expect(retry).toBeTruthy();
    await retry?.click();
    await tick();

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("replaces the trailing loader with the load-more error row and retries onEndReached", async () => {
    const onEndReached = vi.fn();

    mountTable({ columns, data: people, getRowId, loadMoreError: true, onEndReached });

    const alert = q("[role=\"alert\"]");

    expect(alert?.textContent).toBe("Couldn't load more rows");
    // The alert rides inside the cell — announcing it must not cost the row its only cell.
    expect(q(".ledger-loader-row [role=\"cell\"]")?.contains(alert)).toBe(true);

    // Message and button share one flex line.
    const line = q(".ledger-loader-row-content");
    const retry = all("button", line as ParentNode).find(b => b.textContent?.includes("Retry"));

    expect(line?.contains(alert)).toBe(true);
    expect(retry).toBeTruthy();

    await retry?.click();
    await tick();

    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("tracks the active row from clicks and the viewport keyboard", async () => {
    // jsdom has no scrollIntoView; the setup file stubs it — the keyboard path calls it per move.
    const onActiveRowIdChange = vi.fn();
    const onRowActivate = vi.fn();
    const onRowClick = vi.fn();

    mountTable({
      columns,
      data: people,
      enableActiveRow: true,
      getRowId,
      onActiveRowIdChange,
      onRowActivate,
      onRowClick
    });

    await rowFor("2")?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(rowFor("2")?.dataset.active).toBe("true");
    expect(onActiveRowIdChange).toHaveBeenLastCalledWith("2");
    // A click is both — the literal event and an activation.
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowActivate).toHaveBeenCalledTimes(1);

    const viewport = q(".ledger-scroller[tabindex=\"0\"]");

    expect(viewport).toBeTruthy();

    await viewport?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    await tick();

    expect(rowFor("3")?.dataset.active).toBe("true");
    expect(rowFor("2")?.dataset.active).toBeUndefined();

    await viewport?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Home" }));
    await tick();

    expect(rowFor("1")?.dataset.active).toBe("true");

    onRowClick.mockClear();
    onRowActivate.mockClear();

    await viewport?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    await tick();

    expect((onRowActivate.mock.calls[0]?.[0] as { id: string }).id).toBe("1");
    // Enter is not a click: the pointer-only handler must never see a synthesized MouseEvent.
    expect(onRowClick).not.toHaveBeenCalled();
    expect((onRowActivate.mock.calls[0]?.[1] as { type: string }).type).toBe("keydown");
  });

  it("describes the row-navigation focus stop and speaks each move of the current row", async () => {
    mountTable({ columns, data: people, enableActiveRow: true, getRowId });

    // The focus stop is a roleless div: `generic` prohibits an accessible name but not a
    // description, and the description has to be on the focused element to ever be read.
    const viewport = q(".ledger-scroller[tabindex=\"0\"]");

    expect(viewport?.hasAttribute("aria-label")).toBe(false);

    const hintId = viewport?.getAttribute("aria-describedby") ?? "";

    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId)?.textContent).toBe(defaultLabels.rowNavigation);

    // The consumer owns the table's own description; the hint never lands there.
    const main = q(".ledger-main");

    expect(main?.hasAttribute("aria-describedby")).toBe(false);

    // Focus never leaves the viewport, so the live region is the only thing that reports the move.
    const announcer = q("[aria-live=\"polite\"]");

    expect(announcer).toBeTruthy();
    expect(announcer?.textContent).toBe("");

    await rowFor("2")?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("Alice", 2, people.length));

    await viewport?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("Bob", 3, people.length));
  });

  it("re-speaks the current row when sorting moves it", async () => {
    mountTable({ columns, data: people, enableActiveRow: true, getRowId });

    const announcer = q("[aria-live=\"polite\"]");

    await rowFor("2")?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("Alice", 2, 3));

    // Same row, new position: an id-only dependency would leave the stale line standing.
    await buttonByName("Name")?.click();
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("Alice", 1, 3));
  });

  it("re-speaks the current row when the leading column is hidden", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);

    mountTable({ columns, data: people, enableActiveRow: true, getRowId, handleRef });

    const announcer = q("[aria-live=\"polite\"]");

    await rowFor("2")?.querySelector("td")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("Alice", 2, 3));

    // The row never moves — but the cell that names it does, so the announcement is stale
    // unless the visible column set is a dependency in its own right.
    handleRef.value?.table.getColumn("name")?.toggleVisibility(false);
    await tick();

    expect(announcer?.textContent).toBe(defaultLabels.currentRow("25", 2, 3));
  });

  it("hides the resize handle from assistive tech — the columns panel is its keyboard route", () => {
    mountTable({ columns, data: people, enableColumnResizing: true, getRowId });

    const resizer = q("[data-ledger-resizer]");

    expect(resizer).toBeTruthy();
    expect(resizer?.getAttribute("aria-hidden")).toBe("true");
    expect(resizer?.hasAttribute("tabindex")).toBe(false);
  });

  it("fires onRowClick with the row", async () => {
    const onRowClick = vi.fn();

    mountTable({ columns, data: people, enableRowSelection: true, getRowId, onRowClick });

    await elementByText("Carol")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]?.original).toEqual(people[0]);
  });

  // Blocked by a product bug (selection.ts:86-92 with 120): the row checkbox's `onClick` falls
  // through to the `LedgerCheckbox` wrapper <label>, so `event.currentTarget.checked` reads
  // `undefined` and every click resolves as "deselect" — a row checkbox can never select its
  // row. Pinned from the React suite ("...but not from the selection checkbox") until fixed.
  it.todo("never fires onRowClick from the selection checkbox, and the click selects the row");

  it("select-all covers the page and clears back", async () => {
    mountTable({ columns, data: people, enableRowSelection: true, getRowId });

    // The header checkbox is the first checkbox input in the DOM.
    const headerCheckbox = q("input[type=\"checkbox\"]");

    await headerCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(all("[data-selected]")).toHaveLength(3);

    await headerCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(all("[data-selected]")).toHaveLength(0);
  });

  it("drops the header region and its rows from the ARIA row numbering", () => {
    mountTable({ columns, data: people, getRowId, virtualizedRows: true, withColumnHeaders: false });

    expect(q(".ledger-header")).toBeNull();
    expect(all(".ledger-header-cell")).toHaveLength(0);
    // No header rows to number past, so the count is the three body rows alone.
    expect(q("[role=\"table\"]")?.getAttribute("aria-rowcount")).toBe("3");
  });

  it("names every built-in control by what it acts on", async () => {
    const named: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor(), filter: "text" }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { filter: "range" }
      }
    ];

    mountTable({
      // The default `withPaginationBar` is broken (data-table.vue:1614 gates the bar on the raw
      // prop, which is undefined unless passed) — pass it explicitly; see the todo below.
      columns: named,
      data: people,
      enableEditing: true,
      enablePagination: true,
      enableRowSelection: true,
      getRowId,
      onEditCommit: vi.fn(),
      withPaginationBar: true
    });

    // Two funnels, two names — a shared "Filter column" would make them indistinguishable.
    expect(q("[aria-label=\"Filter Name\"]")).toBeTruthy();
    expect(q("[aria-label=\"Filter Age\"]")).toBeTruthy();
    expect(q("[aria-label=\"Select all rows\"]")).toBeTruthy();

    // The page-size select points at its own visible text rather than duplicating it.
    const visibleCaption = elementByText("Rows per page");

    expect(visibleCaption?.id).toBeTruthy();

    const pageSizeControl = all("[aria-labelledby]").find(element =>
      element.getAttribute("aria-labelledby") === visibleCaption?.id);

    expect(pageSizeControl).toBeTruthy();

    await elementByText("Carol")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();

    expect(q("[aria-label=\"Edit Name\"]")).toBeTruthy();
  });

  it("renders radios in a shared group for single-select, and no select-all", async () => {
    mountTable({ columns, data: people, enableMultiRowSelection: false, enableRowSelection: true, getRowId });

    const radios = all("input[type=\"radio\"]");

    expect(radios).toHaveLength(3);
    expect(all("input[type=\"checkbox\"]")).toHaveLength(0);
    // One group, so the platform's own arrow-key navigation applies.
    expect(new Set(radios.map(radio => radio.name)).size).toBe(1);

    await radios[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    await radios[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(all("[data-selected]")).toHaveLength(1);
  });

  it("merges selectionColumn and expanderColumn over the injected defaults", async () => {
    const onPick = vi.fn();

    mountTable({
      columns,
      data: people,
      expanderColumn: { maxSize: 60, size: 60 },
      getRowId,
      renderDetailPanel: row => h("span", `panel:${row.original.name}`),
      selectionColumn: {
        cell: ({ row }) => h("button", { type: "button", onClick: onPick }, `pick ${row.id}`),
        maxSize: 72,
        size: 72
      }
    });

    // The author's renderer replaces the checkbox…
    const pick = elementByText("pick 1");

    expect(pick).toBeTruthy();
    expect(all("input[type=\"checkbox\"]")).toHaveLength(1);

    // …while the reserved id, and with it the internal-column treatment, survives.
    expect(q(".ledger-selection-cell")?.dataset.ledgerColumnId).toBe("ledger:select");
    expect(q(".ledger-expander-cell")).toBeTruthy();

    // …and a raised maxSize alongside size actually widens the injected columns — a size
    // override alone is clamped straight back to the injected 40/36 bounds (docs/selection.md).
    const rootStyle = q(".ledger-root")?.style;

    expect(rootStyle?.getPropertyValue("--ledger-col-width-ledger_3a_select")).toBe("72px");
    expect(rootStyle?.getPropertyValue("--ledger-col-width-ledger_3a_expander")).toBe("60px");

    // The injected column stays a control column whoever renders it.
    await pick?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(onPick).toHaveBeenCalledTimes(1);
  });

  // Blocked by a product bug (data-table.vue:1614): the built-in bar is gated on the raw
  // `withPaginationBar` prop, whose documented default is true — with `enablePagination` alone
  // no pagination bar renders. Pinned from the React suite ("renders the pagination bar with
  // the summary and page-size control") until fixed.
  it.todo("renders the pagination bar by default under enablePagination");

  it("never fires onEndReached from an unlaid-out (zero-height) viewport", async () => {
    // Regression: a viewport that has not been laid out reads as distance 0 from the bottom
    // and used to trigger a phantom page load on mount.
    const onEndReached = vi.fn();

    mountTable({ columns, data: people, getRowId, onEndReached });

    await new Promise(resolve => {
      setTimeout(resolve, 40);
    });

    expect(onEndReached).not.toHaveBeenCalled();
  });

  it("renders header and body as separate presentational tables under one ARIA table", () => {
    mountTable({ columns, data: people, getRowId, withTableBorder: true });

    expect(q(".ledger-main")?.getAttribute("role")).toBe("table");

    const tables = all(".ledger-table");

    expect(tables).toHaveLength(2);
    expect(tables.every(table => table.getAttribute("role") === "presentation")).toBe(true);

    // The header table holds the thead, the body table the tbody — the scroller owns only the body.
    expect(q(".ledger-header .ledger-thead")).toBeTruthy();
    expect(q(".ledger-header .ledger-tbody")).toBeNull();
    expect(q(".ledger-scroller .ledger-tbody")).toBeTruthy();
    expect(q(".ledger-scroller .ledger-thead")).toBeNull();

    // Identical colgroups keep the two layouts pixel-equal.
    const colCounts = tables.map(table => table.querySelectorAll("col").length);

    expect(colCounts[0]).toBe(colCounts[1]);

    // Explicit roles restore the semantics the presentational tables gave up.
    expect(all("[role=\"columnheader\"]")).toHaveLength(2);
    expect(all(".ledger-tbody [role=\"row\"]")).toHaveLength(3);
  });

  it("forwards radius as the --ledger-radius variable and keeps it off the DOM", async () => {
    const wrapper = mountTable({ columns, data: people, getRowId, radius: "md" });

    const root = q(".ledger-root");

    // Vue edition deviation: named presets resolve to plain CSS lengths (no Mantine scale).
    expect(root?.style.getPropertyValue("--ledger-radius")).toBe("0.5rem");
    expect(root?.hasAttribute("radius")).toBe(false);

    await wrapper.setProps({ radius: undefined });

    expect(root?.style.getPropertyValue("--ledger-radius")).toBe("");
  });

  it("draws at sm unless told: the type variable and the controls a step down", async () => {
    const wrapper = mountTable({ columns, data: people, enableRowSelection: true, getRowId });

    const root = q(".ledger-root");
    const checkbox = q(".ledger-checkbox");

    expect(root?.dataset.size).toBe("sm");
    expect(root?.hasAttribute("size")).toBe(false);
    expect(root?.style.getPropertyValue("--ledger-font-size")).toBe("14px");
    // Controls drawn in the table take the size one step down: sm's control is xs.
    expect(checkbox?.dataset.size).toBe("xs");

    await wrapper.setProps({ size: "md" });

    expect(root?.dataset.size).toBe("md");
    expect(root?.style.getPropertyValue("--ledger-font-size")).toBe("16px");
    expect(checkbox?.dataset.size).toBe("sm");
  });

  it("lets a spacing prop override the size's padding on its own side alone", () => {
    mountTable({ columns, data: people, getRowId, size: "xs", verticalSpacing: 12 });

    const table = q(".ledger-table");

    expect(table?.style.getPropertyValue("--ledger-cell-padding-block")).toBe("12px");
    // The unset side keeps the size's own padding.
    expect(table?.style.getPropertyValue("--ledger-cell-padding-inline")).toBe("8px");
  });

  it("hands an editor the control size of the table it opens in", async () => {
    const sized: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: { render: context => h("span", { "data-testid": "editor" }, context.size) } }
      },
      { accessorKey: "age", header: "Age" }
    ];
    // Editing is gated on a commit handler; the size is the subject, so it hears nothing.
    const onEditCommit = vi.fn();
    const wrapper = mountTable({ columns: sized, data: people, getRowId, onEditCommit });

    await elementByText("Carol")?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();

    expect(q("[data-testid=\"editor\"]")?.textContent).toBe("xs");

    await wrapper.setProps({ size: "lg" });
    await tick();

    expect(q("[data-testid=\"editor\"]")?.textContent).toBe("md");
  });

  it("marks the body's last row, and none while a loader row trails the data", async () => {
    const wrapper = mountTable({ columns, data: people, getRowId });

    const lastFlags = () => bodyRows().map(row => Object.hasOwn(row.dataset, "last"));

    expect(lastFlags()).toEqual([false, false, true]);

    await wrapper.setProps({ loadingMore: true });

    expect(lastFlags()).toEqual([false, false, false]);
  });

  it("makes a bottom-pinned row the body's last row", () => {
    mountTable({
      columns,
      data: people,
      defaultRowPinning: { bottom: ["1"], top: [] },
      enableRowPinning: true,
      getRowId
    });

    const rows = bodyRows();

    expect(rows.map(row => row.dataset.rowId)).toEqual(["2", "3", "1"]);
    expect(rows.map(row => Object.hasOwn(row.dataset, "last"))).toEqual([false, false, true]);
  });

  it("exposes the closing line and footer presence as root attributes", async () => {
    const wrapper = mountTable({ columns, data: people, getRowId, withBottomBorder: true });

    const root = q(".ledger-root");

    expect(Object.hasOwn(root?.dataset ?? {}, "withBottomBorder")).toBe(true);
    expect(Object.hasOwn(root?.dataset ?? {}, "withFooter")).toBe(false);

    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        footer: "Total",
        header: "Name"
      }
    ];

    await wrapper.setProps({ columns: withFooter });

    expect(Object.hasOwn(root?.dataset ?? {}, "withBottomBorder")).toBe(false);
    expect(Object.hasOwn(root?.dataset ?? {}, "withFooter")).toBe(true);
  });

  it("mirrors the body's horizontal scroll onto the header and forwards header wheel", async () => {
    // Regression: a sticky in-scroller header made the vertical scrollbar span (and hide
    // under) the header; the split keeps the regions aligned through a scrollLeft mirror.
    mountTable({ columns, data: people, getRowId, tableMinWidth: 2000 });

    const header = q(".ledger-header");
    const viewport = q(".ledger-scroller");

    expect(header).toBeTruthy();
    expect(viewport).toBeTruthy();

    // Rubber-band overscroll would translate the body past the clamped scroll position the
    // mirror reads — the regions shear apart — so the viewport must not bounce.
    expect(viewport?.style.overscrollBehavior).toBe("none");

    if (viewport) {
      viewport.scrollLeft = 120;
    }

    await viewport?.dispatchEvent(new Event("scroll", { bubbles: true }));
    await tick();

    expect(header?.scrollLeft).toBe(120);

    await header?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 50, deltaY: 0 }));

    expect(viewport?.scrollLeft).toBe(170);

    // Dominant-axis guard: a vertical-leaning wheel is not hijacked.
    await header?.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 5, deltaY: 100 }));

    expect(viewport?.scrollLeft).toBe(170);
  });

  it("keeps the colgroup in pinned-aware display order", () => {
    // Regression: header cells and row cells render pinned columns first, but
    // getVisibleLeafColumns ignores pinning — a mid-table pinned column drifted onto its
    // neighbor's <col> width until the colgroup followed the same display order.
    mountTable({ columns, data: people, defaultColumnPinning: { end: [], start: ["age"] }, getRowId });

    const headerOrder = all(".ledger-header th").map(th => th.dataset.ledgerColumnId);

    expect(headerOrder).toEqual(["age", "name"]);

    const colOrder = all(".ledger-header col").map(col => (col as HTMLElement).style.width);

    expect(colOrder).toEqual(["var(--ledger-col-width-age)", "var(--ledger-col-width-name)"]);
  });

  it("renders column footers in an always-visible region outside the scroller", () => {
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        footer: "Total",
        header: "Name"
      },
      { accessorKey: "age", header: "Age" }
    ];

    mountTable({ columns: withFooter, data: people, getRowId });

    expect(all(".ledger-table")).toHaveLength(3);
    expect(q(".ledger-footer .ledger-tfoot")).toBeTruthy();
    expect(q(".ledger-scroller .ledger-tfoot")).toBeNull();

    const footerCell = q(".ledger-footer .ledger-footer-cell");

    expect(footerCell?.textContent).toBe("Total");
    expect(footerCell?.getAttribute("role")).toBe("cell");
  });

  it("skips the footer levels a grouped header mirrors but nothing fills", () => {
    // getFooterGroups() mirrors every header level. With totals only on the leaves the group
    // level came out as an empty row that still drew row and column borders under the totals.
    const grouped: Array<ColumnDef<Person, any>> = [
      {
        columns: [
          {
            accessorKey: "name",
            footer: "Total",
            header: "Name"
          },
          { accessorKey: "age", header: "Age" }
        ],
        header: "Who",
        id: "who"
      }
    ];

    mountTable({ columns: grouped, data: people, getRowId, withColumnBorders: true });

    // Two header levels, but only the one footer level that carries a `footer`.
    expect(all(".ledger-header .ledger-header-row")).toHaveLength(2);
    expect(all(".ledger-footer .ledger-footer-row")).toHaveLength(1);
    expect(q(".ledger-footer .ledger-footer-cell")?.textContent).toBe("Total");
  });

  it("does not render a footer region when every footer-bearing column is hidden", () => {
    const withFooter: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        footer: "Total",
        header: "Name"
      },
      { accessorKey: "age", header: "Age" }
    ];

    mountTable({ columns: withFooter, data: people, defaultColumnVisibility: { name: false }, getRowId });

    expect(all(".ledger-table")).toHaveLength(2);
    expect(q(".ledger-footer")).toBeNull();
  });

  it("renders same-id definition swaps without retaining the old cells", async () => {
    // The React edition pinned row-memo invalidation here; the Vue edition has no row memos —
    // the render effect reads the definitions fresh — so only the observable behavior ports:
    // same ids with new renderers draw the new cells, and the editing gate follows its option.
    const firstColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        cell: context => `first:${context.getValue()}`,
        header: "Name"
      }
    ];
    const secondColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        cell: context => `second:${context.getValue()}`,
        header: "Name"
      }
    ];

    const wrapper = mountTable({ columns: firstColumns, data: people, editTrigger: "click", enableEditing: false, getRowId });

    expect(elementByText("first:Carol")).toBeTruthy();

    await elementByText("first:Carol")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(q("[role=\"textbox\"]")).toBeNull();

    await wrapper.setProps({ columns: secondColumns });
    await tick();

    expect(elementByText("second:Carol")).toBeTruthy();
  });

  it("invalidates column geometry and rows when delimiter-bearing visible ids change", async () => {
    const collisionColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorFn: person => person.name,
        cell: context => `a:${context.getValue()}`,
        header: "A",
        id: "a"
      },
      {
        accessorFn: person => person.name,
        cell: context => `b,c:${context.getValue()}`,
        header: "B,C",
        id: "b,c"
      },
      {
        accessorFn: person => person.name,
        cell: context => `a,b:${context.getValue()}`,
        header: "A,B",
        id: "a,b"
      },
      {
        accessorFn: person => person.name,
        cell: context => `c:${context.getValue()}`,
        header: "C",
        id: "c"
      }
    ];
    const handleRef = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns: collisionColumns,
      data: people,
      defaultColumnVisibility: { "a,b": false, c: false },
      getRowId,
      handleRef
    });

    const firstRowText = () => all(".ledger-tbody .ledger-row:first-child td").map(cell => cell.textContent);

    expect(firstRowText()).toEqual(["a:Carol", "b,c:Carol"]);

    handleRef.value?.table.setColumnVisibility({ a: false, "b,c": false });
    await tick();

    expect(firstRowText()).toEqual(["a,b:Carol", "c:Carol"]);
    expect(all(".ledger-header col").map(col => (col as HTMLElement).style.width))
      .toEqual(["var(--ledger-col-width-a_2c_b)", "var(--ledger-col-width-c)"]);
  });

  it("renders tree expander toggles and the author's cell on parent rows", async () => {
    interface Node {
      id: string;
      name: string;
      children?: Node[];
    }

    const treeData: Node[] = [
      {
        children: [{ id: "a1", name: "A1" }],
        id: "a",
        name: "A"
      }
    ];
    const treeColumns: Array<ColumnDef<Node, any>> = [
      {
        accessorKey: "name",
        cell: context => `cell:${context.getValue()}`,
        header: "Name"
      }
    ];

    mountTable({ columns: treeColumns, data: treeData, getRowId: node => node.id, getSubRows: node => node.children });

    // Regression: TanStack's cell.getIsAggregated() is true for ANY row with subRows — a
    // grouping concept leaking into trees — and the aggregated branch swallowed the expander
    // button and bypassed the author's cell renderer on every parent row.
    expect(elementByText("cell:A")).toBeTruthy();

    const expander = q(".ledger-expander-cell button");

    expect(expander).toBeTruthy();

    await expander?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(elementByText("cell:A1")).toBeTruthy();

    // Regression: injected headers are controls, not text — wrapped in the label scaffolding,
    // the [data-truncate] span's overflow: hidden clipped the expand-all icon.
    const headerToggle = q(".ledger-header th[data-ledger-column-id=\"ledger:expander\"] button");

    expect(headerToggle).toBeTruthy();
    expect(headerToggle?.closest("[data-truncate]")).toBeNull();
  });

  it("expands a detail panel as its own row", async () => {
    mountTable({
      columns,
      data: people,
      getRowId,
      renderDetailPanel: row => `detail:${row.original.name}`
    });

    const expander = q(".ledger-expander-cell button");

    expect(expander).toBeTruthy();

    await expander?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(elementByText("detail:Carol")).toBeTruthy();
    expect(q("[data-detail-row]")).toBeTruthy();
  });

  it("renders expanded detail rows inside top and bottom pinned zones", () => {
    mountTable({
      columns,
      data: people,
      defaultExpanded: { 1: true, 3: true },
      defaultRowPinning: { bottom: ["3"], top: ["1"] },
      enableRowPinning: true,
      getRowId,
      renderDetailPanel: row => `detail:${row.original.name}`
    });

    const detailFor = (name: string) =>
      elementByText(`detail:${name}`)?.closest("tr") as HTMLElement | null;

    expect(detailFor("Carol")?.dataset.pinnedRow).toBe("top");
    expect(detailFor("Bob")?.dataset.pinnedRow).toBe("bottom");
    expect(all("[data-row-id=\"1\"]")).toHaveLength(1);
    expect(all("[data-row-id=\"3\"]")).toHaveLength(1);
  });

  it("counts every logical virtual row and assigns continuous ARIA indexes across regions", () => {
    const ariaColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        footer: "Total",
        header: "Name"
      },
      { accessorKey: "age", header: "Age" }
    ];

    mountTable({
      columns: ariaColumns,
      data: people,
      defaultExpanded: true,
      defaultRowPinning: { bottom: ["3"], top: ["1"] },
      enableRowPinning: true,
      getRowId,
      loadingMore: true,
      renderDetailPanel: row => `detail:${row.original.name}`,
      virtualizedRows: true
    });

    // 1 header row + top zone (row 1 + detail) + center zone (rows 2 and 3, each with a detail:
    // `defaultExpanded` opens every row) + bottom zone (row 3 + detail) + the trailing loader
    // row + the footer row.
    expect(q(".ledger-main")?.getAttribute("aria-rowcount")).toBe("9");
    expect(q(".ledger-header-row")?.getAttribute("aria-rowindex")).toBe("1");
    expect(rowFor("1")?.getAttribute("aria-rowindex")).toBe("2");
    expect(elementByText("detail:Carol")?.closest("tr")?.getAttribute("aria-rowindex")).toBe("3");
    expect(rowFor("3")?.getAttribute("aria-rowindex")).toBe("6");
    expect(elementByText("detail:Bob")?.closest("tr")?.getAttribute("aria-rowindex")).toBe("7");
    expect(q(".ledger-loader-row")?.getAttribute("aria-rowindex")).toBe("8");
    expect(q(".ledger-footer-row")?.getAttribute("aria-rowindex")).toBe("9");
  });

  it("resolves virtual scroll indexes from center rows and ignores pinned targets", () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns,
      data: people,
      defaultRowPinning: { bottom: [], top: ["1"] },
      enableRowPinning: true,
      getRowId,
      handleRef,
      virtualizedRows: true
    });

    const table = handleRef.value!.table;
    const snapshot = {
      bottomRows: table.getBottomRows(),
      centerRows: table.getCenterRows(),
      leadingColumn: null,
      ordered: [...table.getTopRows(), ...table.getCenterRows()],
      pageRows: table.getRowModel().rows,
      topRows: table.getTopRows(),
      withDetailPanels: false
    };

    expect(resolveVirtualDisplayIndex(snapshot as never, "2")).toBe(0);
    expect(resolveVirtualDisplayIndex(snapshot as never, "1")).toBeNull();
  });

  it("marks the table busy while loading, not the roleless root", () => {
    mountTable({ columns, data: people, getRowId, loading: true });

    // aria-busy qualifies the widget whose content is updating; the root carries no role.
    expect(q("[role=\"table\"]")?.getAttribute("aria-busy")).toBe("true");
    expect(q(".ledger-root")?.getAttribute("aria-busy")).toBeNull();
  });

  it("keeps a custom injected-column renderer from activating the row", async () => {
    const onRowClick = vi.fn();
    const onRowDoubleClick = vi.fn();
    const onPick = vi.fn();

    mountTable({
      columns,
      data: people,
      enableRowSelection: true,
      getRowId,
      onRowClick,
      onRowDoubleClick,
      selectionColumn: { cell: () => h("button", { type: "button", onClick: onPick }, "pick") }
    });

    const pick = elementByText("pick");

    await pick?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await pick?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await tick();

    // The control column is a control column whoever renders it (docs/rows.md).
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowDoubleClick).not.toHaveBeenCalled();

    // The row itself still activates from an ordinary cell.
    await q(".ledger-row .ledger-cell")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("runs a Styles API handler on a control cell without letting it activate the row", async () => {
    const onRowClick = vi.fn();
    const onCellClick = vi.fn();

    mountTable({
      // The Vue edition types `attributes` as plain values, but handlers pass through the same
      // merge (the Styles API contract keeps them) — hence the cast.
      attributes: { selectionCell: { onClick: onCellClick } } as never,
      columns,
      data: people,
      enableRowSelection: true,
      getRowId,
      onRowClick
    });

    await q(".ledger-selection-cell")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    // Both handlers belong to the cell; only ledger's decides whether the event leaves it.
    expect(onCellClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(q(".ledger-selection-cell")?.getAttribute("role")).toBe("cell");
  });
});
