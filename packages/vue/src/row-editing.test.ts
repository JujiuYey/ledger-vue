import { h, nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableHandle } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { checkboxEditor, numberEditor, textEditor } from "./editors";

enableAutoUnmount(afterEach);

interface Person {
  id: string;
  name: string;
  age: number;
  /**
   * Never in the shared `columns` — it is here for the tests that need a checkbox column.
   */
  active?: boolean;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    age: 30,
    active: true
  },
  {
    id: "2",
    name: "Alice",
    age: 25,
    active: false
  }
];

const columns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: textEditor() }
  },
  {
    accessorKey: "age",
    header: "Age",
    meta: { edit: numberEditor() }
  },
  { accessorKey: "id", header: "Id" }
];

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

function elementByText(text: string, root: ParentNode = document): HTMLElement | null {
  return all("*", root).find(element => element.children.length === 0 && element.textContent === text) ?? null;
}

function buttonByName(name: string, root: ParentNode = document): HTMLElement | null {
  return all("button", root).find(button =>
    button.getAttribute("aria-label") === name || button.textContent?.trim() === name) ?? null;
}

const editorInputs = () => [...document.querySelectorAll<HTMLInputElement>(".ledger-cell-editor input")];
// React keyed the focus stop off `.ledger-scroller [tabindex="0"]`; the Vue body viewport is
// reka's scrolling div, which is what carries the tabindex and the keydown map now.
const viewport = () => q("[data-reka-scroll-area-viewport]");
const editingRowElement = (id: string) => q(`[data-row-id="${id}"][data-editing-row]`);

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/** The React edition's `waitFor` — polls a DOM condition across Vue's flush cycles. */
async function waitForDom(assert: () => void): Promise<void> {
  await vi.waitFor(async () => {
    await tick();
    assert();
  });
}

/** React's `fireEvent.keyDown` — real DOM events, flushed through Vue. */
async function keyDown(element: Element | null | undefined, key: string): Promise<void> {
  element?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  await tick();
}

/** React's `fireEvent.change(input, { target: { value } })` — the shipped editors read `input`. */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

/** React's `fireEvent.doubleClick` — the default edit trigger. */
async function doubleClickCell(element: Element | null | undefined): Promise<void> {
  element?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  await tick();
}

describe("keyboard entry into editing", () => {
  it("starts cell-mode editing at the row's first editable cell on F2", async () => {
    mountTable({
      enableActiveRow: true,
      columns,
      data: people,
      defaultActiveRowId: "2",
      getRowId: (person: Person) => person.id,
      onEditCommit: vi.fn()
    });
    await tick();

    // Enter activates the row; only F2 edits — that overload is why the pattern reserves it.
    await keyDown(viewport(), "Enter");
    expect(editorInputs()).toHaveLength(0);

    await keyDown(viewport(), "F2");

    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    expect(
      document.querySelector("[data-row-id=\"2\"] td[data-ledger-column-id=\"name\"][data-editing]")
    ).toBeTruthy();
  });

  it("opens the whole row on F2 under editMode row", async () => {
    mountTable({
      enableActiveRow: true,
      columns,
      data: people,
      defaultActiveRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit: vi.fn()
    });
    await tick();

    await keyDown(viewport(), "F2");

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    expect(editingRowElement("1")).toBeTruthy();
    // F2 places focus in an input — landing on the editors without the caret would leave the
    // keyboard user stranded on the viewport.
    await waitForDom(() => expect(document.activeElement).toBe(editorInputs()[0]));
  });

  it.todo("enters at the cell on screen when F2 follows a discarded render: React-only machinery — startTransition/Suspense throwaway renders have no Vue counterpart (the DOM always shows the committed state), so the scenario cannot be constructed");

  it.todo("enters the row on screen when F2 follows a discarded render that emptied the data: React-only machinery — startTransition/Suspense throwaway renders have no Vue counterpart");

  it("does not open an editor on a current row that paginated off the screen", async () => {
    const onEditingCellChange = vi.fn();

    mountTable({
      enableActiveRow: true,
      enablePagination: true,
      columns,
      data: people,
      defaultActiveRowId: "2",
      getRowId: (person: Person) => person.id,
      pagination: { pageIndex: 0, pageSize: 1 },
      onEditCommit: vi.fn(),
      onEditingCellChange,
      onPaginationChange: vi.fn()
    });
    await tick();

    // The current row is a slice, and it can name a row this page does not show. F2 opens the
    // row the user is looking at — an editor nobody can see is not that.
    expect(elementByText("Alice")).toBeNull();
    await keyDown(viewport(), "F2");

    expect(onEditingCellChange).not.toHaveBeenCalled();
  });

  it("opens a row whose only editable column is a checkbox on F2", async () => {
    // What a checkbox column *is* depends on the mode: in cell mode it commits on toggle and has
    // no editor for F2 to open, but in row mode it is a draft-bound editor like any other.
    const checkboxOnly: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: { instant: checkboxEditor() } }
      }
    ];

    mountTable({
      enableActiveRow: true,
      columns: checkboxOnly,
      data: people,
      defaultActiveRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit: vi.fn()
    });
    await tick();

    await keyDown(viewport(), "F2");

    await waitForDom(() => expect(editingRowElement("1")).toBeTruthy());
    expect(document.querySelectorAll(".ledger-cell-editor input[type=\"checkbox\"]")).toHaveLength(1);
  });

  it("does not open a cell-mode checkbox on F2", async () => {
    const checkboxOnly: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: { instant: checkboxEditor() } }
      }
    ];

    mountTable({
      enableActiveRow: true,
      columns: checkboxOnly,
      data: people,
      defaultActiveRowId: "1",
      getRowId: (person: Person) => person.id,
      onEditCommit: vi.fn()
    });
    await tick();

    await keyDown(viewport(), "F2");

    // Toggling is the commit, so there is no editor to place a caret in — F2 has nowhere to go.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing]")).toBeNull();
  });
});

