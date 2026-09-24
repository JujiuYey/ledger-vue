import type { Ref } from "vue";
import { defineComponent, h, nextTick, reactive, ref } from "vue";

import type { DataTablePersistableSlice, DataTablePersistState } from "./types";

import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPersistedState, usePersistWriter } from "./persist";

function storageStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: (key: string) => store.delete(key)
  };
}

function persistableState(width: number): Record<DataTablePersistableSlice, Ref<any>> {
  return {
    sorting: ref([]),
    columnFilters: ref([]),
    globalFilter: ref(""),
    pagination: ref({ pageIndex: 0, pageSize: 20 }),
    columnVisibility: ref({}),
    columnPinning: ref({ start: [], end: [] }),
    columnOrder: ref([]),
    columnSizing: ref({ name: width }),
    grouping: ref([])
  };
}

/**
 * Vue edition of `renderHook`: the composable runs inside a mounted host component, so its
 * watchers get a real effect scope and the unmount flush can be driven for real.
 */
function useWriterInSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T;

  const Host = defineComponent({
    setup() {
      result = composable();

      return () => h("div");
    }
  });

  const wrapper = mount(Host);

  return { result, unmount: () => wrapper.unmount() };
}

describe("readPersistedState", () => {
  it("returns only shape-valid slices from the requested set", () => {
    const storage = storageStub({
      "ledger:demo": JSON.stringify({
        sorting: [{ id: "name", desc: false }],
        columnSizing: "corrupt",
        columnVisibility: { age: false },
        unknown: 1
      })
    });

    const state = readPersistedState({
      key: "demo",
      slices: ["sorting", "columnSizing", "columnVisibility"],
      storage
    });

    expect(state).toEqual({
      sorting: [{ id: "name", desc: false }],
      columnVisibility: { age: false }
    });
  });

  it("degrades corrupt storage to defaults instead of throwing", () => {
    const storage = storageStub({ "ledger:demo": "not json{{{" });

    expect(readPersistedState({ key: "demo", storage })).toEqual({});
  });

  it("rejects invalid nested slice shapes", () => {
    const storage = storageStub({
      "ledger:demo": JSON.stringify({
        sorting: [{ id: 1, desc: false }],
        columnFilters: [{ id: "name" }],
        globalFilter: 1,
        pagination: { pageIndex: -1, pageSize: 0 },
        columnVisibility: { age: "false" },
        columnPinning: { start: "name", end: [] },
        columnOrder: ["name", 1],
        columnSizing: { name: "240" },
        grouping: ["department", 1]
      })
    });

    expect(readPersistedState({
      key: "demo",
      slices: [
        "sorting",
        "columnFilters",
        "globalFilter",
        "pagination",
        "columnVisibility",
        "columnPinning",
        "columnOrder",
        "columnSizing",
        "grouping"
      ],
      storage
    })).toEqual({});
  });

  it("accepts valid nested slice shapes", () => {
    const persisted = {
      sorting: [{ id: "name", desc: false }],
      columnFilters: [{ id: "name", value: "ali" }],
      globalFilter: "ali",
      pagination: { pageIndex: 2, pageSize: 20 },
      columnVisibility: { age: false },
      columnPinning: { start: ["name"], end: ["age"] },
      columnOrder: ["name", "age"],
      columnSizing: { name: 240 },
      grouping: ["department"]
    };
    const storage = storageStub({ "ledger:demo": JSON.stringify(persisted) });

    expect(readPersistedState({
      key: "demo",
      slices: [
        "sorting",
        "columnFilters",
        "globalFilter",
        "pagination",
        "columnVisibility",
        "columnPinning",
        "columnOrder",
        "columnSizing",
        "grouping"
      ],
      storage
    })).toEqual(persisted);
  });
});

describe("usePersistWriter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes the picked slices, debounced", () => {
    const storage = storageStub();

    useWriterInSetup(() => usePersistWriter({
      key: "demo",
      slices: ["columnSizing"],
      storage
    }, persistableState(240)));

    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(storage.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("re-targets the pending debounced write when the storage backend swaps", async () => {
    const storageA = storageStub();
    const storageB = storageStub();

    // The Vue edition treats the persist config as a mount-time fact, so a backend swap is a
    // mutation of a reactive config object (a consent flow upgrading in-memory storage to
    // localStorage) — the watcher's storage source tracks exactly that.
    const persist = reactive<DataTablePersistState>({
      key: "demo",
      slices: ["columnSizing"],
      storage: storageA
    });

    useWriterInSetup(() => usePersistWriter(persist, persistableState(240)));

    // Swap mid-debounce: the pending write must land in the new backend, not the old one.
    persist.storage = storageB;
    await nextTick();
    vi.advanceTimersByTime(300);

    expect(storageA.setItem).not.toHaveBeenCalled();
    expect(storageB.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("flushes the latest pending value on a real unmount", async () => {
    const storage = storageStub();
    const persist: DataTablePersistState = {
      key: "demo",
      slices: ["columnSizing"],
      storage
    };
    const state = persistableState(120);

    const { unmount } = useWriterInSetup(() => usePersistWriter(persist, state));

    state.columnSizing.value = { name: 240 };
    await nextTick();
    unmount();
    vi.advanceTimersByTime(1);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      "ledger:demo",
      JSON.stringify({ columnSizing: { name: 240 } })
    );
  });

  it("writes once the debounce completes, not early", () => {
    // React: "does not flush during a StrictMode simulated unmount" — N/A, Vue has no simulated
    // unmounts. What survives is the timing pin: the write lands at the full debounce, and no
    // earlier tick flushes it.
    const storage = storageStub();

    useWriterInSetup(() => usePersistWriter({
      key: "demo",
      slices: ["columnSizing"],
      storage
    }, persistableState(240)));

    vi.advanceTimersByTime(1);
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(249);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("skips a write the state cannot be serialized into, and writes nothing stale in its place", async () => {
    const storage = storageStub();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const persist: DataTablePersistState = {
      key: "demo",
      slices: ["columnFilters"],
      storage
    };
    const state = persistableState(240);

    useWriterInSetup(() => usePersistWriter(persist, state));

    state.columnFilters.value = [{ id: "name", value: "Carol" }];
    await nextTick();
    vi.advanceTimersByTime(250);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    // A filter value JSON cannot represent must not take the render down...
    state.columnFilters.value = [{ id: "name", value: circular }];
    await nextTick();
    vi.advanceTimersByTime(250);

    // ...and must not leave the previous payload standing in for the current state either.
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    state.columnFilters.value = [{ id: "name", value: 10n }];
    await nextTick();
    vi.advanceTimersByTime(250);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    // A serializable value afterwards writes normally.
    state.columnFilters.value = [{ id: "name", value: "Alice" }];
    await nextTick();
    vi.advanceTimersByTime(250);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      "ledger:demo",
      JSON.stringify({ columnFilters: [{ id: "name", value: "Alice" }] })
    );
  });
});

describe("persisted column pinning", () => {
  it("comes back unique and disjoint", () => {
    const storage = storageStub({
      "ledger:demo": JSON.stringify({
        columnPinning: { start: ["name", "name", "age"], end: ["age", "city", "city"] }
      })
    });

    const restored = readPersistedState({
      key: "demo",
      slices: ["columnPinning"],
      storage
    });

    // The same column twice — on one side or on both — would be drawn twice.
    expect(restored.columnPinning).toEqual({ end: ["city"], start: ["name", "age"] });
  });
});
