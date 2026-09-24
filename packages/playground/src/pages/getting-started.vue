<script setup lang="ts">
import { createColumnHelper, DataTable } from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";

const people = makePeople();

const helper = createColumnHelper<Person>();

const columns = [
  helper.accessor("firstName", { header: "First name" }),
  helper.accessor("lastName", { header: "Last name" }),
  helper.accessor("email", { header: "Email" }),
  helper.accessor("age", { header: "Age", meta: { align: "end" } }),
  helper.accessor("city", { header: "City" }),
  helper.accessor("department", { header: "Department" })
];
</script>

<template>
  <p class="pg-page-description">
    The smallest useful table: pass `data` and `columns`, get sorting, adaptive sizing, and a
    header you can click.
  </p>

  <section class="pg-demo">
    <div class="pg-table-wrap">
      <DataTable
        :data="people"
        :columns="columns"
        with-table-border
        striped
        highlight-on-hover
      />
    </div>
  </section>
</template>
