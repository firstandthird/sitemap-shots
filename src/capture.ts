import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, devices, type BrowserContext } from "playwright";

import type { CaptureFailure, CaptureSummary, ScreenshotTarget } from "./types";

const DESKTOP_VIEWPORT = {
  width: 1440,
  height: 900,
};

export async function captureScreenshots(targets: ScreenshotTarget[]): Promise<CaptureSummary> {
  await ensureDirectories(targets);

  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({
    viewport: DESKTOP_VIEWPORT,
  });
  const mobileContext = await browser.newContext({
    ...devices["iPhone 13"],
  });
  const failures: CaptureFailure[] = [];
  let successes = 0;

  try {
    for (const target of targets) {
      console.log(`Capturing ${target.url.toString()}`);

      try {
        await capturePage(desktopContext, target.url.toString(), target.desktopPath);
        await capturePage(mobileContext, target.url.toString(), target.mobilePath);
        successes += 1;
      } catch (error) {
        failures.push({
          url: target.url.toString(),
          error: toErrorMessage(error),
        });
      }
    }
  } finally {
    await Promise.allSettled([desktopContext.close(), mobileContext.close()]);
    await browser.close();
  }

  return {
    totalPages: targets.length,
    successes,
    failures,
  };
}

async function capturePage(context: BrowserContext, url: string, outputPath: string): Promise<void> {
  const page = await context.newPage();

  try {
    await page.goto(url, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await waitForPageReadiness(page);
    await page.screenshot({
      path: outputPath,
      fullPage: true,
      scale: "css",
      type: "jpeg",
      quality: 85,
    });
  } finally {
    await page.close();
  }
}

async function waitForPageReadiness(page: Awaited<ReturnType<BrowserContext["newPage"]>>): Promise<void> {
  await page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }
  });
  await scrollPage(page);
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }

            const finish = () => resolve();
            image.addEventListener("load", finish, { once: true });
            image.addEventListener("error", finish, { once: true });
            window.setTimeout(finish, 10_000);
          }),
      ),
    );
  });
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  });
}

async function scrollPage(page: Awaited<ReturnType<BrowserContext["newPage"]>>): Promise<void> {
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const viewportHeight = window.innerHeight || 800;
    const maxScrollTop = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );

    for (let position = 0; position < maxScrollTop; position += Math.max(200, Math.floor(viewportHeight * 0.75))) {
      window.scrollTo({ top: position, behavior: "instant" });
      await delay(150);
    }

    window.scrollTo({ top: maxScrollTop, behavior: "instant" });
    await delay(250);
  });
}

async function ensureDirectories(targets: ScreenshotTarget[]): Promise<void> {
  const directories = new Set<string>();

  for (const target of targets) {
    directories.add(path.dirname(target.desktopPath));
    directories.add(path.dirname(target.mobilePath));
  }

  await Promise.all(Array.from(directories).map((directory) => mkdir(directory, { recursive: true })));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
