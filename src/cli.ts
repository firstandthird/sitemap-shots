#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseCliArgs, getHelpText } from "./args";
import { captureScreenshots } from "./capture";
import { resolveUrlsFromCrawl } from "./crawler";
import { exportContent } from "./markdown";
import { buildOutputPreview, buildScreenshotTargets } from "./output";
import { resolveUrlsFromInput } from "./sitemap";
import type { ContentExportSummary, MetaMode } from "./types";

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

    const contentSummary = shouldProcessContent(options.markdown, options.meta)
      ? await exportContent(targets, {
          generateMarkdown: shouldGenerateMarkdown(options.markdown),
          metaMode: options.meta,
          embedMetaFrontmatter: shouldEmbedMetaFrontmatter(options.markdown, options.meta),
        })
      : emptyContentSummary(targets.length);
    const captureSummary = shouldCaptureScreenshots(options.markdown)
      ? await captureScreenshots(targets)
      : null;

    console.log("");
    if (captureSummary) {
      console.log(`Captured ${captureSummary.successes} of ${captureSummary.totalPages} page(s).`);
    }
    if (shouldGenerateMarkdown(options.markdown)) {
      console.log(`Generated markdown for ${contentSummary.markdownSuccesses} of ${contentSummary.totalPages} page(s).`);
    }
    if (options.meta === "json") {
      console.log(`Generated metadata JSON for ${contentSummary.metaJsonSuccesses} of ${contentSummary.totalPages} page(s).`);
    }

    if (captureSummary?.failures.length) {
      console.log("Screenshot failures:");
      for (const failure of captureSummary.failures) {
        console.log(`- ${failure.url}`);
        console.log(`  ${failure.error}`);
      }
      process.exitCode = 1;
    }

    if (contentSummary.markdownFailures.length > 0) {
      console.log("Markdown failures:");
      for (const failure of contentSummary.markdownFailures) {
        console.log(`- ${failure.url}`);
        console.log(`  ${failure.error}`);
      }
      process.exitCode = 1;
    }

    if (contentSummary.metaJsonFailures.length > 0) {
      console.log("Metadata JSON failures:");
      for (const failure of contentSummary.metaJsonFailures) {
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
    const answer = await rl.question("Start processing pages? [y/N] ");
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

function shouldGenerateMarkdown(markdownMode: "false" | "true" | "only"): boolean {
  return markdownMode === "true" || markdownMode === "only";
}

function shouldCaptureScreenshots(markdownMode: "false" | "true" | "only"): boolean {
  return markdownMode !== "only";
}

function shouldProcessContent(markdownMode: "false" | "true" | "only", metaMode: MetaMode): boolean {
  return shouldGenerateMarkdown(markdownMode) || metaMode === "json";
}

function shouldEmbedMetaFrontmatter(markdownMode: "false" | "true" | "only", metaMode: MetaMode): boolean {
  return shouldGenerateMarkdown(markdownMode) && metaMode === "md";
}

function emptyContentSummary(totalPages: number): ContentExportSummary {
  return {
    totalPages,
    markdownSuccesses: 0,
    markdownFailures: [],
    metaJsonSuccesses: 0,
    metaJsonFailures: [],
  };
}

void main();
