import { nextTick } from "vue";

import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ColumnDef } from "./types";

import DataTable from "./data-table.vue";
import { selectEditor, textEditor } from "./editors";
import type { SelectEditorOption } from "./types";

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

function mountTable(props: Record<string, unknown>): ReturnType<typeof mount> {
  const host = document.createElement("div");

  host.style.height = "600px";
  document.body.appendChild(host);
  hosts.push(host);

  return mount(DataTable as never, { attachTo: host, props: props as never });
}

enableAutoUnmount(afterEach);

afterEach(() => {
  for (const element of hosts.splice(0)) {
    element.remove();
  }
});

/* ---- queries ---- */

const all = (selector: string, root: ParentNode = document): HTMLElement[] =>
  [...root.querySelectorAll(selector)] as HTMLElement[];

const q = (selector: string, root: ParentNode = document): HTMLElement | null =>
  root.querySelector(selector) as HTMLElement | null;

const cellWithText = (text: string): HTMLElement | null =>
  all(".ledger-tbody .ledger-cell").find(cell => cell.textContent === text) ?? null;

const editorInput = (): HTMLInputElement | null =>
  q(".ledger-cell-editor input[type=\"text\"], .ledger-cell-editor input:not([type])") as HTMLInputElement | null;

function press(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** reka's SelectItem selects on pointerup; jsdom has no PointerEvent, so the MouseEvent stands in. */
function pickOption(label: string, root: ParentNode = document): void {
  const option = all('[role="option"]', root).find(element => element.textContent === label);

  if (!option) {
    throw new Error(`no option labelled ${label}`);
  }

  option.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
}

async function tick(times = 2): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

async function dblClickCell(text: string): Promise<void> {
  cellWithText(text)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await tick();
}

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

/* ---- columns ---- */

function selectColumn(options: SelectEditorOption[]): Array<ColumnDef<Person, any>> {
  return [
    {
      accessorKey: "name",
      header: "Name",
      meta: { edit: selectEditor(options) }
    }
  ];
}

describe("the select editor", () => {
  it("opens the dropdown with the editor in cell mode and commits the pick at once", async () => {
    const onEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: selectColumn(["Carol", "Alice", "Dave"]),
      data: people,
      getRowId,
      onEditCommit
    });
    await dblClickCell("Carol");

    // The dropdown is portaled to the body and open at once — Mantine's `defaultDropdownOpened`.
    const listbox = q('[role="listbox"]');
    expect(listbox).not.toBeNull();

    pickOption("Dave");
    await tick();

    expect(onEditCommit).toHaveBeenCalledTimes(1);
    expect(onEditCommit).toHaveBeenCalledWith(expect.objectContaining({ previousValue: "Carol", value: "Dave" }));
    expect(q(".ledger-cell-editor")).toBeNull();
    expect(q('[role="listbox"]')).toBeNull();
    wrapper.unmount();
  });

  it("keeps the dropdown closed in row mode, and the pick only stages the row draft", async () => {
    // jsdom has no pointer capture; reka's trigger asks for it on the opening pointerdown.
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};

    const onRowEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: [
        {
          accessorKey: "name",
          header: "Name",
          meta: { edit: textEditor() }
        },
        {
          accessorKey: "id",
          header: "Zone",
          meta: { edit: selectEditor(["A-01", "B-02", "C-01"]) }
        }
      ],
      data: people,
      editMode: "row",
      getRowId,
      // Controlled with an echo: the row's own commit has to be able to close it.
      editingRowId: "1",
      onEditingRowIdChange: (value: string | null) => {
        void wrapper.setProps({ editingRowId: value });
      },
      onRowEditCommit
    });
    await tick();

    expect(q('[role="listbox"]')).toBeNull();
    expect(q('[data-editing-row]')).not.toBeNull();

    // Opening and picking stages the draft; the row's own commit decides. The reka trigger
    // opens on pointerdown, the way Radix triggers do — and, exactly like the React edition's
    // Mantine Select, Enter on the closed trigger opens the dropdown rather than committing.
    q(".ledger-cell-editor .ledger-editor-select-trigger")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    await tick();

    pickOption("B-02");
    await tick();
    expect(onRowEditCommit).not.toHaveBeenCalled();
    expect(q(".ledger-editor-select-trigger")?.textContent).toContain("B-02");

    // Enter on the row's text field commits the whole row, draft included.
    press(editorInput()!, "Enter");
    await eventually(() => q('[data-editing-row]') === null);
    expect(onRowEditCommit).toHaveBeenCalledWith(expect.objectContaining({
      previousValues: { id: "1", name: "Carol" },
      values: { id: "B-02", name: "Carol" }
    }));
    wrapper.unmount();
  });

  it("renders groups as captions above their options", async () => {
    const wrapper = mountTable({
      columns: selectColumn([
        "Solo",
        { group: "Zone A", items: ["A-01", "A-02"] },
        { group: "Zone B", items: ["B-01"] }
      ]),
      data: people,
      getRowId,
      onEditCommit: vi.fn()
    });
    await dblClickCell("Carol");

    expect(q(".ledger-editor-select-group-label", document)?.textContent).toBe("Zone A");
    expect(all(".ledger-editor-select-group-label", document).map(element => element.textContent)).toEqual(["Zone A", "Zone B"]);

    // The ungrouped head stays outside any group.
    expect(all('[role="option"]').map(element => element.textContent)).toEqual(["Solo", "A-01", "A-02", "B-01"]);

    pickOption("A-02");
    await tick();
    expect(q(".ledger-cell-editor")).toBeNull();
    wrapper.unmount();
  });

  it("shows the current value's label on the trigger, without the placeholder mark", async () => {
    const wrapper = mountTable({
      columns: selectColumn(["Carol", "Alice"]),
      data: people,
      getRowId,
      onEditCommit: vi.fn()
    });
    await dblClickCell("Carol");

    // The row's value is Carol; the trigger carries the selected option's label and no
    // placeholder mark.
    const trigger = q(".ledger-editor-select-trigger") as HTMLElement;
    expect(trigger.textContent).toContain("Carol");
    expect(trigger.hasAttribute("data-placeholder")).toBe(false);
    wrapper.unmount();
  });

  it("refuses a disabled option", async () => {
    const onEditCommit = vi.fn();
    const wrapper = mountTable({
      columns: selectColumn([{ value: "Carol" }, { value: "Dave", disabled: true }]),
      data: people,
      getRowId,
      onEditCommit
    });
    await dblClickCell("Alice");

    pickOption("Dave");
    await tick();

    expect(onEditCommit).not.toHaveBeenCalled();
    expect(q(".ledger-cell-editor")).not.toBeNull();

    // An enabled option still commits afterwards.
    pickOption("Carol");
    await eventually(() => q(".ledger-cell-editor") === null);
    expect(onEditCommit).toHaveBeenCalledWith(expect.objectContaining({ previousValue: "Alice", value: "Carol" }));
    wrapper.unmount();
  });
});
