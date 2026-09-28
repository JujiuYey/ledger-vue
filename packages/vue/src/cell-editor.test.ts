import { defineComponent, h, nextTick, ref } from "vue";

import type { VueWrapper } from "@vue/test-utils";
import type { ColumnDef, DataTableEditRenderer, DataTableHandle } from "./types";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import DataTable from "./data-table.vue";
import { checkboxEditor, textEditor } from "./editors";
import { useDataTable } from "./use-data-table";

interface Person {
  id: string;
  name: string;
  active: boolean;
}

const people: Person[] = [
  {
    id: "1",
    name: "Carol",
    active: true
  },
  {
    id: "2",
    name: "Alice",
    active: false
  }
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

/** Mounts a harness component that owns the DataTable (hook mode, host state) — see below. */
function mountHost(component: ReturnType<typeof defineComponent>): VueWrapper {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return mount(component, { attachTo: host });
}

enableAutoUnmount(afterEach);

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

const textbox = (): HTMLInputElement | null =>
  q(".ledger-cell-editor input, .ledger-cell-editor textarea, .ledger-cell-editor select") as HTMLInputElement | null;

const textboxes = (): HTMLInputElement[] =>
  all(".ledger-cell-editor input") as HTMLInputElement[];

function elementByText(text: string, root: ParentNode = document): HTMLElement | null {
  return all("*", root).find(element => element.children.length === 0 && element.textContent === text) ?? null;
}

const cellWithText = (text: string): HTMLElement | null =>
  all(".ledger-tbody .ledger-cell").find(cell => cell.textContent === text) ?? null;

function buttonByName(name: string, root: ParentNode = document): HTMLElement | null {
  return all("button", root).find(button =>
    button.getAttribute("aria-label") === name || button.textContent?.trim() === name) ?? null;
}

/* ---- events / flushing ---- */

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

/** One macrotask turn — lets the session's deferred departure tick (setTimeout 0) land. */
const macrotask = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

/** The findBy/waitFor family: polls the DOM on real timers until the condition holds. */
async function eventually(condition: () => boolean, message = "condition not met in time"): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) {
      await tick();

      return;
    }

    await new Promise(resolve => {
      setTimeout(resolve, 5);
    });
  }

  throw new Error(message);
}

/** React's fireEvent.change on a ledger editor: the shipped controls listen to `input`. */
function setText(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function dblClickCell(text: string): Promise<void> {
  cellWithText(text)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await tick();
}

/* ---- shared column sets ---- */

function nameColumn(validate?: (value: unknown) => string | null): Array<ColumnDef<Person, any>> {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: {
        edit: validate
          ? { render: textEditor(), validate: value => validate(value) }
          : textEditor()
      }
    }
  ];
}

function gatedNameColumn(enabled: boolean): Array<ColumnDef<Person, any>> {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { edit: { render: textEditor(), enabled: () => enabled } }
    }
  ];
}

/**
 * A controlled cell whose owner ignores the close, over one row whose name the test moves.
 */
function namedPerson(name: string): Person[] {
  return [
    {
      active: true,
      id: "1",
      name
    },
    people[1] as Person
  ];
}

/**
 * A custom editor over the public editing context — the proof the contexts suffice. Vue
 * renderers return VNode content; `onInput` is the native change channel here.
 */
const customEditorRender: DataTableEditRenderer<Person, any> = ({ value, setValue, error }) => [
  h("input", {
    "aria-label": "Edit Name",
    value: value === null || value === undefined ? "" : String(value),
    onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
  }),
  error === null ? null : h("span", error)
];

const customNameColumn: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: customEditorRender }
  }
];

const editableColumns: Array<ColumnDef<Person, any>> = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { edit: textEditor() }
  },
  {
    accessorKey: "id",
    header: "Id",
    meta: { edit: textEditor() }
  }
];

/**
 * One column, read through whatever accessor the caller hands in.
 */
function accessorColumn(accessor: (person: Person) => string): Array<ColumnDef<Person, any>> {
  return [
    {
      id: "name",
      accessorFn: accessor,
      header: "Name",
      meta: { edit: textEditor() }
    }
  ];
}

/* ---- harness components (the React suite's function components with state) ---- */

/**
 * Hook mode with a swap: two `useDataTable` instances over the same options, one rendered at a
 * time — the table is replaced under an editor the host keeps.
 */
const SwappableTable = defineComponent({
  setup() {
    const second = ref(false);
    const options = {
      columns: customNameColumn,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    };
    const first = useDataTable<Person>(options as never);
    const other = useDataTable<Person>(options as never);

    return () => [
      h("button", { type: "button", onClick: () => { second.value = true; } }, "swap"),
      h(DataTable as never, { table: second.value ? other : first })
    ];
  }
});

