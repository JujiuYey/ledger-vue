import type { RowData } from "@tanstack/vue-table";
import type { PropType } from "vue";

import type { DateRangeFilterValue } from "./filter-fns";
import type { Column, DataTableFilterConfig } from "./types";
import { computed, defineComponent, h, onScopeDispose, ref, watch } from "vue";

import { columnHeaderText } from "./build-columns";
import { createDebouncer, LedgerButton, LedgerCloseButton, LedgerMultiSelect, LedgerNumberInput, LedgerPopover, LedgerSelect, LedgerTextInput } from "./controls";
import { useDataTableContext } from "./context";
import { warnOnce } from "./env";
import { SIZES } from "./size";

/**
 * Header filter UI: a funnel trigger (filled while active) opening a popover with the control
 * `meta.filter` declares. Client mode derives `select`/`multi-select` options from faceted
 * values when none are given; server mode requires explicit options and degrades to the text
 * variant (with a dev warning) when they are missing. Date bounds render two native date inputs
 * (the React edition's `@mantine/dates` range calendar, reduced to the same `YYYY-MM-DD` strings
 * the filter fn compares — no nested popover to misread as an outside click).
 *
 * Clearing lives on each control, not on a shared popover row: `select`/`multi-select` use
 * their clear buttons, `text` clears from its trailing button, `range` from the end of
 * its input row, and the date inputs from a caption under them. Only a custom render filter —
 * a black box that may ship no clear of its own — keeps the popover-level fallback.
 */
const FACETED_OPTIONS_CAP = 100;

export interface FilterPopoverProps<TData extends RowData> {
  column: Column<TData, unknown>;
}

export const FilterPopover = defineComponent({
  name: "FilterPopover",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true }
  },
  setup(props) {
    const {
      labels,
      icons,
      filterMode,
      size
    } = useDataTableContext();
    const filter = props.column.columnDef.meta?.filter;

    if (!filter || !props.column.getCanFilter()) {
      return () => null;
    }

    // Every filter control in a header is the same control; only the column tells them apart.
    const name = labels.filterColumn(columnHeaderText(props.column));
    const active = computed(() => {
      props.column.table.atoms.columnFilters.get();

      return props.column.getFilterValue() !== undefined;
    });

    const renderControl = () =>
      typeof filter === "function"
        ? [
            filter(props.column),

            active.value
              ? h("div", { class: "ledger-filter-popover-footer" }, [
                  h(LedgerCloseButton, {
                    ariaLabel: labels.clearFilter,
                    onClick: () => props.column.setFilterValue(undefined)
                  })
                ])
              : null
          ]
        : [
            h(VariantFilterControl, {
              column: props.column,
              config: typeof filter === "string" ? { variant: filter } : filter,
              filterMode,
              name
            })
          ];

    return () =>
      h(
        LedgerPopover,
        {
          class: "ledger-filter-popover",
          placement: "bottom-start",
          panelWidth: 240
        },
        {
          // The funnel stopPropagation's the click so it never reaches a handler on the header
          // cell around it; the popover toggles from this handler, not the anchor's.
          default: ({ toggle }: { toggle: () => void }) =>
            h(
              "div",
              {
                class: "ledger-filter-popover-trigger",
                onClick: (event: MouseEvent) => {
                  event.stopPropagation();
                  toggle();
                }
              },
              h(LedgerButton, {
                variant: active.value ? "light" : "subtle",
                size: SIZES[size].control,
                ariaLabel: name,
                "data-active": active.value || undefined
              }, { default: () => h(icons.filterColumn) })
            ),

          content: () => h("div", { class: "ledger-filter-popover-controls", onClick: (event: MouseEvent) => event.stopPropagation() }, renderControl())
        }
      );
  }
});

export interface VariantFilterControlProps<TData extends RowData> {
  column: Column<TData, unknown>;
  config: DataTableFilterConfig;
  filterMode: "client" | "server";
  /**
   * Accessible name, shared with the funnel trigger — a placeholder is not a label.
   */
  name: string;
}

const VariantFilterControl = defineComponent({
  name: "VariantFilterControl",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    config: { type: Object as PropType<DataTableFilterConfig>, required: true },
    filterMode: { type: String as PropType<"client" | "server">, required: true },
    name: { type: String, required: true }
  },
  setup(props) {
    const { labels } = useDataTableContext();

    return () => {
      switch (props.config.variant) {
        case "text":
          return h(TextFilter, {
            column: props.column,
            name: props.name,
            placeholder: props.config.placeholder ?? labels.filterPlaceholder
          });

        case "select":
        case "multi-select":
          return h(SelectFilter, {
            column: props.column,
            config: props.config,
            filterMode: props.filterMode,
            name: props.name
          });

        case "range":
          return h(RangeFilter, { column: props.column, name: props.name });

        case "date-range":
          return h(DateRangeFilter, { column: props.column, name: props.name });
      }
    };
  }
});