describe("row editing mode", () => {
  it("opens every editable cell of the row and commits the whole row on Enter", async () => {
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit
    });
    await tick();

    await doubleClickCell(document.querySelector("[data-row-id=\"2\"] td[data-ledger-column-id=\"name\"]"));

    // Both editable cells host editors at once; the plain column does not.
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    const [nameInput, ageInput] = editorInputs();
    await typeInto(nameInput as HTMLInputElement, "Alicia");
    await typeInto(ageInput as HTMLInputElement, "26");

    await keyDown(nameInput as HTMLInputElement, "Enter");

    await waitForDom(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      row: { id: string };
      values: Record<string, unknown>;
      previousValues: Record<string, unknown>;
    };
    expect(change.row.id).toBe("2");
    expect(change.values).toEqual({ name: "Alicia", age: 26 });
    expect(change.previousValues).toEqual({ name: "Alice", age: 25 });
  });

  it("cancels the whole row on Escape without committing", async () => {
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit
    });
    await tick();

    await doubleClickCell(document.querySelector("[data-row-id=\"1\"] td[data-ledger-column-id=\"name\"]"));
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    await typeInto(editorInputs()[0] as HTMLInputElement, "Changed");
    await keyDown(editorInputs()[0] as HTMLInputElement, "Escape");

    await waitForDom(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(elementByText("Carol")).toBeTruthy();
  });

  it("blocks the commit on a validation failure and shows it on the failing editor", async () => {
    const onRowEditCommit = vi.fn();
    const validatingColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            render: textEditor(),
            validate: value => value === "" ? "Name is required" : null
          }
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    mountTable({
      columns: validatingColumns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit
    });
    await tick();

    await doubleClickCell(document.querySelector("[data-row-id=\"1\"] td[data-ledger-column-id=\"name\"]"));
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    await typeInto(editorInputs()[0] as HTMLInputElement, "");
    await keyDown(editorInputs()[0] as HTMLInputElement, "Enter");

    await waitForDom(() => expect(elementByText("Name is required")).toBeTruthy());
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(editorInputs().length).toBeGreaterThan(0);
  });

  it("does not carry a draft across a controlled editingRowId switch", async () => {
    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // The application moves the edit itself; startRowEditing never runs, so the store has to
    // notice the row changed on its own.
    await wrapper.setProps({ editingRowId: "2" });
    await tick();

    await waitForDom(() => expect(editingRowElement("2")).toBeTruthy());
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Alice");
  });

  it("does not hand a controlled switch the previous row's in-flight commit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
    const onRowEditCommit = vi.fn(({ values }: { values: Record<string, unknown> }) => {
      committed.push(values);

      return inFlight.promise;
    });

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    // The controller moves the edit while Carol's write is still in flight. Alice's own commit
    // must be issued, not answered with the promise Carol left behind.
    await wrapper.setProps({ editingRowId: "2" });
    await tick();

    await waitForDom(() => expect(editingRowElement("2")).toBeTruthy());

    await typeInto(editorInputs()[0] as HTMLInputElement, "Second");
    handle.value?.stopEditing({ commit: true });

    expect(onRowEditCommit).toHaveBeenCalledTimes(2);
    expect(committed[1]).toMatchObject({ name: "Second" });

    await inFlight.resolve();
    await inFlight.promise;
    await tick();
  });

  it("lets a controlled switch overrule a start still waiting on a commit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Asking for Alice commits Carol first and waits on it; the controller then closes editing
    // outright, which overrules the row that request was going to open.
    handle.value?.startEditing("2");
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    onEditingRowIdChange.mockClear();
    await wrapper.setProps({ editingRowId: null });
    await tick();

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    // Carol's commit succeeding must not resurrect the request for Alice.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
    expect(document.querySelector("[data-editing-row]")).toBeNull();
    expect(editorInputs()).toHaveLength(0);
  });

  it.todo("keeps the row on screen when a transition to another row never commits: React-only machinery — the suspended startTransition the case builds on has no Vue counterpart");

  it("keeps editing the row on screen when the controller declines the switch", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    // A controlled slice whose owner ignores the change. React's contract is that the row on
    // screen stays the one `editingRowId` names, so that is the row every write still belongs
    // to — asking to move the edit is not the same as having moved it.
    const onEditingRowIdChange = vi.fn();

    mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    handle.value?.startEditing("2");
    await tick();

    expect(onEditingRowIdChange).toHaveBeenCalledWith("2");
    expect(editingRowElement("1")).toBeTruthy();

    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      row: { id: string };
      values: Record<string, unknown>;
    };
    expect(change.row.id).toBe("1");
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
  });

  it("sends one write when the row is committed twice before the close renders", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Closing the row and opening another are answered by a single render, so the second commit
    // runs while the first row is still the one on screen. The write it would repeat has
    // already gone out.
    handle.value?.stopEditing({ commit: true });
    handle.value?.startEditing("2");
    await tick();

    await waitForDom(() => expect(editingRowElement("2")).toBeTruthy());
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("captures the baseline when the edited row arrives after the first render", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    // Deep-linking straight into an edit: the row is named before the fetch that carries it
    // lands, so the first pass has no row to read a previous value from.
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    const wrapper = mountTable({
      columns,
      data: [],
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });
    await tick();
    expect(editorInputs()).toHaveLength(0);

    await wrapper.setProps({ data: people });
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // The column leaves the definitions, so only the baseline can say what was there before.
    await wrapper.setProps({ columns: narrow });
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as { previousValues: Record<string, unknown> };
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("keeps a value typed while an async row commit was in flight", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
    // A custom editor is never disabled by the pending state, so typing while the write is out
    // is ordinary rather than exotic.
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue }: any) => h("input", {
            "aria-label": "Edit Name",
            value: value === null || value === undefined ? "" : String(value),
            onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
          })
        }
      }
    ];

    mountTable({
      columns: customName,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: ({ values }: { values: Record<string, unknown> }) => {
        committed.push(values);

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });
    expect(committed).toEqual([{ name: "First" }]);

    // The request is still out, and the row is still on screen: what is typed now is a value
    // the first write never carried.
    await typeInto(editorInputs()[0] as HTMLInputElement, "Second");

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    handle.value?.stopEditing({ commit: true });
    expect(committed).toEqual([{ name: "First" }, { name: "Second" }]);
  });

  it("puts the editors back when the application declines to close a cancelled row", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    const nameInput = editorInputs()[0] as HTMLInputElement;
    await typeInto(nameInput, "Drafted");
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Drafted");

    await keyDown(nameInput, "Escape");

    // The cancel discarded the pending values and the controller kept the row, so what the row
    // shows has to be the row again — not a value nothing would commit.
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");

    handle.value?.stopEditing({ commit: true });
    await tick();
    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("writes the values this session already committed, not the data it has not reached", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const committed: Array<Record<string, unknown>> = [];

    mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: ({ values }: { values: Record<string, unknown> }) => {
        committed.push(values);
      }
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });
    expect(committed).toEqual([{ age: 30, name: "First" }]);

    // The application kept the row open and has not fed the write back into `data`, so the cell
    // still reads "Carol". A second commit must not carry that back over the name it just wrote.
    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    expect(committed).toEqual([
      { age: 30, name: "First" },
      { age: 31, name: "First" }
    ]);
  });

  it("keeps an uncontrolled row open when its commit settles behind a newer draft", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<Record<string, unknown>> = [];
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue }: any) => h("input", {
            "aria-label": "Edit Name",
            value: value === null || value === undefined ? "" : String(value),
            onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
          })
        }
      }
    ];

    // No `editingRowId` prop: the ordinary uncontrolled slice, which closes the row itself.
    mountTable({
      columns: customName,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: ({ values }: { values: Record<string, unknown> }) => {
        committed.push(values);

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });
    expect(committed).toEqual([{ name: "First" }]);

    await typeInto(editorInputs()[0] as HTMLInputElement, "Second");

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The write that settled never carried "Second", so leaving now would drop it.
    expect(editorInputs()).toHaveLength(1);
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Second");
    expect(document.querySelector("[data-pending]")).toBeNull();

    handle.value?.stopEditing({ commit: true });
    await waitForDom(() => expect(committed).toHaveLength(2));
    expect(committed[1]).toEqual({ name: "Second" });
  });

  it("cancels the row when the table-level switch shuts under it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Losing eligibility cancels (docs/editing.md) — the body merely stops rendering editors, so
    // the session has to end itself or it would sit there behind a closed gate.
    await wrapper.setProps({ enableEditing: false });

    await waitForDom(() => expect(document.querySelector("[data-editing-row]")).toBeNull());
    expect(onRowEditCommit).not.toHaveBeenCalled();

    // Reopening the gate must not bring the session — or its draft — back with it.
    await wrapper.setProps({ enableEditing: true });
    await tick();

    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("keeps a row whose other columns are still editable, dropping only the closed one", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    const readOnlyName: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    await wrapper.setProps({ columns: readOnlyName });
    await tick();

    // One column shutting is not the row shutting: age is still editable, so the row stays.
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    expect(editingRowElement("1")).toBeTruthy();

    // The gate reopens: the value typed behind it is gone, because nothing could have shown it.
    await wrapper.setProps({ columns });
    await tick();

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");

    handle.value?.stopEditing({ commit: true });
    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("lets data that moved past the value it acknowledged win the next commit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const committed: Array<{ previousValues: Record<string, unknown>; values: Record<string, unknown> }> = [];

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: (change: {
        previousValues: Record<string, unknown>;
        values: Record<string, unknown>;
      }) => {
        committed.push({ previousValues: change.previousValues, values: change.values });
      }
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });
    expect(committed[0]?.values).toEqual({ age: 30, name: "First" });

    // The server normalized what it accepted and fed that back. It, not the value we sent, is
    // what the row now holds — and what the editor has to show.
    await wrapper.setProps({ data: [
      {
        age: 30,
        id: "1",
        name: "FIRST"
      },
      people[1] as Person
    ] });

    await waitForDom(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("FIRST"));

    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    expect(committed).toHaveLength(2);
    expect(committed[1]?.values).toEqual({ age: 31, name: "FIRST" });
    expect(committed[1]?.previousValues).toEqual({ age: 30, name: "FIRST" });
  });

  it("shows what the session wrote when an editor remounts under it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });

    // The write went through and the application kept the row open without feeding it back. An
    // editor that unmounts and returns — the columns panel here, virtual scrolling in a real
    // table — must not go back to showing a value the row no longer holds.
    handle.value?.table.getColumn("name")?.toggleVisibility(false);
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    handle.value?.table.getColumn("name")?.toggleVisibility(true);

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("First");
  });

  it("does not bring a written value back when the data returns to what it departed from", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const committed: Array<Record<string, unknown>> = [];
    const named = (name: string): Person[] => [
      {
        age: 30,
        id: "1",
        name
      },
      people[1] as Person
    ];

    const wrapper = mountTable({
      columns,
      data: named("Carol"),
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: ({ values }: { values: Record<string, unknown> }) => {
        committed.push(values);
      }
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });
    expect(committed).toHaveLength(1);

    // The write lands in the data...
    await wrapper.setProps({ data: named("First") });
    await waitForDom(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("First"));

    // ...and is then reverted by somebody else. That is the data's own value now, not ours
    // resurfacing because it happens to match what the write departed from.
    await wrapper.setProps({ data: named("Carol") });

    await waitForDom(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol"));

    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    expect(committed).toHaveLength(2);
    expect(committed[1]).toEqual({ age: 31, name: "Carol" });
  });

  it("keeps the row when its only editable column leaves the definitions", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    const editableName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor() }
      },
      { accessorKey: "id", header: "Id" }
    ];
    // The breakpoint takes the column away entirely. No gate shut — the layout changed.
    const narrow: Array<ColumnDef<Person, any>> = [{ accessorKey: "id", header: "Id" }];

    const wrapper = mountTable({
      columns: editableName,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    await wrapper.setProps({ columns: narrow });
    await tick();

    expect(editingRowElement("1")).toBeTruthy();

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      previousValues: Record<string, unknown>;
      values: Record<string, unknown>;
    };
    expect(change.values).toEqual({ name: "Drafted" });
    expect(change.previousValues).toEqual({ name: "Carol" });
  });

  it("ends the row when a commit rejects after the table switch shut behind it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });

    // The gate shuts while the write is out. The row stops presenting as editing at once, and
    // every editor unmounts with it — so nothing is left whose state change could bring the
    // session round again, and the settlement has to end it.
    await wrapper.setProps({ enableEditing: false });
    await waitForDom(() => {
      expect(document.querySelector("[data-editing-row]")).toBeNull();
      expect(editorInputs()).toHaveLength(0);
    });

    inFlight.reject(new Error("nope"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    expect(document.querySelector("[data-editing-row]")).toBeNull();

    await wrapper.setProps({ enableEditing: true });
    await tick();

    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("does not authorize a switch when the gate shuts under a pending commit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit: () => inFlight.promise
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Asking for Alice commits Carol first and waits on that write.
    handle.value?.startEditing("2");
    await tick();
    onEditingRowIdChange.mockClear();

    // Editing is switched off while the write is out.
    await wrapper.setProps({ enableEditing: false });

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The session ended because the gate shut, not because the row finished — nothing may be
    // opened on the strength of it, and the one ending is requested once.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
    expect(onEditingRowIdChange.mock.calls.filter(call => call[0] === null)).toHaveLength(1);
  });

  it("records a baseline for a column the session only meets later", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    const ageOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    const wrapper = mountTable({
      columns: ageOnly,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    // The session opens on a narrow breakpoint, where `name` is not in the definitions at all.
    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    // It widens, `name` arrives, and the user edits it.
    await wrapper.setProps({ columns });
    await tick();
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Then it narrows again and `name` is gone by commit time. What it held has to have been
    // recorded when the session met it, not only when the session opened.
    await wrapper.setProps({ columns: ageOnly });
    await tick();
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      previousValues: Record<string, unknown>;
      values: Record<string, unknown>;
    };
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("cancels the row when the gate shuts on the only column it met later", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const ageOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];
    const nameOnly: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor() }
      }
    ];
    const readOnlyName: Array<ColumnDef<Person, any>> = [{ accessorKey: "name", header: "Name" }];

    const wrapper = mountTable({
      columns: ageOnly,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: vi.fn()
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    // `age` leaves and `name` arrives: the only column the session can now edit is one it never
    // saw when it opened.
    await wrapper.setProps({ columns: nameOnly });
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    // Its gate shuts. That is a gate closing on a column this session was editing, so the row
    // ends — which it cannot know from the snapshot taken at the start.
    await wrapper.setProps({ columns: readOnlyName });

    await waitForDom(() => expect(document.querySelector("[data-editing-row]")).toBeNull());
  });

  it("falls back to the last previous it saw when a column's definition goes", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];
    const caroline: Person[] = [
      {
        age: 30,
        id: "1",
        name: "Caroline"
      },
      people[1] as Person
    ];

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Somebody else changes the row while the column is still on screen. That is what the
    // application last knew it to hold.
    await wrapper.setProps({ data: caroline });

    await waitForDom(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Drafted"));

    // The column then leaves the definitions, so only what the session observed can answer.
    await wrapper.setProps({ columns: narrow });
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as { previousValues: Record<string, unknown> };
    expect(change.previousValues).toEqual({ age: 30, name: "Caroline" });
  });

  it("shows a commit still in flight to an editor that remounted under it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(document.querySelectorAll("[data-pending]")).toHaveLength(2));

    // A real unmount and remount — the columns panel here, virtual scrolling in a real table.
    handle.value?.table.getColumn("name")?.toggleVisibility(false);
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));
    handle.value?.table.getColumn("name")?.toggleVisibility(true);
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    // The write is still out. An editor that knows nothing about it would take input and let the
    // user commit a second time.
    expect((editorInputs()[0] as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelectorAll("[data-pending]")).toHaveLength(2);

    await inFlight.resolve();
    await inFlight.promise;
    await tick();
  });

  it("keeps a row failure for the editors that were not there to receive it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });

    // Every editor of the row goes away while the write is out.
    handle.value?.table.getColumn("name")?.toggleVisibility(false);
    handle.value?.table.getColumn("age")?.toggleVisibility(false);
    await waitForDom(() => expect(editorInputs()).toHaveLength(0));

    inFlight.reject(new Error("Server said no"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    // The row is still being edited, so the reason it failed is still the row's to show.
    expect(document.querySelector("[data-editing-row]")).toBeTruthy();

    handle.value?.table.getColumn("name")?.toggleVisibility(true);
    handle.value?.table.getColumn("age")?.toggleVisibility(true);
    await tick();

    await waitForDom(() => expect(elementByText("Server said no")).toBeTruthy());
  });

  it("puts a row failure where it can be read, not on a hidden column", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.stopEditing({ commit: true });

    // The row's first editable column is hidden and the write settles straight after — no pause
    // in which a passive cleanup could tidy the registry first.
    handle.value?.table.getColumn("name")?.toggleVisibility(false);
    inFlight.reject(new Error("Server said no"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    expect(editorInputs()).toHaveLength(1);
    await waitForDom(() => expect(elementByText("Server said no")).toBeTruthy());
  });

  it("clears the failure the column carries, not the row's other ones", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const validated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            render: textEditor(),
            validate: value => String(value ?? "").length > 0 ? null : "Name is required"
          }
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    const wrapper = mountTable({
      columns: validated,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: vi.fn()
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    await typeInto(editorInputs()[0] as HTMLInputElement, "");
    handle.value?.stopEditing({ commit: true });
    await waitForDom(() => expect(elementByText("Name is required")).toBeTruthy());

    // Typing somewhere else is not an answer to what `name` is complaining about — and the next
    // render of any kind must not be where it quietly disappears.
    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    await wrapper.setProps({ striped: true });
    await tick();

    expect(elementByText("Name is required")).toBeTruthy();

    // Typing into the field that carries it is.
    await typeInto(editorInputs()[0] as HTMLInputElement, "Fixed");

    expect(elementByText("Name is required")).toBeNull();
  });

  it("does not un-cancel a row when the gate reopens before its write lands", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit: () => inFlight.promise
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    handle.value?.startEditing("2");
    await tick();
    onEditingRowIdChange.mockClear();

    // The gate shuts while the write is out, and reopens before it lands.
    await wrapper.setProps({ enableEditing: false });
    await wrapper.setProps({ enableEditing: true });

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    // Losing eligibility ended that session; reopening is the next one's eligibility.
    expect(onEditingRowIdChange).not.toHaveBeenCalledWith("2");
  });

  it("is read-only when row mode has no commit handler", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle
    });
    await tick();

    handle.value?.startEditing("1");
    await tick();

    // Row mode commits through `onRowEditCommit`; without it the row has nothing to open for.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();
  });

  it("does not revive a row whose gate shut before its data arrived", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    const wrapper = mountTable({
      columns,
      data: [],
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });
    await tick();
    expect(editorInputs()).toHaveLength(0);

    // The table switch shuts and reopens while the row is still not there. The switch is not a
    // question about the row, so it has to be answered without one.
    await wrapper.setProps({ enableEditing: false });
    await wrapper.setProps({ enableEditing: true });
    await wrapper.setProps({ data: people });
    await tick();

    // The session that was open when the switch shut is over. Nothing opens by itself.
    expect(editorInputs()).toHaveLength(0);
    expect(document.querySelector("[data-editing-row]")).toBeNull();

    // An explicit start is a new session, and it works.
    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
  });

  it("focuses the column an explicit start names on the row already open", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: vi.fn()
    });

    handle.value?.startEditing("1", "name");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    // The row is already open, so nothing moves — but the handle promises to focus the column it
    // is given, and the editor for it is right there.
    handle.value?.startEditing("1", "age");
    await tick();

    expect(document.activeElement).toBe(editorInputs()[1]);
  });

  it("tells a row custom editor that the row's write is still out", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    // Row mode's pending belongs to the row, not to one cell: the commit is atomic, so every
    // editor in it is waiting on the same write.
    const custom: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue, pending }: any) => h("input", {
            "aria-label": "Edit Name",
            disabled: pending,
            value: value === null || value === undefined ? "" : String(value),
            onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
          })
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    mountTable({
      columns: custom,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    const customInput = () => q("[aria-label=\"Edit Name\"]") as HTMLInputElement;
    expect(customInput().disabled).toBe(false);

    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    // The write is the row's, and it was another column that changed — this editor is waiting on
    // it all the same.
    await waitForDom(() => expect(customInput().disabled).toBe(true));

    inFlight.reject(new Error("nope"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    // A rejection returns the row to editing, so the editor is here and no longer waiting.
    await waitForDom(() => expect(customInput().disabled).toBe(false));
  });

  it("hands a row custom editor the commit's real result", async () => {
    const results: Array<boolean | Promise<boolean>> = [];
    const inFlight = Promise.withResolvers<void>();
    const custom: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: ({ value, setValue, commit }: any) => [
            h("input", {
              "aria-label": "Edit Name",
              value: value === null || value === undefined ? "" : String(value),
              onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
            }),

            h("button", {
              type: "button",
              onClick: () => {
                results.push(commit());
              }
            }, "commit")
          ]
        }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: {
          edit: {
            render: numberEditor(),
            validate: value => Number(value) > 0 ? null : "Age must be positive"
          }
        }
      }
    ];

    const handle = ref<DataTableHandle<Person> | null>(null);

    mountTable({
      columns: custom,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit: () => inFlight.promise
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    // Another column of the row fails its own `validate`, so the row does not commit.
    await typeInto(editorInputs()[1] as HTMLInputElement, "0");
    await buttonByName("commit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(results).toEqual([false]);

    // Now it validates, and the application's write rejects.
    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    await buttonByName("commit")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    const pending = results[1];
    expect(typeof pending).not.toBe("boolean");

    inFlight.reject(new Error("nope"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    await expect(pending).resolves.toBe(false);
  });

  it("does not record a row write the data moved out from under in flight", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValues: Record<string, unknown>; values: Record<string, unknown> }> = [];
    const named = (name: string): Person[] => [
      {
        age: 30,
        id: "1",
        name
      },
      people[1] as Person
    ];

    const wrapper = mountTable({
      columns,
      data: named("Carol"),
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: (change: {
        previousValues: Record<string, unknown>;
        values: Record<string, unknown>;
      }) => {
        committed.push({ previousValues: change.previousValues, values: change.values });

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "First");
    handle.value?.stopEditing({ commit: true });

    await wrapper.setProps({ data: named("Caroline") });
    await wrapper.setProps({ data: named("Carol") });

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    await waitForDom(() => expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol"));

    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    expect(committed[1]?.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("asks a controlled owner to close a lost row session exactly once", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    onEditingRowIdChange.mockClear();

    // The gate shuts and the owner ignores the close. Asking again on every update that happens
    // to follow is not reconciliation, it is nagging.
    await wrapper.setProps({ enableEditing: false });
    await waitForDom(() => expect(onEditingRowIdChange.mock.calls).toEqual([[null]]));

    await wrapper.setProps({ enableEditing: false });
    await wrapper.setProps({ enableEditing: true });
    await tick();
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);

    // An explicit stop is a new request, not the same one repeated.
    handle.value?.stopEditing({ commit: false });
    await tick();
    expect(onEditingRowIdChange.mock.calls).toEqual([[null], [null]]);
  });

  it("does not authorize a switch when the commit itself finds the gate shut", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onEditingRowIdChange = vi.fn();
    const onRowEditCommit = vi.fn();
    // `edit.enabled` is application code, and nothing makes it answer the same way twice — so a
    // commit can be the first thing to learn that the gate is shut, with no render in between.
    let gateOpen = true;
    const gated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: { enabled: () => gateOpen, render: textEditor() } }
      },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: { enabled: () => gateOpen, render: numberEditor() } }
      }
    ];

    mountTable({
      columns: gated,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    onEditingRowIdChange.mockClear();

    gateOpen = false;
    handle.value?.startEditing("2");
    await tick();

    // A session cancelled by its gate did not finish, so nothing opens on its behalf — and what
    // it held never passed a gate, so nothing of it is sent either.
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(onEditingRowIdChange.mock.calls).toEqual([[null]]);
  });

  it("does not authorize a switch away from a row the table-level switch closed", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    onEditingRowIdChange.mockClear();

    // Reconciliation cancels the session and asks once; the owner declines, so the slice goes on
    // naming this row.
    await wrapper.setProps({ enableEditing: false });
    await waitForDom(() => expect(onEditingRowIdChange.mock.calls).toEqual([[null]]));

    handle.value?.startEditing("2");
    await tick();

    // Editing is off. The commit that has to happen before the switch cannot happen at all, so
    // the switch does not — and the close it needs is asked for again, because a command is
    // always a fresh request.
    expect(onEditingRowIdChange.mock.calls).toEqual([[null], [null]]);
  });

  it("takes the row's editors off the screen in the same commit their gate shuts", async () => {
    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      onEditingRowIdChange: vi.fn(),
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    // Row mode asks the gate per cell in the render itself, so the editors go with the update
    // that shut it — never a cycle later, behind the reconciliation that ends the session. Vue
    // patches the component in one flush, so one nextTick after the prop lands is that frame.
    await wrapper.setProps({ enableEditing: false });

    expect(editorInputs()).toHaveLength(0);
  });

  it.todo("commits the row on screen, not one a discarded render replaced: React-only machinery — the suspended startTransition the case builds on has no Vue counterpart");

  it.todo("commits a row a discarded render removed: React-only machinery — the suspended startTransition the case builds on has no Vue counterpart");

  it("ends a row session whose commit handler went away while its row was absent", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onEditingRowIdChange = vi.fn();

    const wrapper = mountTable({
      columns,
      data: people,
      editingRowId: "1",
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onEditingRowIdChange,
      onRowEditCommit: vi.fn()
    });

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");
    onEditingRowIdChange.mockClear();

    // The row leaves and the handler goes with it. A row that is not there is a row that has not
    // arrived; a handler that is not there is the application closing the gate.
    await wrapper.setProps({ data: [], onRowEditCommit: undefined });
    await waitForDom(() => expect(onEditingRowIdChange.mock.calls).toEqual([[null]]));

    // Neither the handler coming back nor the row coming back resumes it.
    await wrapper.setProps({ onRowEditCommit: vi.fn() });
    await wrapper.setProps({ data: people });
    await tick();
    expect(editorInputs()).toHaveLength(0);

    handle.value?.startEditing("1");

    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Carol");
  });

  it("commits a draft whose column was hidden mid-edit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Renamed");

    // Hiding the column takes its editor away — exactly what the columns panel does. The pending
    // value lives in the controller and must still be what the row commits; otherwise `changed`
    // is false and the whole edit is discarded.
    handle.value?.table.getColumn("name")?.toggleVisibility(false);
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    expect((onRowEditCommit.mock.calls[0]![0] as { values: Record<string, unknown> }).values)
      .toEqual({ name: "Renamed", age: 30 });
  });

  it("commits a draft whose column left the definitions entirely", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    // What a responsive breakpoint does: the column is removed before TanStack sees it, so it
    // has no cell to read at commit time — unlike columnVisibility, which merely hides one.
    const narrow: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      }
    ];

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    await wrapper.setProps({ columns: narrow });
    await tick();
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(onRowEditCommit).toHaveBeenCalledTimes(1));
    const change = onRowEditCommit.mock.calls[0]?.[0] as {
      values: Record<string, unknown>;
      previousValues: Record<string, unknown>;
    };
    expect(change.values).toEqual({ age: 30, name: "Drafted" });
    // The previous value comes from the baseline captured when the edit began.
    expect(change.previousValues).toEqual({ age: 30, name: "Carol" });
  });

  it("drops a draft whose column stopped being editable mid-edit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    // The column stays in the definitions; only its edit gate closes — `meta.edit` removed here,
    // the same shape as `enableEditing` flipping off or `edit.enabled(row)` turning false.
    const readOnlyName: Array<ColumnDef<Person, any>> = [
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      },
      { accessorKey: "id", header: "Id" }
    ];

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    await wrapper.setProps({ columns: readOnlyName });
    await tick();
    await waitForDom(() => expect(editorInputs()).toHaveLength(1));

    handle.value?.stopEditing({ commit: true });
    await waitForDom(() => expect(editorInputs()).toHaveLength(0));

    // The draft must not slip through the gate the application just closed — and it would have
    // arrived unvalidated, since validation only walks currently editable cells. Age is
    // untouched, so there is nothing left to commit at all.
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(elementByText("Carol")).toBeTruthy();
  });

  it("drops every draft when the table-level switch closes mid-edit", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();
    // The hard case for the rule above: the edited column leaves the definitions *and*
    // `enableEditing` goes off in the same tick. There is no cell left to test the draft
    // against, so only the table-level switch can still refuse it.
    const withoutName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "age",
        header: "Age",
        meta: { edit: numberEditor() }
      },
      { accessorKey: "id", header: "Id" }
    ];

    const wrapper = mountTable({
      columns,
      data: people,
      editMode: "row",
      enableEditing: true,
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    await wrapper.setProps({ columns: withoutName, enableEditing: false });
    await waitForDom(() => expect(editorInputs()).toHaveLength(0));

    handle.value?.stopEditing({ commit: true });
    await tick();

    expect(onRowEditCommit).not.toHaveBeenCalled();
  });

  it("joins a second commit to the request already in flight", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    // Two Enters, a blur landing behind one, or an application calling stop twice: one write.
    handle.value?.stopEditing({ commit: true });
    handle.value?.stopEditing({ commit: true });

    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    await waitForDom(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("lets a cancelled row's commit settle without closing the row opened after it", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onRowEditCommit = vi.fn(() => inFlight.promise);

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Drafted");

    handle.value?.stopEditing({ commit: true });
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);

    // Carol's write is still in flight when the user abandons it and opens Alice instead.
    handle.value?.stopEditing({ commit: false });
    await tick();
    handle.value?.startEditing("2");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));
    await typeInto(editorInputs()[0] as HTMLInputElement, "Second");

    await inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The settled request belongs to a session that ended: it must not close Alice's editors,
    // and her draft must survive.
    expect(editorInputs()).toHaveLength(2);
    expect((editorInputs()[0] as HTMLInputElement).value).toBe("Second");
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
  });

  it("starts and stops row editing through the imperative handle", async () => {
    const handle = ref<DataTableHandle<Person> | null>(null);
    const onRowEditCommit = vi.fn();

    mountTable({
      columns,
      data: people,
      editMode: "row",
      getRowId: (person: Person) => person.id,
      handleRef: handle,
      onRowEditCommit
    });

    handle.value?.startEditing("1");
    await waitForDom(() => expect(editorInputs()).toHaveLength(2));

    await typeInto(editorInputs()[1] as HTMLInputElement, "31");
    handle.value?.stopEditing({ commit: true });

    await waitForDom(() => expect(editorInputs()).toHaveLength(0));
    expect(onRowEditCommit).toHaveBeenCalledTimes(1);
    expect((onRowEditCommit.mock.calls[0]![0] as { values: Record<string, unknown> }).values).toEqual({
      name: "Carol",
      age: 31
    });
  });
});