describe("inline editing", () => {
  it("enters on double-click, commits on Enter with value and previousValue", async () => {
    const onEditCommit = vi.fn();
    mountTable({
      columns: nameColumn(),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");

    const input = textbox()!;

    setText(input, "Caroline");
    press(input, "Enter");
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({
      value: "Caroline",
      previousValue: "Carol"
    });
    expect(textbox()).toBeNull();
  });

  it("cancels on Escape without committing", async () => {
    const onEditCommit = vi.fn();
    mountTable({
      columns: nameColumn(),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");

    const input = textbox()!;

    setText(input, "Nope");
    press(input, "Escape");
    await tick();

    expect(onEditCommit).not.toHaveBeenCalled();
    expect(textbox()).toBeNull();
  });

  it("closes the open editor when the table switch shuts under it, without committing", async () => {
    const onEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      enableEditing: true,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    setText(textbox()!, "Drafted");

    await wrapper.setProps({ enableEditing: false });
    await tick();

    // The gate the application just shut is the whole point: the editor leaves and the draft
    // goes with it, rather than being pushed through on the next Enter or blur.
    expect(textbox()).toBeNull();
    expect(onEditCommit).not.toHaveBeenCalled();
    expect(cellWithText("Carol")).toBeTruthy();
  });

  it("drops the draft when the row's own edit gate turns false mid-edit", async () => {
    const onEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: gatedNameColumn(true),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    setText(textbox()!, "Drafted");

    await wrapper.setProps({ columns: gatedNameColumn(false) });
    await tick();

    expect(textbox()).toBeNull();
    expect(onEditCommit).not.toHaveBeenCalled();
  });

  it("cancels an ineligible editor once the request that refused the cancel rejects", async () => {
    const inFlight = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => inFlight.promise);
    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      enableEditing: true,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    setText(textbox()!, "Drafted");
    press(textbox()!, "Enter");
    await tick();
    expect(onEditCommit).toHaveBeenCalledTimes(1);

    // The gate closes while the write is in flight. The editor goes at once — nothing under a
    // closed gate may be typed into — while the write itself is left to finish, because that
    // value passed the gate before it shut.
    await wrapper.setProps({ enableEditing: false });
    await tick();
    expect(textbox()).toBeNull();

    inFlight.reject(new Error("nope"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    // A rejection normally returns the cell to editing. Under a closed switch there is nothing
    // to return to: eligibility is re-asked and the editor leaves instead.
    expect(textbox()).toBeNull();
    expect(elementByText("nope")).toBeNull();
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("commits again after the application declines to close the controlled cell", async () => {
    const onEditCommit = vi.fn();
    // A controlled slice whose owner ignores the change keeps this editor on screen, and an
    // editor on screen is a live one: the next value typed into it is a second edit.
    const onEditingCellChange = vi.fn();

    mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit,
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditingCellChange).toHaveBeenCalledWith(null);

    setText(textbox()!, "Second");
    press(textbox()!, "Enter");
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(2);
    expect(onEditCommit.mock.calls[1]?.[0]).toMatchObject({
      previousValue: "First",
      value: "Second"
    });
  });

  it("tells a custom editor that its write is still out", async () => {
    const inFlight = Promise.withResolvers<void>();
    // The host never disables a custom editor — it cannot know what to disable — so the flag has
    // to reach the editor for it to decide anything at all.
    const pendingEditor: DataTableEditRenderer<Person, any> = ({ value, setValue, pending }) => [
      h("input", {
        "aria-label": "Edit Name",
        disabled: pending,
        value: value === null || value === undefined ? "" : String(value),
        onInput: (event: Event) => setValue((event.target as HTMLInputElement).value)
      })
    ];
    const pendingName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: pendingEditor }
      }
    ];

    mountTable({
      columns: pendingName,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: () => inFlight.promise,
      onEditingCellChange: vi.fn()
    });
    await tick();

    expect(textbox()!.disabled).toBe(false);

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(textbox()!.disabled).toBe(true);

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The owner declined to close the cell, so the editor is still here — and no longer waiting.
    expect(textbox()!.disabled).toBe(false);
  });

  it("still commits a value typed while an async cell commit was in flight", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    // A custom editor is never disabled by the pending state, so typing while the write is out
    // is ordinary rather than exotic.
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: customEditorRender }
      }
    ];

    mountTable({
      columns: customName,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: ({ value }: { value: unknown }) => {
        committed.push(value);

        return committed.length === 1 ? inFlight.promise : undefined;
      },
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual(["First"]);

    setText(textbox()!, "Second");

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual(["First", "Second"]);
  });

  it("keeps an uncontrolled cell open when its commit settles behind a newer draft", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: customEditorRender }
      }
    ];

    // No `editingCell` prop: the ordinary uncontrolled slice, which closes the cell itself.
    mountTable({
      columns: customName,
      data: people,
      getRowId,
      onEditCommit: ({ value }: { value: unknown }) => {
        committed.push(value);

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual(["First"]);

    setText(textbox()!, "Second");

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The write that settled never carried "Second", so closing now would drop it.
    expect(textbox()!.value).toBe("Second");
    expect(q("[data-pending]")).toBeNull();

    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual(["First", "Second"]);
  });

  it("commits the value that outran an async request when the cell is unmounted", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: unknown[] = [];
    const customName: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: customEditorRender }
      }
    ];

    const wrapper = mountTable({
      columns: customName,
      data: people,
      getRowId,
      onEditCommit: ({ value }: { value: unknown }) => {
        committed.push(value);

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    setText(textbox()!, "Second");

    // Scrolled out of the virtual window while the first write was still out. Nobody can commit
    // "Second" by hand anymore, and unmount commits rather than discards.
    wrapper.unmount();

    inFlight.resolve();
    await inFlight.promise;
    await macrotask();
    await tick();

    expect(committed).toEqual(["First", "Second"]);
  });

  it.todo("keeps the cell on screen when a transition to another one never commits: no Vue counterpart — React suspends a startTransition render to prove the committed table wins; Vue's reactivity has no discarded renders (use-committed-table.ts)");

  it("does not authorize a move when the gate shuts under a pending commit", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onEditingCellChange = vi.fn();

    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      enableEditing: true,
      getRowId,
      handleRef,
      onEditCommit: () => inFlight.promise,
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "Drafted");

    // Asking for Alice's cell commits this one first and waits on that write.
    handleRef.value?.startEditing("2", "name");
    await tick();
    onEditingCellChange.mockClear();

    await wrapper.setProps({ enableEditing: false });
    await tick();

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The gate shut, so this session is over — but nothing may be opened on the strength of a
    // write whose editor was cancelled, and the ending is requested once.
    expect(onEditingCellChange).not.toHaveBeenCalledWith({ columnId: "name", rowId: "2" });
    expect(onEditingCellChange.mock.calls.filter(call => call[0] === null)).toHaveLength(1);
  });

  it("can still be closed after a commit the controlled owner declined to act on", async () => {
    const onEditCommit = vi.fn();
    const onEditingCellChange = vi.fn();

    mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit,
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(onEditCommit).toHaveBeenCalledTimes(1);

    onEditingCellChange.mockClear();

    // The owner ignored the first request, so the editor is still here. Escape is a new request
    // to close it, not a repeat of one already answered.
    press(textbox()!, "Escape");
    await tick();
    expect(onEditingCellChange).toHaveBeenCalledWith(null);

    onEditingCellChange.mockClear();

    // And so is Enter — which has nothing new to send, so it sends nothing.
    press(textbox()!, "Enter");
    await tick();
    expect(onEditingCellChange).toHaveBeenCalledWith(null);
    expect(onEditCommit).toHaveBeenCalledTimes(1);
  });

  it("follows the data past the value it acknowledged, when the owner keeps it open", async () => {
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];

    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: (change: { previousValue: unknown; value: unknown }) => {
        committed.push({ previousValue: change.previousValue, value: change.value });
      },
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual([{ previousValue: "Carol", value: "First" }]);

    // The owner ignored the close and fed back a normalized value. That is what the cell holds
    // now, and what the editor still on screen has to show.
    await wrapper.setProps({ data: namedPerson("FIRST") });
    await tick();
    await tick();

    expect(textbox()!.value).toBe("FIRST");

    setText(textbox()!, "Second");
    press(textbox()!, "Enter");
    await tick();

    expect(committed[1]).toEqual({ previousValue: "FIRST", value: "Second" });
  });

  it("does not bring a written value back when the data returns to what it departed from", async () => {
    const wrapper = mountTable({
      columns: nameColumn(),
      data: namedPerson("Carol"),
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();

    // The write lands in the data...
    await wrapper.setProps({ data: namedPerson("First") });
    await tick();
    await tick();
    expect(textbox()!.value).toBe("First");

    // ...and is then reverted by somebody else. That is the data's own value now, not ours
    // resurfacing because it happens to match what the write departed from.
    await wrapper.setProps({ data: namedPerson("Carol") });
    await tick();
    await tick();

    expect(textbox()!.value).toBe("Carol");
  });

  it("hands a remounted editor the session it belongs to", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];

    mountTable({
      columns: customNameColumn,
      data: people,
      getRowId,
      handleRef,
      onEditCommit: (change: { previousValue: unknown; value: unknown }) => {
        committed.push({ previousValue: change.previousValue, value: change.value });

        return committed.length === 1 ? inFlight.promise : undefined;
      }
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(committed).toEqual([{ previousValue: "Carol", value: "First" }]);
    expect(q("[data-pending]")).toBeTruthy();

    // The row scrolls out and back while the write is still out — a real unmount and a new editor
    // for the same cell.
    handleRef.value?.table.getColumn("name")?.toggleVisibility(false);
    await tick();
    expect(textbox()).toBeNull();
    handleRef.value?.table.getColumn("name")?.toggleVisibility(true);
    await eventually(() => textbox() !== null, "remounted editor never appeared");

    // What the editor shows and what it may do both belong to the session, not to the instance
    // that started it: the value it sent is still what the cell holds, and the write is still out.
    expect(textbox()!.value).toBe("First");
    expect(q("[data-pending]")).toBeTruthy();

    setText(textbox()!, "Second");

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // The settle never carried "Second", so it cannot close the editor holding it.
    expect(textbox()!.value).toBe("Second");

    press(textbox()!, "Enter");
    await tick();

    // And the second write departs from what the first one wrote, not from the data behind it.
    expect(committed).toEqual([
      { previousValue: "Carol", value: "First" },
      { previousValue: "First", value: "Second" }
    ]);
  });

  it("shows a rejection to the editor that came back for it", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    mountTable({
      columns: customNameColumn,
      data: people,
      getRowId,
      handleRef,
      onEditCommit: () => inFlight.promise
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();

    handleRef.value?.table.getColumn("name")?.toggleVisibility(false);
    await tick();
    handleRef.value?.table.getColumn("name")?.toggleVisibility(true);
    await eventually(() => textbox() !== null, "remounted editor never appeared");

    inFlight.reject(new Error("Server said no"));
    await inFlight.promise.catch(() => undefined);
    await tick();

    // The failure belongs to the session, so the instance that replaced the sender shows it — and
    // the value that failed is still there to fix.
    await eventually(() => elementByText("Server said no") !== null, "rejection never surfaced");
    expect(textbox()!.value).toBe("First");
  });

  it("does not un-cancel a session when the gate reopens before its write lands", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();

    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      enableEditing: true,
      getRowId,
      handleRef,
      onEditCommit: () => inFlight.promise
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");

    // Asking for Alice's cell commits this one first and waits on the write.
    handleRef.value?.startEditing("2", "name");
    await tick();

    // The gate shuts while the write is out, and reopens before it lands.
    await wrapper.setProps({ enableEditing: false });
    await tick();
    await wrapper.setProps({ enableEditing: true });
    await tick();

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // Losing eligibility ended that session. A gate reopening is the next session's eligibility,
    // not a reprieve for the one that was cancelled — so nothing opens on its behalf.
    expect(textbox()).toBeNull();
  });

  it("does not let a departing cell's tick commit the one that replaced it", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditCommit = vi.fn();

    mountTable({
      columns: editableColumns,
      data: people,
      getRowId,
      handleRef,
      onEditCommit
    });

    await dblClickCell("Carol");
    setText(textbox()!, "First");

    // Moving to Alice's cell commits Carol's and opens Alice's in the same flush, so Carol's
    // editor departs with the slice already pointing elsewhere.
    handleRef.value?.startEditing("2", "name");
    await tick();
    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(textbox()).toBeTruthy();

    // A second switch in the same breath: now two departures are outstanding at once.
    setText(textbox()!, "Second");
    handleRef.value?.startEditing("1", "id");
    await tick();
    expect(onEditCommit).toHaveBeenCalledTimes(2);

    // Both departure ticks land afterwards (real timers stand in for React's fake clock — the
    // ticks land between the awaits either way). Each belongs to a session that is over.
    await macrotask();
    await tick();

    expect(textboxes()).toHaveLength(1);
    expect(onEditCommit).toHaveBeenCalledTimes(2);
  });

  it("is read-only when the mode has no commit handler", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const checkboxColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor() }
      },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: { instant: checkboxEditor() } }
      }
    ];

    mountTable({
      columns: checkboxColumns,
      data: people,
      getRowId,
      handleRef
    });

    // The commit belongs to the application. With no `onEditCommit` there is nowhere for an edit
    // to go, so the cells are read-only rather than editable-and-then-silently-lost.
    await dblClickCell("Carol");
    expect(textbox()).toBeNull();

    handleRef.value?.startEditing("1", "name");
    await tick();
    expect(textbox()).toBeNull();

    // The checkbox variant is a live control, and it went the same way.
    expect(q(".ledger-cell input[type=\"checkbox\"]")).toBeNull();
  });

  it("keeps a cell whose gate shut from rendering an editor again", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);

    const wrapper = mountTable({
      columns: customNameColumn,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      enableEditing: true,
      getRowId,
      handleRef,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "Drafted");

    // The gate shuts. A custom editor is never disabled by anything the host does, so the only
    // way it stops being interactive is by not being there.
    await wrapper.setProps({ enableEditing: false });
    await tick();
    expect(textbox()).toBeNull();

    // The owner declined to clear the slice, so it still names this cell. The gate reopening is
    // the next session's eligibility, not a reprieve for the one that was cancelled.
    await wrapper.setProps({ enableEditing: true });
    await tick();
    expect(textbox()).toBeNull();

    // An explicit start on the same target is that next session — and nothing the old one held
    // comes back with it.
    handleRef.value?.startEditing("1", "name");
    await eventually(() => textbox() !== null, "restarted editor never appeared");

    expect(textbox()!.value).toBe("Carol");
  });

  it("does not carry a cancelled session's pending commit into the one restarting it", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const inFlight = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => inFlight.promise);

    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      enableEditing: true,
      getRowId,
      handleRef,
      onEditCommit,
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();
    expect(textbox()!.disabled).toBe(true);

    // The gate shuts while that write is still out, and reopens. The session is cancelled either
    // way, and the owner declined to close it, so the slice still names this cell.
    await wrapper.setProps({ enableEditing: false });
    await tick();
    await wrapper.setProps({ enableEditing: true });
    await tick();
    expect(textbox()).toBeNull();

    // The next session opens on the same cell. Nothing the cancelled one held may come with it —
    // least of all a write whose settlement will find a token that no longer matches, and so will
    // never clear the flag it set.
    handleRef.value?.startEditing("1", "name");
    await eventually(() => textbox() !== null, "restarted editor never appeared");

    const input = textbox()!;

    expect(input.disabled).toBe(false);
    expect(input.value).toBe("Carol");
    expect(q("[data-pending]")).toBeNull();

    // And what a live session can do, this one can do: type, and cancel.
    setText(input, "Second");
    expect(textbox()!.value).toBe("Second");

    press(textbox()!, "Escape");
    await tick();
    expect(textbox()!.value).toBe("Carol");
  });

  it("takes an editor off the screen in the same commit its gate shuts", async () => {
    // React proved this in the layout phase (useLayoutEffect probing the frame as it will be
    // painted). Vue flushes render, DOM patch and post-flush watchers in one pre-paint cycle,
    // so the counterpart is the DOM right after the flush that carried the gate change.
    const wrapper = mountTable({
      columns: customNameColumn,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      enableEditing: true,
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    });
    await tick();
    expect(q(".ledger-cell-editor input")).toBeTruthy();

    // The gate shuts. Ending the *session* is a side effect and belongs to reconciliation, which
    // runs after the flush — but whether an editor is on the screen is a question this render
    // can answer for itself, and this render already knows the gate is shut. A frame with a live
    // editor behind a closed gate is one the user can type into.
    await wrapper.setProps({ enableEditing: false });
    await nextTick();

    expect(q(".ledger-cell-editor input")).toBeNull();
  });

  it("keeps a controlled session waiting for a row that has not arrived", async () => {
    const wrapper = mountTable({
      columns: customNameColumn,
      data: [] as Person[],
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    });
    await tick();
    expect(textbox()).toBeNull();

    // A row the data does not hold yet is a target that has not arrived — not an application
    // closing the editing gate. The session waits for it.
    await wrapper.setProps({ data: people });
    await eventually(() => textbox() !== null, "editor for the arrived row never appeared");

    expect(textbox()!.value).toBe("Carol");
  });

  it("does not record a write the data moved out from under while it was in flight", async () => {
    const inFlight = Promise.withResolvers<void>();
    const committed: Array<{ previousValue: unknown; value: unknown }> = [];

    const wrapper = mountTable({
      columns: customNameColumn,
      data: namedPerson("Carol"),
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: (change: { previousValue: unknown; value: unknown }) => {
        committed.push({ previousValue: change.previousValue, value: change.value });

        return committed.length === 1 ? inFlight.promise : undefined;
      },
      onEditingCellChange: vi.fn()
    });
    await tick();

    setText(textbox()!, "First");
    press(textbox()!, "Enter");
    await tick();

    // While the write is out, somebody else moves the row — and then moves it back. The data did
    // move, even though where it landed is where the write departed from.
    await wrapper.setProps({ data: namedPerson("Caroline") });
    await tick();
    await wrapper.setProps({ data: namedPerson("Carol") });
    await tick();

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    // So there is nothing for the write to still be true about: the data is what the cell holds.
    expect(textbox()!.value).toBe("Carol");

    setText(textbox()!, "Second");
    press(textbox()!, "Enter");
    await tick();

    expect(committed[1]).toEqual({ previousValue: "Carol", value: "Second" });
  });

  it("re-registers its editors when the table it belongs to is replaced", async () => {
    mountHost(SwappableTable);
    await tick();

    setText(textbox()!, "Drafted");
    expect(textbox()!.value).toBe("Drafted");

    // The table is replaced under an editor Vue keeps: same cell, same element, same instance.
    // Its registration belonged to the controller that is gone.
    buttonByName("swap")?.click();
    await tick();

    // Typing reaches the new controller's store, and the new controller has to be able to tell
    // this editor to draw what it now holds.
    setText(textbox()!, "Second");
    await tick();

    expect(textbox()!.value).toBe("Second");
  });

  it("does not authorize a move when the commit itself finds the gate shut", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditingCellChange = vi.fn();
    // `edit.enabled` is application code, and nothing makes it answer the same way twice — so a
    // commit can be the first thing to learn that the gate is shut, with no render in between.
    let gateOpen = true;
    const gated: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            enabled: () => gateOpen,
            render: textEditor()
          }
        }
      }
    ];

    mountTable({
      columns: gated,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      handleRef,
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "Drafted");
    onEditingCellChange.mockClear();

    gateOpen = false;
    handleRef.value?.startEditing("2", "name");
    await tick();

    // A session cancelled by its gate did not finish, so nothing opens on its behalf — and the
    // one close it needed was asked for once.
    expect(onEditingCellChange).not.toHaveBeenCalledWith({ columnId: "name", rowId: "2" });
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);
  });

  it("asks again to close a cancelled session when an explicit stop commits it", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditingCellChange = vi.fn();

    const wrapper = mountTable({
      columns: customNameColumn,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      enableEditing: true,
      getRowId,
      handleRef,
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "Drafted");
    onEditingCellChange.mockClear();

    // The gate shuts. Reconciliation cancels the session and asks once; the owner declines, so
    // the slice goes on naming this cell — and reconciliation will not ask again.
    await wrapper.setProps({ enableEditing: false });
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // A committed render with the gate still shut — the React rerender over the same false
    // switch — does not remake the ask.
    await wrapper.setProps({ data: [...people] });
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // An explicit stop is a command, and a command is always a new request — whichever way it is
    // spelled. `commit: true` has nothing left to send, but it still wants the cell closed.
    handleRef.value?.stopEditing({ commit: true });
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null], [null]]);

    handleRef.value?.stopEditing({ commit: false });
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null], [null], [null]]);
  });

  it("closes a session whose target never arrived when asked to", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditingCellChange = vi.fn();

    mountTable({
      columns: customNameColumn,
      data: [] as Person[],
      editingCell: { columnId: "name", rowId: "late" },
      getRowId,
      handleRef,
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    // Nothing to commit — but an explicit stop is still a request to leave, and a session waiting
    // for a row that never came has to be closable.
    handleRef.value?.stopEditing();
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // The owner ignored it, so asking again is a new request, not the same one repeated.
    onEditingCellChange.mockClear();
    handleRef.value?.stopEditing();
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);
  });

  it("commits through the handler as it is now, not as the row last saw it", async () => {
    const seen: number[] = [];
    const handlerFor = (count: number) => () => {
      seen.push(count);
    };

    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: handlerFor(0),
      onEditingCellChange: vi.fn()
    });
    await tick();

    // A handler swapped at runtime is a new identity with no data or definition change beside it
    // — nothing in the row re-renders for it, so nothing in the row may be holding the handler
    // it saw. The write goes through the session, whose read always reaches the handler as it
    // is now.
    await wrapper.setProps({ onEditCommit: handlerFor(1) });
    await wrapper.setProps({ onEditCommit: handlerFor(2) });

    setText(textbox()!, "Drafted");
    press(textbox()!, "Enter");
    await tick();

    expect(seen).toEqual([2]);
  });

  it.todo("does not let a render nobody saw shut the gate on the editor on screen: no Vue counterpart — the React test throws away a Suspense-blocked transition; Vue has no discarded renders");

  it.todo("commits against the row on screen, not one a discarded render replaced: no Vue counterpart — the React test throws away a Suspense-blocked transition; Vue has no discarded renders");

  it.todo("commits a draft whose row a discarded render removed: no Vue counterpart — the React test throws away a Suspense-blocked transition; Vue has no discarded renders");

  it.todo("does not let a render nobody saw strip the column's edit meta: no Vue counterpart — the React test throws away a Suspense-blocked transition; Vue has no discarded renders");

  it("reads a value through the accessor the committed render resolved", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditCommit = vi.fn();
    const validated: unknown[] = [];
    // Same column id, an accessor with the session's validate riding the config. (The React
    // test swapped the accessor inside a Suspense-discarded transition to pin that a commit
    // resolves the value from the committed column, never the shared core — Vue has no
    // discarded renders, so that interleave has no counterpart; the beat kept is the hidden
    // column committing its draft through the session store with `validate` riding the config.)
    const named = (accessor: (person: Person) => string): Array<ColumnDef<Person, any>> => [
      {
        id: "name",
        accessorFn: accessor,
        header: "Name",
        cell: () => "fixed",
        meta: {
          edit: {
            validate: (value: unknown) => {
              validated.push(value);

              return null;
            },
            render: textEditor()
          }
        }
      },
      { accessorKey: "id", header: "Id" }
    ];

    mountTable({
      columns: named(person => person.name),
      columnVisibility: { name: false },
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      handleRef,
      onColumnVisibilityChange: vi.fn(),
      onEditCommit,
      onEditingCellChange: vi.fn()
    });
    await tick();

    // The column is hidden, so no editor mounts. The draft goes straight to the session, which is
    // what an editor would have done.
    handleRef.value?.table.options.meta?.ledger?.editing?.drafts.write("1", "name", "Drafted");

    handleRef.value?.stopEditing({ commit: true });
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ previousValue: "Carol", value: "Drafted" });
    expect(validated).toEqual(["Drafted"]);
  });

  it("ends a session whose commit handler went away while its row was absent", async () => {
    const handleRef = ref<DataTableHandle<Person> | null>(null);
    const onEditingCellChange = vi.fn();

    const wrapper = mountTable({
      columns: customNameColumn,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      handleRef,
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "Drafted");
    onEditingCellChange.mockClear();

    // The row leaves and the handler goes with it. A row that is not there is a row that has not
    // arrived — but a handler that is not there is the application closing the gate, and the two
    // must not be confused just because they happened together.
    await wrapper.setProps({ data: [] as Person[], onEditCommit: undefined });
    await tick();
    expect(onEditingCellChange.mock.calls).toEqual([[null]]);

    // The handler comes back while the row is still away, then the row comes back. Neither is a
    // session resuming: the gate shut, and the loss latches.
    await wrapper.setProps({ data: [] as Person[], onEditCommit: vi.fn() });
    await tick();
    await wrapper.setProps({ data: people, onEditCommit: vi.fn() });
    await tick();
    expect(textbox()).toBeNull();

    // Only an explicit start opens the next one, with nothing the old one held.
    handleRef.value?.startEditing("1", "name");
    await eventually(() => textbox() !== null, "restarted editor never appeared");

    expect(textbox()!.value).toBe("Carol");
  });

  it("tabs to the neighbour on screen, not one a discarded render rearranged", async () => {
    const onEditingCellChange = vi.fn();

    mountTable({
      columns: editableColumns,
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    // (The React test dropped the neighbouring column inside a Suspense-discarded transition to
    // prove Tab steps through the committed render's column list — Vue has no discarded renders;
    // the assertion kept is the move itself.)
    press(textbox()!, "Tab");
    await eventually(
      () => (onEditingCellChange.mock.calls.at(-1)?.[0] as { columnId?: string } | undefined)?.columnId === "id",
      "Tab never moved to the neighbouring editable cell"
    );

    // Tab moves to the row's next editable cell — the row as the screen has it. Stopping instead
    // would strand the user at the edge of a table that has another column right there.
    expect(onEditingCellChange).toHaveBeenLastCalledWith({ columnId: "id", rowId: "1" });
  });

  it("shows what the accessor of the render drawing it resolves", async () => {
    const wrapper = mountTable({
      columns: accessorColumn(person => person.name),
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onEditCommit: vi.fn(),
      onEditingCellChange: vi.fn()
    });
    await tick();
    expect(textbox()!.value).toBe("Carol");

    // A real committed render changes what the column reads, with `data` identical. Upstream
    // caches a row's values against the row object, and that object outlives a definition change
    // — so the editor has to resolve the value itself rather than ask the row for it.
    await wrapper.setProps({ columns: accessorColumn(person => person.name.toUpperCase()) });
    await tick();
    await tick();
    expect(textbox()!.value).toBe("CAROL");

    // And a cancelled editor redraws under a declining owner: the draft is discarded and what it
    // draws is still the render's own answer. (The React test reached this beat through a
    // Suspense-discarded render, which Vue has no counterpart for.)
    setText(textbox()!, "Drafted");
    press(textbox()!, "Escape");
    await tick();

    expect(textbox()!.value).toBe("CAROL");
  });

  it("tabs in pinned display order, not definition order", async () => {
    const onEditingCellChange = vi.fn();
    const pinned: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor() }
      },
      {
        accessorKey: "id",
        header: "Id",
        meta: { edit: textEditor() }
      },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: textEditor() }
      }
    ];

    mountTable({
      columnPinning: { start: ["active"], end: [] },
      columns: pinned,
      data: people,
      editingCell: { columnId: "active", rowId: "1" },
      getRowId,
      onColumnPinningChange: vi.fn(),
      onEditCommit: vi.fn(),
      onEditingCellChange
    });
    await tick();

    // `active` is pinned to the start, so on screen it comes first and `name` is its neighbour —
    // even though the definitions put it last. Stepping by definition order would move backwards.
    press(textbox()!, "Tab");
    await eventually(
      () => (onEditingCellChange.mock.calls.at(-1)?.[0] as { columnId?: string } | undefined)?.columnId === "name",
      "Tab never moved in pinned display order"
    );

    expect(onEditingCellChange).toHaveBeenLastCalledWith({ columnId: "name", rowId: "1" });
  });

  it("resolves where Tab lands after the commit, not before it is sent", async () => {
    const inFlight = Promise.withResolvers<void>();
    const onEditingCellChange = vi.fn();

    const wrapper = mountTable({
      columns: editableColumns,
      columnVisibility: { id: true },
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      onColumnVisibilityChange: vi.fn(),
      onEditCommit: () => inFlight.promise,
      onEditingCellChange
    });
    await tick();

    setText(textbox()!, "Drafted");
    press(textbox()!, "Tab");
    await tick();
    onEditingCellChange.mockClear();

    // The write is still out, and a real render takes the column the caret was headed for off the
    // screen. Where Tab lands is decided when the commit lands, not when the key was pressed.
    await wrapper.setProps({ columnVisibility: { id: false } });
    await tick();

    inFlight.resolve();
    await inFlight.promise;
    await tick();

    expect(onEditingCellChange).not.toHaveBeenCalledWith({ columnId: "id", rowId: "1" });
  });

  it("a validation message blocks the commit and stays in editing", async () => {
    const onEditCommit = vi.fn();
    mountTable({
      columns: nameColumn(value => String(value).length < 3 ? "too short" : null),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");

    const input = textbox()!;

    setText(input, "x");
    press(input, "Enter");
    await tick();

    expect(onEditCommit).not.toHaveBeenCalled();
    expect(elementByText("too short")).toBeTruthy();
    expect(textbox()).toBeTruthy();
  });

  it("an async commit shows pending, then closes on resolve and stays on reject", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const onEditCommit = vi.fn(() => promise);

    mountTable({
      columns: nameColumn(),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    const input = textbox()!;

    setText(input, "Caroline");
    press(input, "Enter");
    await tick();

    expect(q("[data-pending]")).toBeTruthy();

    resolve();
    await eventually(() => textbox() === null, "editor never closed after resolve");
  });

  it("a rejected commit surfaces the reason and keeps editing", async () => {
    const onEditCommit = vi.fn(() => Promise.reject(new Error("server said no")));

    mountTable({
      columns: nameColumn(),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    const input = textbox()!;

    setText(input, "Caroline");
    press(input, "Enter");

    await eventually(() => elementByText("server said no") !== null, "rejection never surfaced");
    expect(textbox()).toBeTruthy();
  });

  it("commits — never discards — when unmounted mid-edit, deferred one tick", async () => {
    // Regression: the deferral lets the virtualizer's row remounts cancel the commit, while a
    // real departure still commits. (Real timers stand in for React's fake clock: the deferred
    // tick is the same setTimeout(0), awaited instead of advanced.)
    const onEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: nameColumn(),
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    setText(textbox()!, "Caroline");

    wrapper.unmount();
    expect(onEditCommit).not.toHaveBeenCalled();

    await macrotask();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ value: "Caroline" });
  });

  it("the checkbox variant commits on toggle without entering edit mode", async () => {
    const onEditCommit = vi.fn();
    mountTable({
      data: people,
      getRowId,
      columns: [
        {
          accessorKey: "active",
          header: "Active",
          meta: { edit: { instant: checkboxEditor() } }
        }
      ],
      onEditCommit
    });
    await tick();

    const checkbox = q(".ledger-cell input[type=\"checkbox\"]") as HTMLInputElement | null;

    expect(checkbox).toBeTruthy();
    checkbox?.click();
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit.mock.calls[0]?.[0]).toMatchObject({ value: false, previousValue: true });
    expect(textbox()).toBeNull();
  });

  it("does not leave a cell when Tab hits validation or an async rejection", async () => {
    const onEditCommit = vi.fn(() => Promise.reject(new Error("server said no")));
    const tabColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            render: textEditor(),
            validate: value => value === "invalid" ? "invalid name" : null
          }
        }
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { edit: textEditor() }
      }
    ];

    mountTable({
      columns: tabColumns,
      data: people,
      getRowId,
      onEditCommit
    });

    await dblClickCell("Carol");
    const input = textbox()!;

    setText(input, "invalid");
    press(input, "Tab");
    await tick();

    expect(elementByText("invalid name")).toBeTruthy();
    expect(textbox()!.value).toBe("invalid");
    expect(onEditCommit).not.toHaveBeenCalled();

    setText(input, "Caroline");
    press(input, "Tab");

    await eventually(() => elementByText("server said no") !== null, "rejection never surfaced");
    expect(textbox()!.value).toBe("Caroline");
  });

  it("waits for an async Tab commit, then skips an object-form checkbox editor", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const tabColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: { edit: textEditor() }
      },
      {
        accessorKey: "active",
        header: "Active",
        meta: { edit: { instant: checkboxEditor() } }
      },
      {
        accessorKey: "id",
        header: "ID",
        meta: { edit: textEditor() }
      }
    ];

    mountTable({
      columns: tabColumns,
      data: people,
      getRowId,
      onEditCommit: () => promise
    });

    await dblClickCell("Carol");
    const input = textbox()!;

    setText(input, "Caroline");
    press(input, "Tab");
    await tick();

    expect(textbox()!.value).toBe("Caroline");
    expect(q("[data-pending]")).toBeTruthy();

    resolve();

    await eventually(() => textbox()?.value === "1", "Tab never landed on the column after the checkbox");
  });

  it("handles an async checkbox rejection and exposes the error without an unhandled promise", async () => {
    mountTable({
      data: people,
      getRowId,
      columns: [
        {
          accessorKey: "active",
          header: "Active",
          meta: { edit: { instant: checkboxEditor() } }
        }
      ],
      onEditCommit: () => Promise.reject(new Error("toggle failed"))
    });
    await tick();

    const checkbox = q(".ledger-cell input[type=\"checkbox\"]") as HTMLInputElement | null;

    expect(checkbox).toBeTruthy();
    checkbox?.click();

    const alert = await (async () => {
      await eventually(() => q("[role=\"alert\"]") !== null, "alert never appeared");

      return q("[role=\"alert\"]")!;
    })();

    expect(alert.textContent).toBe("toggle failed");
    await eventually(() => checkbox?.disabled === false, "checkbox never re-enabled");
  });

  it("blocks an object-form checkbox commit when validation fails", async () => {
    const onEditCommit = vi.fn();

    mountTable({
      data: people,
      getRowId,
      columns: [
        {
          accessorKey: "active",
          header: "Active",
          meta: {
            edit: {
              instant: checkboxEditor(),
              validate: () => "toggle not allowed"
            }
          }
        }
      ],
      onEditCommit
    });
    await tick();

    const checkbox = q(".ledger-cell input[type=\"checkbox\"]") as HTMLInputElement | null;

    expect(checkbox).toBeTruthy();
    checkbox?.click();

    await eventually(() => q("[role=\"alert\"]") !== null, "validation message never appeared");

    expect(q("[role=\"alert\"]")?.textContent).toBe("toggle not allowed");
    expect(onEditCommit).not.toHaveBeenCalled();
  });
});