/**
 * The select family, whose two variants differ only in cardinality — one control, one option
 * source, one degradation path.
 */
const SelectFilter = defineComponent({
  name: "SelectFilter",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    config: { type: Object as PropType<Extract<DataTableFilterConfig, { variant: "select" | "multi-select" }>>, required: true },
    filterMode: { type: String as PropType<"client" | "server">, required: true },
    name: { type: String, required: true }
  },
  setup(props) {
    const { labels } = useDataTableContext();

    return () => {
      const placeholder = props.config.placeholder ?? labels.filterPlaceholder;
      // Declared options win; client mode derives them from the faceted values, which server mode
      // has no rows to compute. An explicitly empty list is a declaration like any other. Derived
      // per render — the faceted values are atoms, so the read is what keeps the options live.
      const options
        = props.config.options ?? (props.filterMode === "server" ? undefined : facetedOptions(props.column));
      const filterValue = props.column.getFilterValue();

      if (!options) {
        warnOnce(
          `filter-options-${props.column.id}`,
          `Column "${props.column.id}" uses a ${props.config.variant} filter in server mode without options — faceted values need client-side rows. Falling back to a text filter.`
        );

        return h(TextFilter, { column: props.column, name: props.name, placeholder });
      }

      if (props.config.variant === "multi-select") {
        return h(LedgerMultiSelect, {
          ariaLabel: props.name,
          clearable: true,
          clearLabel: labels.clearFilter,
          options,
          placeholder,
          modelValue: (typeof filterValue !== "string" && Array.isArray(filterValue) ? filterValue : []) as string[],
          "onUpdate:modelValue": (value: string[]) =>
            props.column.setFilterValue(value.length > 0 ? value : undefined)
        });
      }

      return h(LedgerSelect, {
        ariaLabel: props.name,
        clearable: true,
        clearLabel: labels.clearFilter,
        options,
        placeholder,
        modelValue: typeof filterValue === "string" ? filterValue : null,
        "onUpdate:modelValue": value => props.column.setFilterValue(value ?? undefined)
      });
    };
  }
});

const TextFilter = defineComponent({
  name: "TextFilter",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    name: { type: String, required: true },
    placeholder: { type: String, required: true }
  },
  setup(props) {
    // Straight from the context, never through a table instance: this control redraws from its
    // own state, in renders the table root has no part in, and the instance it would reach for
    // then is whatever pass wrote it last (context.ts).
    const { labels, subscribeColumnFilters } = useDataTableContext();
    // Only a string is this control's value. A server-mode `select`/`multi-select` that degrades
    // here (no options to build) inherits whatever filter was already set, and a multi-select's is
    // an array — which a text input would render as its comma-joined form and then write back as
    // one string.
    const raw = computed(() => {
      props.column.table.atoms.columnFilters.get();

      return props.column.getFilterValue();
    });
    const filterValue = computed(() => (typeof raw.value === "string" ? raw.value : ""));
    const value = ref(filterValue.value);
    const apply = createDebouncer(
      (next: string) => props.column.setFilterValue(next === "" ? undefined : next),
      () => 200
    );

    const unsubscribe = subscribeColumnFilters?.(filters => {
      const next = filters.find(filter => filter.id === props.column.id)?.value;

      apply.cancel();
      value.value = typeof next === "string" ? next : "";
    });
    onScopeDispose(() => unsubscribe?.());

    watch(filterValue, next => {
      apply.cancel();
      value.value = next;
    });

    return () =>
      h("div", { class: "ledger-filter-text" }, [
        h(LedgerTextInput, {
          ariaLabel: props.name,
          placeholder: props.placeholder,
          modelValue: value.value,
          "onUpdate:modelValue": next => {
            value.value = next;
            apply.run(next);
          }
        }),

        value.value !== ""
          ? h(LedgerCloseButton, {
              ariaLabel: labels.clearFilter,
              onClick: () => {
                apply.cancel();
                value.value = "";
                props.column.setFilterValue(undefined);
              }
            })
          : null
      ]);
  }
});

