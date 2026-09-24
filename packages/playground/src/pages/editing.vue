<script setup lang="ts">
import { computed, h, ref } from "vue";

import {
  checkboxEditor,
  createColumnHelper,
  DataTable,
  numberEditor,
  selectEditor,
  textEditor,
  useDataTable
} from "@coldsmirk/ledger-vue";
import type {
  DataTableEditCommit,
  DataTableEditTrigger,
  DataTableRowEditCommit
} from "@coldsmirk/ledger-vue";

import type { Person } from "../data";
import { makePeople } from "../data";
import { lang, t } from "../i18n";

const hint = computed(() => t.value(`page.editing.hint-${lang.value === "en" ? "en" : "zh"}`));

const enCopy = {
  cellCaption: "Cell mode: four editors, one instant column, validation on the name",
  trigger: "Edit trigger",
  doubleClick: "Double-click",
  click: "Single click",
  lastCommit: "Last commit",
  noCommit: "nothing yet",
  rowCaption: "Row mode: the whole row opens and commits atomically (editMode \"row\")",
  lastRowCommit: "Last row commit",
  actions: "Actions",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  nameRequired: "Name cannot be empty",
  ageRange: "Age must be between 16 and 70",
  emailInvalid: "That is not an email address",
  columns: {
    id: "ID",
    firstName: "Name",
    age: "Age",
    department: "Department",
    active: "Active (commits on click)",
    email: "Email"
  },
  cellNote: "Enter commits, Escape cancels, Tab moves to the next editor, F2 starts editing from the keyboard. The commit fakes a 400ms server round-trip; empty the name to see validation block it. Switching the trigger remounts the table (editTrigger is a mount-time option).",
  rowNote: "The commit fakes a 500ms server round-trip. Enter commits the row, Escape cancels it, Tab moves between editors; starting another row commits this one first."
};
const zhCopy: typeof enCopy = {
  cellCaption: "单元格模式：四种编辑器，一个即时提交列，名称带校验",
  trigger: "编辑触发方式",
  doubleClick: "双击",
  click: "单击",
  lastCommit: "最近一次提交",
  noCommit: "尚无提交",
  rowCaption: "整行模式：整行打开、原子提交（editMode \"row\"）",
  lastRowCommit: "最近一次整行提交",
  actions: "操作",
  save: "保存",
  cancel: "取消",
  edit: "编辑",
  nameRequired: "姓名不能为空",
  ageRange: "年龄需在 16–70 之间",
  emailInvalid: "邮箱格式不正确",
  columns: {
    id: "ID",
    firstName: "姓名",
    age: "年龄",
    department: "部门",
    active: "激活（点击即提交）",
    email: "邮箱"
  },
  cellNote: "Enter 提交、Escape 取消、Tab 移动到下一个编辑器、F2 从键盘开始编辑。提交模拟 400ms 服务端延迟；把姓名清空可看到校验拦截。切换触发方式会重挂载表格（editTrigger 是挂载期选项）。",
  rowNote: "提交模拟 500ms 服务端延迟。Enter 提交整行、Escape 取消、Tab 在编辑器间移动；开始编辑另一行会先提交当前行。"
};
const copy = computed(() => (lang.value === "en" ? enCopy : zhCopy));

const helper = createColumnHelper<Person>();

const DEPARTMENTS = ["engineering", "design", "sales", "support"];

const delay = (ms: number) => new Promise<void>(resolve => {
  setTimeout(resolve, ms);
});

/* ---- 1. cell mode (sugar mode; the trigger switcher remounts the table) ---- */

const people = ref(makePeople(24));
const trigger = ref<DataTableEditTrigger>("double-click");
const TRIGGERS: DataTableEditTrigger[] = ["double-click", "click"];
const lastCellCommit = ref<string | null>(null);

const cellColumns = computed(() => [
  helper.accessor("id", { header: copy.value.columns.id, size: 90 }),
  helper.accessor("firstName", {
    header: copy.value.columns.firstName,
    size: 150,
    meta: {
      edit: {
        render: textEditor(),
        validate: value => String(value).trim() === "" ? copy.value.nameRequired : null
      }
    }
  }),
  helper.accessor("age", {
    header: copy.value.columns.age,
    size: 110,
    meta: { align: "end", edit: numberEditor() }
  }),
  helper.accessor("department", {
    header: copy.value.columns.department,
    size: 150,
    meta: { edit: selectEditor(DEPARTMENTS) }
  }),
  helper.accessor("active", {
    header: copy.value.columns.active,
    size: 190,
    meta: { align: "center", edit: { instant: checkboxEditor() } }
  }),
  helper.accessor("email", {
    header: copy.value.columns.email,
    minSize: 200,
    meta: { truncate: true }
  })
]);

const handleCellCommit = async (change: DataTableEditCommit<Person>) => {
  await delay(400);

  const id = change.row.original.id;

  people.value = people.value.map(person => person.id === id
    ? { ...person, [change.column.id]: change.value }
    : person);

  lastCellCommit.value = `${id}.${change.column.id}: ${String(change.previousValue)} → ${String(change.value)}`;
};

