import { createApp, defineComponent, h } from "vue";

import App from "./App.vue";
import { provideLanguage } from "./i18n";

import "./app.css";

// The language provider wraps the shell as its own component — provide() is visible to
// DESCENDANTS only, so App.vue (which injects) must be a child, mirroring the React edition's
// <LanguageProvider><App/></LanguageProvider> structure.
const Root = defineComponent({
  setup() {
    provideLanguage();

    return () => h(App);
  }
});

createApp(Root).mount("#app");