const RangeFilter = defineComponent({
  name: "RangeFilter",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    name: { type: String, required: true }
  },
  setup(props) {
    const { labels } = useDataTableContext();
    const bounds = computed(() => {
      props.column.table.atoms.columnFilters.get();

      const value = props.column.getFilterValue() as [number | undefined, number | undefined] | undefined;

      return value ?? [undefined, undefined];
    });
    const facets = computed(() => {
      props.column.table.atoms.columnFilters.get();

      return props.column.getFacetedMinMaxValues() ?? [undefined, undefined];
    });

    const setBound = (index: 0 | 1) => (raw: number | "") => {
      const [min, max] = bounds.value;
      const bound = typeof raw === "number" ? raw : undefined;
      const next: [number | undefined, number | undefined] = index === 0 ? [bound, max] : [min, bound];
      props.column.setFilterValue(next[0] === undefined && next[1] === undefined ? undefined : next);
    };

    return () => {
      const [min, max] = bounds.value;
      const [facetMin, facetMax] = facets.value;
      const active = min !== undefined || max !== undefined;

      return h(
        // The pair is one control: the group carries the column's name, the inputs their bound.
        "div",
        { class: "ledger-filter-popover-row", role: "group", "aria-label": props.name },
        [
          h(LedgerNumberInput, {
            ariaLabel: labels.filterRangeMin,
            style: { flex: "1" },
            placeholder: facetMin === undefined ? labels.filterRangeMin : String(facetMin),
            modelValue: min ?? "",
            "onUpdate:modelValue": setBound(0)
          }),

          h(LedgerNumberInput, {
            ariaLabel: labels.filterRangeMax,
            style: { flex: "1" },
            placeholder: facetMax === undefined ? labels.filterRangeMax : String(facetMax),
            modelValue: max ?? "",
            "onUpdate:modelValue": setBound(1)
          }),

          // Space is reserved while inactive so the inputs keep their width as the button appears.
          h(LedgerCloseButton, {
            ariaLabel: labels.clearFilter,
            style: { visibility: active ? undefined : "hidden" },
            onClick: () => props.column.setFilterValue(undefined)
          })
        ]
      );
    };
  }
});

const DateRangeFilter = defineComponent({
  name: "DateRangeFilter",
  props: {
    column: { type: Object as PropType<Column<any, unknown>>, required: true },
    name: { type: String, required: true }
  },
  setup(props) {
    const { labels } = useDataTableContext();
    const filterValue = computed(() => {
      props.column.table.atoms.columnFilters.get();

      return props.column.getFilterValue() as DateRangeFilterValue | undefined;
    });

    const setBound = (index: 0 | 1) => (raw: string) => {
      const [from, to] = filterValue.value ?? [null, null];
      const next: DateRangeFilterValue = index === 0 ? [raw || null, to] : [from, raw || null];
      props.column.setFilterValue(!next[0] && !next[1] ? undefined : next);
    };

    return () => {
      const value = filterValue.value ?? [null, null];

      return h("div", { class: "ledger-filter-dates" }, [
        h(
          // The pair is one control: the group carries the column's name, the inputs their bound.
          "div",
          { class: "ledger-filter-popover-row", role: "group", "aria-label": props.name },
          [
            h("input", {
              class: "ledger-input",
              type: "date",
              "aria-label": labels.filterRangeMin,
              value: value[0] ?? "",
              onInput: (event: Event) => setBound(0)((event.currentTarget as HTMLInputElement).value)
            }),

            h("input", {
              class: "ledger-input",
              type: "date",
              "aria-label": labels.filterRangeMax,
              value: value[1] ?? "",
              onInput: (event: Event) => setBound(1)((event.currentTarget as HTMLInputElement).value)
            })
          ]
        ),

        // The date inputs have no clear affordance of their own; a quiet caption under them is
        // the date-picker-panel convention instead.
        filterValue.value !== undefined
          ? h("div", { class: "ledger-filter-popover-footer" }, [
              h(
                LedgerButton,
                { variant: "subtle", size: "xs", onClick: () => props.column.setFilterValue(undefined) },
                { default: () => labels.clearFilter }
              )
            ])
          : null
      ]);
    };
  }
});

function facetedOptions(column: Column<any, unknown>): string[] {
  const values: string[] = [];

  // Inside a computed — the faceted values are atoms, and the read is the reactivity.
  for (const key of column.getFacetedUniqueValues().keys()) {
    if (key === null || key === undefined || key === "") {
      continue;
    }

    if (Array.isArray(key)) {
      for (const entry of key) {
        if (entry !== null && entry !== undefined) {
          values.push(String(entry));
        }
      }
    } else {
      values.push(String(key));
    }
  }

  return [...new Set(values)].sort().slice(0, FACETED_OPTIONS_CAP);
}