/* ---- 2. row mode (hook mode) ---- */

const team = ref(makePeople(16).map((person, index) => ({ ...person, id: `t-${index + 1}` })));
const lastRowCommit = ref<string | null>(null);

const rowColumns = computed(() => [
  helper.accessor("firstName", {
    header: copy.value.columns.firstName,
    size: 140,
    meta: {
      edit: {
        render: textEditor(),
        validate: value => String(value).trim() === "" ? copy.value.nameRequired : null
      }
    }
  }),
  helper.accessor("department", {
    header: copy.value.columns.department,
    size: 150,
    meta: { edit: selectEditor(DEPARTMENTS) }
  }),
  helper.accessor("age", {
    header: copy.value.columns.age,
    size: 110,
    meta: {
      align: "end",
      edit: {
        render: numberEditor(),
        validate: value => typeof value === "number" && value >= 16 && value <= 70 ? null : copy.value.ageRange
      }
    }
  }),
  helper.accessor("email", {
    header: copy.value.columns.email,
    minSize: 220,
    meta: {
      truncate: true,
      edit: {
        render: textEditor(),
        validate: value => String(value).includes("@") ? null : copy.value.emailInvalid
      }
    }
  }),
  helper.display({
    id: "actions",
    header: copy.value.actions,
    size: 150,
    cell: ({ row, table }) => {
      const controller = table.options.meta?.ledger?.editing;

      if (!controller) {
        return null;
      }

      const rowSession = controller.row;

      if (rowSession.active(row.id)) {
        return h("div", { class: "pg-row-actions" }, [
          h("button", {
            class: "pg-mini-btn",
            type: "button",
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              rowSession.stop({ commit: true });
            }
          }, copy.value.save),
          h("button", {
            class: "pg-mini-btn",
            type: "button",
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              rowSession.stop({ commit: false });
            }
          }, copy.value.cancel)
        ]);
      }

      return h("div", { class: "pg-row-actions" }, [
        h("button", {
          class: "pg-mini-btn",
          type: "button",
          onClick: (event: MouseEvent) => {
            event.stopPropagation();
            rowSession.start(row.id, { focusColumnId: "firstName" });
          }
        }, copy.value.edit)
      ]);
    }
  })
]);

const handleRowCommit = async ({ row, values, previousValues }: DataTableRowEditCommit<Person>) => {
  await delay(500);

  team.value = team.value.map(person => person.id === row.original.id
    ? { ...person, ...values }
    : person);

  const changes = Object.keys(values)
    .filter(key => !Object.is(values[key], previousValues[key]))
    .map(key => `${key}: ${String(previousValues[key])} → ${String(values[key])}`);

  lastRowCommit.value = `${row.original.id} (${changes.join(", ")})`;
};

const rowTable = useDataTable({
  data: team,
  columns: rowColumns,
  getRowId: person => person.id,
  editMode: "row",
  enableActiveRow: true,
  onRowEditCommit: handleRowCommit
});
</script>

<template>
  <p class="pg-page-description">{{ hint }}</p>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.cellCaption }}</p>

    <div class="pg-toolbar">
      <span class="pg-note" style="margin: 0">{{ copy.trigger }}:</span>
      <button
        v-for="candidate in TRIGGERS"
        :key="candidate"
        class="pg-mini-btn"
        :data-active="candidate === trigger || undefined"
        type="button"
        @click="trigger = candidate"
      >
        {{ candidate === "double-click" ? copy.doubleClick : copy.click }}
      </button>
      <span class="pg-note" style="margin: 0">
        {{ copy.lastCommit }}:
        <strong>{{ lastCellCommit ?? copy.noCommit }}</strong>
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable
        :key="trigger"
        :data="people"
        :columns="cellColumns"
        :get-row-id="person => person.id"
        :edit-trigger="trigger"
        :on-edit-commit="handleCellCommit"
        with-table-border
        highlight-on-hover
        tabular-nums
      />
    </div>

    <p class="pg-note">{{ copy.cellNote }}</p>
  </section>

  <section class="pg-demo">
    <p class="pg-demo-caption">{{ copy.rowCaption }}</p>

    <div class="pg-toolbar">
      <span class="pg-note" style="margin: 0">
        {{ copy.lastRowCommit }}:
        <strong>{{ lastRowCommit ?? copy.noCommit }}</strong>
      </span>
    </div>

    <div class="pg-table-wrap">
      <DataTable :table="rowTable" with-table-border highlight-on-hover tabular-nums />
    </div>

    <p class="pg-note">{{ copy.rowNote }}</p>
  </section>
</template>

<style>
.pg-row-actions {
  display: flex;
  gap: 6px;
}

.pg-mini-btn {
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--pg-text);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--pg-border);
  border-radius: 6px;
}

.pg-mini-btn:hover {
  background: rgb(127 127 127 / 12%);
}

.pg-mini-btn[data-active] {
  color: var(--pg-accent);
  background: color-mix(in srgb, var(--pg-accent) 18%, transparent);
  border-color: var(--pg-accent);
}
</style>
