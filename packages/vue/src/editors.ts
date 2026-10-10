import type { VueContent } from "./types";
import { h } from "vue";

import type { DataTableEditRenderer, DataTableInstantEditRenderer, SelectEditorOption } from "./types";

import LedgerSelect from "./select.vue";

/**
 * The shipped editor renderers — conveniences, never the mechanism. Each is an ordinary
 * renderer over the public editing contexts (docs/editing.md#editors), which is the proof the
 * contexts suffice: anything these do, an application's own renderer can do the same way.
 * All are native controls carrying the `ledger-input` / `ledger-checkbox` classes at the
 * context's `size` — the border marks the cell as an open editor, and the size keeps it inside
 * the row. A validation message rides the control as `ledger-input-error`, stacked under it by
 * the `ledger-editor-field` wrapper. The select editor is the one exception: its dropdown is a
 * floating surface (reka's Select, `select.ts`), so picking behaves like the React edition's
 * Mantine Select rather than like a native control.
 */
export type { SelectEditorOption } from "./types";

/**
 * The editor's field: the control with its validation message stacked under it. The host's
 * `.ledger-cell-editor` is a flex row; this wrapper is what keeps the message below the control
 * the way the React edition's input wrappers did.
 */
function editorField(control: VueContent, error: string | null): VueContent {
  return h("div", { class: "ledger-editor-field" }, [
    control,
    error ? h("div", { class: "ledger-input-error", role: "alert" }, error) : null
  ]);
}

const renderTextEditor: DataTableEditRenderer<any, any> = ({
  value,
  setValue,
  error,
  pending,
  autoFocus,
  label,
  size
}) => editorField(
  h("input", {
    "aria-invalid": error ? true : undefined,
    "aria-label": label,
    autofocus: autoFocus || undefined,
    class: "ledger-input",
    "data-size": size,
    disabled: pending || undefined,
    type: "text",
    value: value === null || value === undefined ? "" : String(value),
    onInput: event => setValue((event.target as HTMLInputElement).value)
  }),
  error
);

/**
 * A plain text editor: `meta.edit: textEditor()`.
 */
export function textEditor(): DataTableEditRenderer<any, any> {
  return renderTextEditor;
}

const renderNumberEditor: DataTableEditRenderer<any, any> = ({
  value,
  setValue,
  error,
  pending,
  autoFocus,
  label,
  size
}) => editorField(
  h("input", {
    "aria-invalid": error ? true : undefined,
    "aria-label": label,
    autofocus: autoFocus || undefined,
    class: "ledger-input",
    "data-size": size,
    disabled: pending || undefined,
    // Text over `type: "number"`: no spin buttons, and an unparseable draft reaches `setValue` as
    // the string it is, the way the React edition's NumberInput reported it.
    inputmode: "decimal",
    type: "text",
    value: typeof value === "number" || typeof value === "string" ? value : "",
    onInput: event => {
      const next = (event.target as HTMLInputElement).value;
      const trimmed = next.trim();

      setValue(trimmed === "" ? null : Number.isNaN(Number(trimmed)) ? next : Number(trimmed));
    }
  }),
  error
);

/**
 * A numeric editor; an emptied input holds `null`, never `0`.
 */
export function numberEditor(): DataTableEditRenderer<any, any> {
  return renderNumberEditor;
}

/**
 * A single-pick editor over the given options. In cell mode the dropdown opens with the editor
 * and picking an option commits at once — one cell is the whole session; in row mode it is one
 * draft-bound field among the row's others, and the row's own commit decides.
 */
export function selectEditor(options: SelectEditorOption[]): DataTableEditRenderer<any, any> {
  return ({
    value,
    setValue,
    commit,
    error,
    pending,
    mode,
    label,
    size
  }) => editorField(
    h(LedgerSelect, {
      "ariaLabel": label,
      defaultOpen: mode === "cell" || undefined,
      disabled: pending || undefined,
      modelValue: value === null || value === undefined ? null : String(value),
      options,
      size,
      "onUpdate:modelValue": (next: string | null) => {
        setValue(next);

        if (mode === "cell") {
          void commit();
        }
      }
    }),
    error
  );
}

const renderCheckboxEditor: DataTableInstantEditRenderer<any, any> = ({
  value,
  commit,
  pending,
  error,
  label,
  size
}) => h("input", {
  "aria-invalid": error ? true : undefined,
  "aria-label": label,
  checked: Boolean(value),
  class: "ledger-checkbox",
  "data-size": size,
  disabled: pending || undefined,
  // Styles only — the instant host renders the message in its own alert region.
  type: "checkbox",
  onChange: event => void commit((event.target as HTMLInputElement).checked)
});

/**
 * A live checkbox for an instant column: `meta.edit: { instant: checkboxEditor() }`. Each
 * toggle commits the flipped value; the host disables it while its own write is out.
 */
export function checkboxEditor(): DataTableInstantEditRenderer<any, any> {
  return renderCheckboxEditor;
}
