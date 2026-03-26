#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseCliArgs, getHelpText } from "./args";
import { captureScreenshots } from "./capture";
import { resolveUrlsFromCrawl } from "./crawler";
import { buildOutputPreview, buildScreenshotTargets } from "./output";
import { resolveUrlsFromInput } from "./sitemap";

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));

    if (options.help) {
      console.log(getHelpText());
      return;
    }

    const urls = await resolveInputUrls(options.sitemap, options.url, options.crawl, options.max, options.depth);
    if (urls.length === 0) {
      throw new Error("No URLs found to capture.");
    }

    printUrls(urls);

    const targets = buildScreenshotTargets(urls, options.output);
    console.log("");
    console.log("Output directories:");
    console.log(buildOutputPreview(targets));
    console.log("");

    const confirmed = options.yes ? true : await promptToContinue();
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }

    const summary = await captureScreenshots(targets);

    console.log("");
    console.log(`Captured ${summary.successes} of ${summary.totalPages} page(s).`);

    if (summary.failures.length > 0) {
      console.log("Failures:");
      for (const failure of summary.failures) {
        console.log(`- ${failure.url}`);
        console.log(`  ${failure.error}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(toErrorMessage(error));
    console.error("");
    console.error(getHelpText());
    process.exitCode = 1;
  }
}

async function resolveInputUrls(
  sitemap: string | undefined,
  url: string | undefined,
  crawl: string | undefined,
  max?: number,
  depth?: number,
): Promise<string[]> {
  if (url) {
    return [new URL(url).toString()];
  }

  if (crawl) {
    return resolveUrlsFromCrawl(crawl, max, depth ?? 2);
  }

  if (!sitemap) {
    throw new Error("Provide one of --sitemap, --url, or --crawl.");
  }

  return resolveUrlsFromInput(sitemap, max);
}

function printUrls(urls: string[]): void {
  console.log("Resolved URLs:");
  urls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
  });
}

async function promptToContinue(): Promise<boolean> {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question("Start taking screenshots? [y/N] ");
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

void main();
