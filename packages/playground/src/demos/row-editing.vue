<script setup lang="ts">
import type { ColumnDef, DataTableRowEditCommit, Row, TableInstance, VueContent } from "@jujiuyey/ledger-vue";

import type { Person } from "../data";

import { createColumnHelper, DataTable, numberEditor, selectEditor, textEditor } from "@jujiuyey/ledger-vue";
import { computed, h, ref, watch } from "vue";

import { makePeople, roleOptions } from "../data";
import { useCopy, useLang, useLangLabels } from "../i18n";

/**
 * Row mode: any editable cell opens the whole row, Enter/Escape commit or cancel it
 * atomically, and the actions column drives the same controller through `meta.ledger` — no
 * imperative handle needed.
 */
const copy = {
  en: {
    name: "Name",
    role: "Role",
    age: "Age",
    email: "Email",
    status: "Status (read-only)",
    actions: "Actions",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    nameRequired: "Name cannot be empty",
    ageRange: "Age must be between 16 and 70",
    emailInvalid: "That is not an email address",
    lastCommit: "Last row commit:",
    noCommit: "nothing yet",
    hint: "The commit is delayed 600ms to mimic a server. Focus the table, then ↑/↓ move the current row and F2 starts editing; Enter commits the row, Escape cancels it, Tab moves between editors; clicking another row commits this one first.",
    committed: (name: string, changes: string) => `${name} (${changes})`
  },
  zh: {
    name: "姓名",
    role: "角色",
    age: "年龄",
    email: "邮箱",
    status: "状态（只读）",
    actions: "操作",
    save: "保存",
    cancel: "取消",
    edit: "编辑",
    nameRequired: "姓名不能为空",
    ageRange: "年龄需在 16–70 之间",
    emailInvalid: "邮箱格式不正确",
    lastCommit: "最近一次整行提交：",
    noCommit: "尚无提交",
    hint: "模拟服务端 600ms 延迟。聚焦表格后 ↑/↓ 移动活动行、F2 进入编辑；Enter 提交整行、Escape 取消、Tab 在编辑器间移动；点击另一行会先提交当前行。",
    committed: (name: string, changes: string) => `${name}（${changes}）`
  }
};

// The React edition's status cell renders the shared `StatusBadge` from its columns demo; the
// Vue playground does not ship that demo, so the badge is inlined here with its own copy block
// (verbatim from the source it came from).
const statusCopy = {
  en: {
    statuses: {
      active: "Active",
      invited: "Invited",
      suspended: "Suspended"
    }
  },
  zh: {
    statuses: {
      active: "活跃",
      invited: "已邀请",
      suspended: "已停用"
    }
  }
};

/* Mantine's Badge palette, mapped onto the playground's plain-CSS badge colors (app.css) —
   the palette has no teal swatch, so active takes green. */
const statusColor: Record<Person["status"], string> = {
  active: "green",
  invited: "blue",
  suspended: "red"
};

const helper = createColumnHelper<Person>();

const t = useCopy(copy);
const statusT = useCopy(statusCopy);
const { lang } = useLang();
const labels = useLangLabels();

const data = ref<Person[]>(makePeople(lang.value, 20));
const lastCommit = ref<string | null>(null);

// The roster is generated per language, so the switch starts it over.
watch(lang, () => {
  data.value = makePeople(lang.value, 20);
  lastCommit.value = null;
});

// The React edition renders this as a `RowActions` component; a render function over the same
// `meta.ledger` surface is the Vue equivalent. The body re-renders on every editing-slice
// change, so the reads below stay as fresh as the React ones.
function renderRowActions(row: Row<Person>, table: TableInstance<Person>): VueContent {
  const editing = table.options.meta?.ledger?.editing;

  if (!editing) {
    return null;
  }

  // The buttons must not make the row current on their way — the React edition stops
  // propagation on the wrapping Group.
  const stop = (event: MouseEvent) => event.stopPropagation();

  if (editing.row.id === row.id) {
    return h("div", { class: "pg-row", style: { flexWrap: "nowrap", gap: "4px" }, onClick: stop }, [
      h("button", { type: "button", class: "pg-button", onClick: () => editing.row.stop({ commit: true }) }, t.value.save),
      h("button", { type: "button", class: "pg-button", onClick: () => editing.row.stop({ commit: false }) }, t.value.cancel)
    ]);
  }

  return h("div", { class: "pg-row", style: { flexWrap: "nowrap", gap: "4px" }, onClick: stop }, [
    h("button", { type: "button", class: "pg-button", onClick: () => editing.row.start(row.id, { focusColumnId: "name" }) }, t.value.edit)
  ]);
}

const columns = computed((): Array<ColumnDef<Person, any>> => [
  helper.accessor("name", {
    header: t.value.name,
    size: 130,
    meta: {
      edit: {
        render: textEditor(),
        validate: value => String(value).trim() === "" ? t.value.nameRequired : null
      }
    }
  }),
  helper.accessor("role", {
    header: t.value.role,
    size: 170,
    // The editor has to offer exactly the roles the data is drawn from, in this language.
    meta: { edit: selectEditor(roleOptions(lang.value)) }
  }),
  helper.accessor("age", {
    header: t.value.age,
    size: 110,
    meta: {
      align: "end",
      edit: {
        render: numberEditor(),
        validate: value => typeof value === "number" && value >= 16 && value <= 70 ? null : t.value.ageRange
      }
    }
  }),
  helper.accessor("email", {
    header: t.value.email,
    meta: {
      truncate: true,
      edit: {
        render: textEditor(),
        validate: value => String(value).includes("@") ? null : t.value.emailInvalid
      }
    }
  }),
  helper.accessor("status", {
    header: t.value.status,
    size: 140,
    cell: (context: { getValue: () => Person["status"] }) =>
      h("span", { class: "pg-badge", "data-color": statusColor[context.getValue()] }, statusT.value.statuses[context.getValue()])
  }),
  helper.display({
    id: "actions",
    header: t.value.actions,
    size: 130,
    // Contexts carry the core Table type; the runtime object is the adapter instance.
    cell: context => renderRowActions(context.row, context.table as TableInstance<Person>)
  })
]);

const handleRowEditCommit = async ({ row, values, previousValues }: DataTableRowEditCommit<Person>) => {
  await new Promise(resolve => {
    setTimeout(resolve, 600);
  });

  data.value = data.value.map(person => person.id === row.original.id
    ? { ...person, ...values }
    : person);

  const changes = Object.keys(values)
    .filter(key => !Object.is(values[key], previousValues[key]))
    .map(key => `${key}: ${String(previousValues[key])} → ${String(values[key])}`);
  lastCommit.value = t.value.committed(row.original.name, changes.join(", "));
};
</script>

<template>
  <div class="pg-stack" style="flex: 1; min-height: 0">
    <span style="color: var(--pg-dimmed); font-size: 12px">
      {{ t.lastCommit }}<code class="pg-code">{{ lastCommit ?? t.noCommit }}</code> {{ t.hint }}
    </span>

    <DataTable
      :labels="labels"
      :columns="columns"
      :data="data"
      edit-mode="row"
      enable-active-row
      style="flex: 1; min-height: 0"
      :get-row-id="person => person.id"
      :on-row-edit-commit="handleRowEditCommit"
    />
  </div>
</template>
