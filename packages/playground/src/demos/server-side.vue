<script setup lang="ts">
import type { ColumnDef, ColumnFiltersState, PaginationState, SortingState } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import type { Lang } from "../i18n";

import { createColumnHelper, DataTable, DataTableSearch, useDataTable } from "@coldsmirk/ledger-vue";
import { computed, h, ref, watch } from "vue";

import { makePeople, roleOptions } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

/**
 * The server-backed shape: ledger owns the controls and the state, the backend owns the rows.
 * `sortingMode` / `filterMode` / `paginationMode` are `"server"`, so the matching row models do
 * not run — `data` is exactly one page as the API returned it, and `rowCount` is the total the
 * pager needs. Every state slice is controlled, which is what makes the request derivable.
 */
const copy = {
  en: {
    name: "Name",
    email: "Email",
    role: "Role",
    status: "Status",
    balance: "Balance",
    joinedAt: "Joined",
    searchPlaceholder: "Search name or email",
    pending: "Requesting",
    result: (total: number, requests: number) => `${total} rows · ${requests} requests so far`,
    footnote: (total: number) => `The whole data set holds ${total} people; the table never holds more than the current page, and the total comes from rowCount.`,
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    name: "姓名",
    email: "邮箱",
    role: "角色",
    status: "状态",
    balance: "余额",
    joinedAt: "入职日期",
    searchPlaceholder: "搜索姓名或邮箱",
    pending: "请求中",
    result: (total: number, requests: number) => `${total} 条 · 已发起 ${requests} 次`,
    footnote: (total: number) => `整个数据集有 ${total} 条，表格任何时刻只持有当前一页；合计数来自 rowCount。`,
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

const COLLATION: Record<Lang, string> = {
  en: "en",
  zh: "zh-CN"
};

/* The StatusBadge of the React edition's demos/columns.tsx, folded into this file — the
   pg-badge palette has no teal swatch, so active takes green. */
const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

interface PeopleQuery {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pageIndex: number;
  pageSize: number;
  collation: string;
}

interface PeoplePage {
  rows: Person[];
  total: number;
}

function matchesFilters(person: Person, filters: ColumnFiltersState): boolean {
  return filters.every(filter => {
    const value = person[filter.id as keyof Person];

    if (Array.isArray(filter.value)) {
      return filter.value.length === 0 || filter.value.includes(value as never);
    }

    return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
  });
}

function compare(a: Person, b: Person, id: string, collation: string): number {
  const left = a[id as keyof Person];
  const right = b[id as keyof Person];

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right), collation);
}

/**
 * Stands in for the backend: `dataset` is the store, and only one page of it is ever returned.
 */
async function fetchPeople(dataset: Person[], query: PeopleQuery): Promise<PeoplePage> {
  await new Promise(resolve => {
    setTimeout(resolve, 420);
  });

  const term = query.globalFilter.trim().toLowerCase();
  const matched = dataset.filter(person => {
    const hitsTerm = term === ""
      || person.name.toLowerCase().includes(term)
      || person.email.toLowerCase().includes(term);

    return hitsTerm && matchesFilters(person, query.columnFilters);
  });

  const sorted = query.sorting.length === 0
    ? matched
    : matched.toSorted((a, b) => {
        for (const rule of query.sorting) {
          const result = compare(a, b, rule.id, query.collation);

          if (result !== 0) {
            return rule.desc ? -result : result;
          }
        }

        return 0;
      });

  const start = query.pageIndex * query.pageSize;

  return {
    rows: sorted.slice(start, start + query.pageSize),
    total: sorted.length
  };
}

const helper = createColumnHelper<Person>();

const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const dataset = computed(() => makePeople(lang.value, 437));
const sorting = ref<SortingState>([
  {
    id: "joinedAt",
    desc: true
  }
]);
const columnFilters = ref<ColumnFiltersState>([]);
const globalFilter = ref("");
const pagination = ref<PaginationState>({
  pageIndex: 0,
  pageSize: 10
});
const page = ref<PeoplePage>({
  rows: [],
  total: 0
});
const loading = ref(true);
const requests = ref(0);

