import { join, resolve } from "node:path";

type SuiteName =
  | "games:unit"
  | "games:e2e"
  | "wallets:unit"
  | "wallets:e2e"
  | "frontend";

interface TestTask {
  label: string;
  cwd: string;
  command: string[];
}

const rootDir = resolve(import.meta.dir, "..");
const mode = (process.argv[2] ?? "all") as SuiteName | "all";

const suites: Record<SuiteName, TestTask> = {
  "games:unit": {
    label: "games:unit",
    cwd: join(rootDir, "services", "games"),
    command: ["bun", "test", "tests/unit"],
  },
  "games:e2e": {
    label: "games:e2e",
    cwd: join(rootDir, "services", "games"),
    command: ["bun", "test", "tests/e2e"],
  },
  "wallets:unit": {
    label: "wallets:unit",
    cwd: join(rootDir, "services", "wallets"),
    command: ["bun", "test", "tests/unit"],
  },
  "wallets:e2e": {
    label: "wallets:e2e",
    cwd: join(rootDir, "services", "wallets"),
    command: ["bun", "test", "tests/e2e"],
  },
  frontend: {
    label: "frontend",
    cwd: join(rootDir, "frontend"),
    command: ["bun", "test"],
  },
};

const selectedSuites =
  mode === "all"
    ? (Object.values(suites) as TestTask[])
    : [suites[mode]];

if (!selectedSuites[0]) {
  console.error(`Unknown test suite: ${mode}`);
  process.exit(1);
}

console.log(
  `Running ${selectedSuites.length} test suite(s) in parallel: ${selectedSuites
    .map((suite) => suite.label)
    .join(", ")}`,
);

const results = await Promise.all(
  selectedSuites.map(async (suite) => {
    console.log(`\n[${suite.label}] ${suite.command.join(" ")} (cwd: ${suite.cwd})`);

    const proc = Bun.spawn(suite.command, {
      cwd: suite.cwd,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    });

    const exitCode = await proc.exited;
    return { exitCode, label: suite.label };
  }),
);

const failed = results.filter((result) => result.exitCode !== 0);

if (failed.length > 0) {
  console.error(
    `\n${failed.length} suite(s) failed: ${failed
      .map((result) => `${result.label} (exit ${result.exitCode})`)
      .join(", ")}`,
  );
  process.exit(1);
}
