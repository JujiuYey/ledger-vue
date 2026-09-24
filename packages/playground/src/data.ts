/**
 * Shared demo dataset for the playground pages — deterministic, no faker dependency.
 */

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  age: number;
  city: string;
  department: "engineering" | "design" | "sales" | "support";
  salary: number;
  active: boolean;
  hiredAt: string;
  rating: number;
}

const FIRST = ["Ada", "Grace", "Linus", "Edsger", "Barbara", "Alan", "Margaret", "Donald", "Radia", "Ken", "Frances", "Tim", "Anita", "John", "Shafi", "Guido", "Lea", "James", "Barbara", "Bjarne"];
const LAST = ["Lovelace", "Hopper", "Torvalds", "Dijkstra", "Liskov", "Turing", "Hamilton", "Knuth", "Perlman", "Thompson", "Allen", "Berners-Lee", "Borg", "Backus", "Goldwasser", "van Rossum", "Piccolroaz", "Gosling", "Liskov", "Stroustrup"];
const CITIES = ["Berlin", "Tokyo", "Lisbon", "Austin", "Oslo", "Seoul", "Toronto", "Zurich", "Taipei", "Helsinki"];
const DEPARTMENTS = ["engineering", "design", "sales", "support"] as const;

function mulberry32(seed: number): () => number {
  let a = seed;

  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makePeople(count = 64): Person[] {
  const random = mulberry32(42);
  const people: Person[] = [];

  for (let index = 0; index < count; index += 1) {
    const first = FIRST[index % FIRST.length]!;
    const last = LAST[Math.floor(random() * LAST.length)]!;
    const year = 2012 + Math.floor(random() * 13);
    const month = 1 + Math.floor(random() * 12);
    const day = 1 + Math.floor(random() * 28);

    people.push({
      id: `p-${index + 1}`,
      firstName: first,
      lastName: last,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
      age: 22 + Math.floor(random() * 40),
      city: CITIES[Math.floor(random() * CITIES.length)]!,
      department: DEPARTMENTS[Math.floor(random() * DEPARTMENTS.length)]!,
      salary: 40_000 + Math.floor(random() * 120_000),
      active: random() > 0.25,
      hiredAt: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      rating: Math.round(random() * 50) / 10
    });
  }

  return people;
}

export interface TreeNode {
  id: string;
  name: string;
  size: number;
  kind: "folder" | "file";
  children?: TreeNode[];
}

export function makeTree(): TreeNode[] {
  return [
    {
      id: "src",
      kind: "folder",
      name: "src",
      size: 0,
      children: [
        { id: "src-index", kind: "file", name: "index.ts", size: 2_412 },
        { id: "src-app", kind: "file", name: "app.ts", size: 8_120 },
        {
          id: "src-components",
          kind: "folder",
          name: "components",
          size: 0,
          children: [
            { id: "src-components-table", kind: "file", name: "data-table.vue", size: 14_230 },
            { id: "src-components-header", kind: "file", name: "table-header.ts", size: 5_512 },
            { id: "src-components-body", kind: "file", name: "table-body.ts", size: 11_903 }
          ]
        }
      ]
    },
    {
      id: "tests",
      kind: "folder",
      name: "tests",
      size: 0,
      children: [
        { id: "tests-core", kind: "file", name: "core.test.ts", size: 4_811 },
        { id: "tests-editing", kind: "file", name: "editing.test.ts", size: 3_204 }
      ]
    },
    { id: "readme", kind: "file", name: "README.md", size: 1_024 },
    { id: "license", kind: "file", name: "LICENSE", size: 1_071 }
  ];
}
