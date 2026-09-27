import { spawnSync } from "node:child_process";

const run = (): void => {
  if (process.env["APP_ENV"] === "prod") {
    throw new Error("Refusing to run development seeds when APP_ENV=prod.");
  }

  const result = spawnSync("pnpm", ["exec", "convex", "run", "seed:run", "{}"], {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal !== null) {
    throw new Error(`Convex seed process terminated by ${result.signal}.`);
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
};

run();
