import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from "vue";
import type { DataTableLabels } from "@coldsmirk/ledger-vue";
import type { ShallowRef } from "vue";
import { computed, inject, provide, ref, toValue, watchEffect } from "vue";

import { defaultLabels } from "@coldsmirk/ledger-vue";
import { zhCN } from "@coldsmirk/ledger-vue/locales";

/**
 * The playground ships in both languages, which is also the only way to see the `zhCN` locale
 * actually working — flipping this swaps the `labels` the library renders with. Same contract
 * as the React edition's i18n.tsx: demos declare their own inline copy blocks instead of
 * reaching into a central catalog, so each demo file reads on its own in the source drawer.
 */
export type Lang = "en" | "zh";

/**
 * One block of copy in both languages.
 */
export type Copy<T> = Record<Lang, T>;

const LANG_KEY = "ledger-playground-lang";

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

const lang = ref<Lang>(readStoredLang());

/**
 * Layout, not passive: a returning zh reader's stored choice has to reach `<html lang>` before
 * the first paint that already shows their language.
 */
watchEffect(() => {
  document.documentElement.lang = lang.value === "zh" ? "zh-CN" : "en";

  try {
    localStorage.setItem(LANG_KEY, lang.value);
  } catch {
    /* private mode — the choice just does not persist */
  }
});

export interface LanguageValue {
  lang: ShallowRef<Lang>;
  setLang: (lang: Lang) => void;
}

const LanguageKey: InjectionKey<LanguageValue> = Symbol("Language");

export function provideLanguage(): void {
  provide(LanguageKey, { lang, setLang: next => (lang.value = next) });
}

export function useLang(): LanguageValue {
  const value = inject(LanguageKey, null);

  if (value === null) {
    throw new Error("[playground] useLang must be called inside the playground shell");
  }

  return value;
}

/**
 * The active side of a copy block. Returns a computed — read `t.value.x` in script and
 * `t.x` in templates (top-level computed refs unwrap) — so column definitions that depend
 * on it re-run when the language flips and no stale header survives the switch.
 */
export function useCopy<T>(copy: Copy<T>): ComputedRef<T> {
  return computed(() => copy[lang.value]);
}

/**
 * The app-wide `labels` the shell injects into every table — the Vue counterpart of the React
 * edition's theme `defaultProps` mechanism (there is no component-library theme here, so each
 * demo passes `:labels="labels"` to its tables and compounds).
 */
export function useLangLabels(): ComputedRef<DataTableLabels> {
  return computed(() => (lang.value === "zh" ? zhCN : defaultLabels));
}

/**
 * Read a reactive lang as a plain value (the data generators take `Lang`, not a ref).
 */
export function langValue(source?: MaybeRefOrGetter<Lang>): Lang {
  return toValue(source ?? lang);
}
