import { mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

const SHOTS_DIR = fileURLToPath(new URL("shots", import.meta.url));
const CONFIG_FILE = fileURLToPath(new URL("vite.config.ts", import.meta.url));

interface ShotVariant {
  readonly suffix: string;
  readonly scheme: "light" | "dark";
  readonly compare: boolean;
  readonly theme: string;
}

interface ScenarioRef {
  readonly preview: string;
  readonly scenario: string;
}

/** Four passes: light and dark with LTR beside RTL, plus one shot per extra palette. */
const VARIANTS: readonly ShotVariant[] = [
  { suffix: "light", scheme: "light", compare: true, theme: "q9" },
  { suffix: "dark", scheme: "dark", compare: true, theme: "q9" },
  { suffix: "recruiter", scheme: "light", compare: false, theme: "recruiter" },
  { suffix: "kaadr", scheme: "dark", compare: false, theme: "kaadr" },
];

function localUrl(server: ViteDevServer): string {
  const url = server.resolvedUrls?.local[0];
  if (url === undefined) {
    throw new Error("preview: vite did not report a local URL");
  }
  return url;
}

function shotQuery(entry: ScenarioRef, variant: ShotVariant): string {
  return new URLSearchParams({
    preview: entry.preview,
    scenario: entry.scenario,
    scheme: variant.scheme,
    theme: variant.theme,
    compare: variant.compare ? "1" : "0",
    dir: variant.compare ? "ltr" : "rtl",
    locale: variant.compare ? "en" : "ar",
    width: "0",
    role: "owner",
  }).toString();
}

function shotPath(entry: ScenarioRef, variant: ShotVariant): string {
  return `${SHOTS_DIR}/${entry.preview}--${entry.scenario}--${variant.suffix}.png`;
}

async function readScenarios(page: Page, url: string): Promise<readonly ScenarioRef[]> {
  await page.goto(url, { waitUntil: "networkidle" });
  const scenarios = await page.$$eval("[data-scenario-id]", (nodes) =>
    nodes.map((node) => ({
      preview: node.getAttribute("data-preview-id") ?? "",
      scenario: node.getAttribute("data-scenario-id") ?? "",
    })),
  );
  if (scenarios.length === 0) {
    throw new Error("preview: no scenarios found in the gallery nav");
  }
  return scenarios;
}

async function captureShot(
  page: Page,
  url: string,
  entry: ScenarioRef,
  variant: ShotVariant,
): Promise<void> {
  await page.goto(`${url}?${shotQuery(entry, variant)}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: shotPath(entry, variant), fullPage: true });
}

async function captureShots(
  page: Page,
  url: string,
  scenarios: readonly ScenarioRef[],
): Promise<number> {
  const shots = scenarios.flatMap((entry) => VARIANTS.map((variant) => ({ entry, variant })));
  for (const shot of shots) {
    // oxlint-disable-next-line no-await-in-loop -- one browser page renders one shot at a time
    await captureShot(page, url, shot.entry, shot.variant);
  }
  return shots.length;
}

async function main(): Promise<void> {
  await rm(SHOTS_DIR, { recursive: true, force: true });
  await mkdir(SHOTS_DIR, { recursive: true });

  const server = await createServer({ configFile: CONFIG_FILE, server: { port: 5312 } });
  await server.listen();
  try {
    const url = localUrl(server);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const scenarios = await readScenarios(page, url);
      const count = await captureShots(page, url, scenarios);
      process.stdout.write(`wrote ${count} screenshots to preview/shots\n`);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

await main();