const columns = computed((): Array<ColumnDef<Person, any>> => [
  helper.accessor("name", {
    header: t.value.name,
    minSize: 120,
    meta: { filter: "text" }
  }),
  helper.accessor("email", {
    header: t.value.email,
    minSize: 200,
    enableSorting: false,
    meta: { truncate: true }
  }),
  helper.accessor("role", {
    header: t.value.role,
    size: 150,
    // Client mode derives select options from the loaded rows; a server page holds one slice
    // of them, so the options have to be declared.
    meta: {
      filter: {
        variant: "select",
        options: roleOptions(lang.value)
      }
    }
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 120,
    enableSorting: false,
    cell: (context: { getValue: () => "active" | "invited" | "suspended" }) => h("span", {
      class: "pg-badge",
      "data-color": statusColor[context.getValue()]
    }, t.value.statuses[context.getValue()]),
    meta: {
      filter: {
        variant: "multi-select",
        options: Object.entries(t.value.statuses).map(([value, label]) => {
          return { value, label };
        })
      }
    }
  }),
  helper.accessor("balance", {
    header: t.value.balance,
    size: 120,
    cell: context => context.getValue().toFixed(2),
    meta: { align: "end" }
  }),
  helper.accessor("joinedAt", {
    header: t.value.joinedAt,
    size: 130,
    sortDescFirst: true
  })
]);

// The React effect's dependency list, one watcher: every request input is a controlled slice.
watch([dataset, sorting, columnFilters, globalFilter, pagination], (_sources, _previous, onCleanup) => {
  let cancelled = false;

  onCleanup(() => {
    cancelled = true;
  });

  loading.value = true;

  void fetchPeople(dataset.value, {
    sorting: sorting.value,
    columnFilters: columnFilters.value,
    globalFilter: globalFilter.value,
    pageIndex: pagination.value.pageIndex,
    pageSize: pagination.value.pageSize,
    collation: COLLATION[lang.value]
  }).then(result => {
    // The guard is the point: filters race each other, and the last request must win.
    if (cancelled) {
      return;
    }

    page.value = result;
    loading.value = false;
    requests.value += 1;
  });
}, { immediate: true });

const table = useDataTable({
  data: () => page.value.rows,
  columns,
  getRowId: person => person.id,
  sortingMode: "server",
  filterMode: "server",
  paginationMode: "server",
  rowCount: () => page.value.total,
  enableGlobalFilter: true,
  enablePagination: true,
  sorting,
  onSortingChange: value => {
    sorting.value = value;
  },
  columnFilters,
  onColumnFiltersChange: value => {
    columnFilters.value = value;
  },
  globalFilter,
  onGlobalFilterChange: value => {
    globalFilter.value = value;
  },
  // No page-reset wiring here on purpose: a narrowed result set has fewer pages, and ledger
  // already sends `pageIndex` back to 0 on any sorting / column-filter / global-filter change
  // — deterministically, in server mode too, where TanStack's own auto-reset is off
  // (docs/state.md#the-client-server-split). Doing it again here would just fight it.
  pagination,
  onPaginationChange: value => {
    pagination.value = value;
  }
});

const queryLine = computed(() => {
  const parts = [
    `page=${pagination.value.pageIndex + 1}`,
    `size=${pagination.value.pageSize}`,
    sorting.value.length > 0 ? `sort=${sorting.value.map(rule => `${rule.id}:${rule.desc ? "desc" : "asc"}`).join(",")}` : null,
    globalFilter.value.trim() === "" ? null : `q=${globalFilter.value.trim()}`,
    ...columnFilters.value.map(filter => `${filter.id}=${Array.isArray(filter.value) ? filter.value.join("|") : String(filter.value)}`)
  ];

  return `GET /api/people?${parts.filter(Boolean).join("&")}`;
});
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <div class="pg-row">
      <DataTableSearch
        :labels="labels"
        :table="table as any"
        :placeholder="t.searchPlaceholder"
        :width="240"
      />

      <span class="pg-badge" :data-color="loading ? 'yellow' : 'green'">
        {{ loading ? t.pending : t.result(page.total, requests) }}
      </span>
    </div>

    <!-- What the table's state resolves to on the wire: sorting, filtering and paging are
        nothing but query parameters once the row models stop running. -->
    <code class="pg-code" style="display: block; align-self: stretch; padding: 10px 12px; overflow-wrap: anywhere">{{ queryLine }}</code>

    <DataTable
      :labels="labels"
      :table="table as any"
      striped
      style="flex: 1; min-height: 0"
      tabular-nums
      :loading="loading"
    />

    <span style="color: var(--pg-dimmed); font-size: 12px">{{ t.footnote(dataset.length) }}</span>
  </div>
</template>
