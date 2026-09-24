import type { RowData } from "@tanstack/vue-table";
import type { CSSProperties, PropType } from "vue";

import type { DataTableIcons } from "./icons";
import type { DataTableLabels } from "./labels";
import type { TableInstance } from "./types";
import { computed, defineComponent, h, onScopeDispose, ref, watch } from "vue";

import { createDebouncer, LedgerCloseButton, LedgerTextInput } from "./controls";
import { resolveIcons } from "./icons";
import { resolveLabels } from "./labels";

/**
 * `DataTable.Search` — the global-filter input, debounced. A standalone compound: takes the
 * table instance, composes anywhere (toolbars are the page's territory).
 */
export interface DataTableSearchProps<TData extends RowData> {
  table: TableInstance<TData>;
  /**
   * Debounce before the global filter applies, in milliseconds.
   */
  debounce?: number;
  labels?: Partial<DataTableLabels>;
  icons?: Partial<DataTableIcons>;
  placeholder?: string;
  width?: string | number;
  class?: string;
  style?: CSSProperties;
}

export const DataTableSearch = defineComponent({
  name: "DataTableSearch",
  props: {
    table: { type: Object as PropType<TableInstance<any>>, required: true },
    debounce: { type: Number, default: 200 },
    labels: { type: Object as PropType<Partial<DataTableLabels>>, default: undefined },
    icons: { type: Object as PropType<Partial<DataTableIcons>>, default: undefined },
    placeholder: { type: String, default: undefined },
    width: { type: [String, Number] as PropType<string | number>, default: undefined }
  },
  setup(props) {
    const resolved = resolveLabels(props.labels);
    const resolvedIcons = resolveIcons(props.icons);
    const globalFilter = computed(() => (props.table.atoms.globalFilter.get() as string | undefined) ?? "");
    const value = ref(globalFilter.value);

    const apply = createDebouncer(
      (next: string) => props.table.setGlobalFilter(next),
      () => props.debounce
    );
    const subscribeGlobalFilter = props.table.options.meta?.ledger?.filtering.subscribeGlobalFilter;

    // A reset to the current table value is invisible to a local ref. Subscribe to set attempts so
    // it still cancels a pending local value before that value can write itself back later.
    const unsubscribe = subscribeGlobalFilter?.(next => {
      apply.cancel();
      value.value = next;
    });
    onScopeDispose(() => unsubscribe?.());

    // Follow external changes (a programmatic reset, a controlled slice) once they settle.
    watch(globalFilter, next => {
      apply.cancel();
      value.value = next;
    });

    const clear = () => {
      apply.cancel();
      value.value = "";
      props.table.setGlobalFilter("");
    };

    const handleInput = (next: string) => {
      value.value = next;
      apply.run(next);
    };

    return () => {
      const resolvedPlaceholder = props.placeholder ?? resolved.searchPlaceholder;

      return h(
        "div",
        {
          // A placeholder is not a label — it disappears the moment there is a value. The visible
          // text doubles as the name so the two never disagree (`aria-label` on the input below).
          class: "ledger-search",
          style: props.width !== undefined ? { width: typeof props.width === "number" ? `${props.width}px` : props.width } : undefined
        },
        [
          h("span", { class: "ledger-search-icon", "aria-hidden": true }, [h(resolvedIcons.search, { size: 14 })]),

          h(LedgerTextInput, {
            modelValue: value.value,
            placeholder: resolvedPlaceholder,
            ariaLabel: resolvedPlaceholder,
            "onUpdate:modelValue": handleInput
          }),

          value.value !== ""
            && h(LedgerCloseButton, { ariaLabel: resolved.clearFilter, onClick: clear })
        ]
      );
    };
  }
});
