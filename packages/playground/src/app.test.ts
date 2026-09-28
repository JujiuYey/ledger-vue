import { defineComponent, h, nextTick } from "vue";

import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import App from "./App.vue";
import { provideLanguage } from "./i18n";

const { DemoStub } = vi.hoisted(() => {
  return {
    DemoStub: { render: () => "Demo" }
  };
});

// The `__esModule: true` interop marker is required: without it defineAsyncComponent treats the
// mocked module proxy itself as the component instead of unwrapping `default`.
vi.mock("./demos/appearance.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/basic.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/column-virtualization.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/editing.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/grouped-headers.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/grouping.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/hook-toolbar.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/master-detail.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/menu-tree.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/orders.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/pinning.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/row-editing.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/row-ordering.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/selection.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/server-side.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/spanning.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/states.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/tree.vue", () => {
  return { __esModule: true, default: DemoStub };
});
vi.mock("./demos/virtualized.vue", () => {
  return { __esModule: true, default: DemoStub };
});

/* The React edition wrapped <App/> in MantineProvider + LanguageProvider. The Vue playground has
   no Mantine, and main.ts provides the language context from a Root component because provide()
   is visible to descendants only — mirror that exact shape (App.vue injects via useLang). */
function mountApp(): void {
  render(
    defineComponent({
      setup() {
        provideLanguage();

        return () => h(App);
      }
    })
  );
}

/* Demo pages load lazily (defineAsyncComponent) — a few ticks let the mocked dynamic imports
   resolve and land in the DOM before the assertions read around them. */
async function tick(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await nextTick();
  }
}

describe("playground navigation", () => {
  it("uses native buttons and closes the mobile navigation after selection", async () => {
    mountApp();
    await tick();

    const toggle = screen.getByRole("button", { name: "Toggle navigation" });
    const navigation = document.querySelector("#playground-navigation");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(navigation?.getAttribute("aria-hidden")).toBe("true");
    expect(navigation?.hasAttribute("inert")).toBe(true);

    fireEvent.click(toggle);
    await tick();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(navigation?.hasAttribute("aria-hidden")).toBe(false);
    expect(navigation?.hasAttribute("inert")).toBe(false);

    const appearance = screen.getByRole("button", { name: /Borders and density/ });
    expect(appearance.getAttribute("type")).toBe("button");
    expect(appearance.hasAttribute("aria-current")).toBe(false);

    fireEvent.click(appearance);
    await tick();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(navigation?.getAttribute("aria-hidden")).toBe("true");
    expect(navigation?.hasAttribute("inert")).toBe(true);
    expect(appearance.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("heading", { name: "Borders and density" })).toBeTruthy();
  });

  it("switches every visible string to the other language", async () => {
    mountApp();
    await tick();

    expect(screen.getByRole("heading", { name: "Basic table" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View source" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "中文" }));
    await tick();

    expect(screen.getByRole("heading", { name: "基础表格" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看源码" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
