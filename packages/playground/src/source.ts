/**
 * The code behind each demo, for the "view source" drawer. Vite inlines the raw text at build
 * time, so nothing is fetched at runtime and the playground stays a static site. Same one-level
 * relative-import resolution as the React edition's source.ts — a demo that reads `makePeople`
 * from `../data` is not reproducible from its own file alone.
 */
const modules = import.meta.glob(["./demos/**/*.vue", "./demos/**/*.ts", "./data.ts", "./i18n.ts"], {
  eager: true,
  import: "default",
  query: "?raw"
}) as Record<string, string>;

export interface SourceFile {
  fileName: string;
  code: string;
}

const RELATIVE_IMPORT = /from "(?<specifier>\.[^"]*)"/g;

function resolveSource(entry: string, specifier: string): SourceFile | undefined {
  const { pathname } = new URL(specifier, `file:///${entry.replace("./", "")}`);

  for (const extension of [".ts", ".vue"]) {
    const key = `.${pathname}${extension}`;
    const code = modules[key];

    if (code !== undefined) {
      return { fileName: key.replace("./", ""), code };
    }
  }

  return undefined;
}

export function demoSources(id: string): SourceFile[] {
  const entry = `./demos/${id}.vue`;
  const code = modules[entry];

  if (code === undefined) {
    return [];
  }

  const files: SourceFile[] = [{ fileName: `${id}.vue`, code }];
  const seen = new Set([`${id}.vue`]);

  for (const match of code.matchAll(RELATIVE_IMPORT)) {
    const specifier = match.groups?.specifier;
    const file = specifier === undefined ? undefined : resolveSource(entry, specifier);

    if (file === undefined || seen.has(file.fileName)) {
      continue;
    }

    seen.add(file.fileName);
    files.push(file);
  }

  return files;
}