describe("the session context", () => {
  it("hands a custom renderer the mode, focus hint and accessible name, and runs its config validate", async () => {
    const seen: Array<{ autoFocus: boolean; label: string; mode: string }> = [];
    const onEditCommit = vi.fn();

    const contextColumns: Array<ColumnDef<Person, any>> = [
      {
        accessorKey: "name",
        header: "Name",
        meta: {
          edit: {
            render: ((context: {
              autoFocus: boolean;
              error: string | null;
              label: string;
              mode: string;
              setValue: (value: unknown) => void;
              value: unknown;
            }) => {
              seen.push({
                autoFocus: context.autoFocus,
                label: context.label,
                mode: context.mode
              });

              return [
                h("input", {
                  "aria-label": context.label,
                  value: context.value === null || context.value === undefined ? "" : String(context.value),
                  onInput: (event: Event) => context.setValue((event.target as HTMLInputElement).value)
                }),
                context.error ? h("span", { role: "alert" }, context.error) : null
              ];
            }) as DataTableEditRenderer<Person, any>,
            validate: value => value === "" ? "Name is required" : null
          }
        }
      }
    ];

    mountTable({
      data: people,
      editingCell: { columnId: "name", rowId: "1" },
      getRowId,
      columns: contextColumns,
      onEditCommit,
      onEditingCellChange: vi.fn()
    });
    await tick();

    // The context names the session, not the control: which mode hosts it, whether to take
    // focus, and the localized accessible name the column resolves to.
    expect(seen[0]).toEqual({
      autoFocus: true,
      label: "Edit Name",
      mode: "cell"
    });

    const input = q("input[aria-label=\"Edit Name\"]") as HTMLInputElement | null;

    expect(input).toBeTruthy();
    setText(input!, "");
    press(input!, "Enter");
    await tick();

    // `validate` rides the config for ANY renderer — custom ones included, which the old
    // variant shapes never offered — so the empty draft never reaches the application.
    expect(onEditCommit).not.toHaveBeenCalled();
    expect(elementByText("Name is required")).toBeTruthy();
  });
});
