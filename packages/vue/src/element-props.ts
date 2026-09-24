import clsx from "clsx";

import type { DataAttributes } from "./data-attributes";

export type { DataAttributes };

/**
 * The DOM escape hatch (docs/styling.md#dom-props): every rendered row, cell, and header cell
 * accepts consumer props — attributes, `data-*`, `aria-*`, inline styles, extra handlers —
 * either as a static object or as a function of the element's subject.
 *
 * The props objects bind to the element as-is (`v-bind`); `class` and `style` are the composed
 * exceptions (see `mergeElementProps`). `ref` is deliberately excluded from every one of these
 * types: they are declarative prop hooks resolved per render (per virtual item, for rows), not
 * component instances, and ledger already owns the row ref for virtualization measurement.
 */
export type DataTableElementProps<TProps, TSubject>
  = | (TProps & DataAttributes)
    | ((subject: TSubject) => (TProps & DataAttributes) | undefined);

export function resolveElementProps<TProps, TSubject>(
  props: DataTableElementProps<TProps, TSubject> | undefined,
  subject: TSubject
): (TProps & DataAttributes) | undefined {
  return typeof props === "function"
    ? (props as (subject: TSubject) => (TProps & DataAttributes) | undefined)(subject)
    : props;
}

/**
 * Compose consumer props with ledger's own, with four rules:
 *
 * - ledger's structural props win — `role`, the `data-*` state contract and the ARIA indices are
 * the styling and semantic contract, not suggestions;
 * - but only where ledger actually sets one: an owned key holding `undefined` means "ledger has
 * no opinion here" and must not erase the consumer's value;
 * - `class` and `style` compose, consumer last — an escape hatch that silently dropped an
 * author's declaration would not be one, so overriding a ledger inline value (a pinned cell's
 * sticky offset, say) is possible and is the author's to own;
 * - a handler present on both sides chains, ledger's first (its stop-propagation covenant and
 * active-row bookkeeping run before the consumer sees the event).
 */
export function mergeElementProps<TOwned extends Record<string, any>>(
  consumer: Record<string, any> | undefined,
  owned: TOwned
): TOwned {
  if (!consumer) {
    return owned;
  }

  const merged: Record<string, any> = { ...consumer };

  for (const [key, ownedValue] of Object.entries(owned)) {
    const consumerValue = consumer[key];

    if (
      key.startsWith("on")
      && typeof ownedValue === "function"
      && typeof consumerValue === "function"
    ) {
      merged[key] = (...args: unknown[]) => {
        ownedValue(...args);
        consumerValue(...args);
      };
    } else if (ownedValue !== undefined) {
      // An owned key holding `undefined` is "no opinion" — skipping the write leaves the
      // consumer's value standing.
      merged[key] = ownedValue;
    }
  }

  const className = clsx(owned.class, consumer.class);

  merged.class = className === "" ? undefined : className;

  if (consumer.style || owned.style) {
    const ownedStyle = typeof owned.style === "object" ? owned.style : {};
    const consumerStyle = typeof consumer.style === "object" ? consumer.style : {};

    merged.style = { ...ownedStyle, ...consumerStyle };
  }

  return merged as TOwned;
}
