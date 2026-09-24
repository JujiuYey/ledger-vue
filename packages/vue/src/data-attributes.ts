/**
 * The `data-*` escape hatch: an attribute record keyed by kebab-case attribute names, bound
 * through `v-bind` (Vue accepts `data-*` and `aria-*` keys on DOM props natively — this type
 * exists so a function-typed props hook can carry them without a cast).
 */
export type DataAttributes = Record<`data-${string}`, string | number | boolean | null | undefined>;
