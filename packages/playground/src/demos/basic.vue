<script setup lang="ts">
import type { ColumnDef } from "@jujiuyey/ledger-vue";
import { DataTable } from "@jujiuyey/ledger-vue";
import { computed } from "vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

const copy = {
  en: {
    name: "Name",
    summary: "Role / Email",
    role: "Role",
    email: "Email",
    age: "Age",
    joinedAt: "Joined"
  },
  zh: {
    name: "姓名",
    summary: "角色 / 邮箱",
    role: "角色",
    email: "邮箱",
    age: "年龄",
    joinedAt: "入职日期"
  }
};

/* The smallest useful table: raw TanStack column defs + data; everything else is defaults. */
const t = useCopy(copy);
const { lang } = useLang();
const labels = useLangLabels();

const data = computed(() => makePeople(lang.value, 30));

const columns = computed((): Array<ColumnDef<Person, any>> => [
  {
    accessorKey: "name",
    header: t.value.name,
    minSize: 120
  },
  {
    // The classic responsive pair: below md one column carries the summary, and from md up it
    // steps aside for the real columns. `hiddenFrom` / `visibleFrom` are Box vocabulary, and
    // the column is removed from the table rather than merely hidden with CSS.
    id: "summary",
    accessorFn: person => `${person.role} · ${person.email}`,
    header: t.value.summary,
    minSize: 200,
    enableSorting: false,
    meta: {
      hiddenFrom: "md",
      truncate: true
    }
  },
  {
    accessorKey: "role",
    header: t.value.role,
    size: 140,
    meta: { visibleFrom: "md" }
  },
  {
    accessorKey: "email",
    header: t.value.email,
    minSize: 200,
    meta: {
      visibleFrom: "md",
      truncate: true
    }
  },
  {
    accessorKey: "age",
    header: t.value.age,
    size: 100,
    meta: { align: "end" }
  },
  {
    accessorKey: "joinedAt",
    header: t.value.joinedAt,
    size: 140
  }
]);
</script>

<template>
  <DataTable
    :labels="labels"
    highlight-on-hover
    :columns="columns"
    :data="data"
    :default-sorting="[{ id: 'joinedAt', desc: true }]"
    style="flex: 1; min-height: 0"
    :get-row-id="person => person.id"
  />
</template>
