#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { parseCliArgs, getHelpText } from "./args";
import { captureScreenshots } from "./capture";
import { crawlSiteGraph } from "./crawler";
import { buildGraphReport, writeGraphArtifacts } from "./graph";
import { exportContent } from "./markdown";
import { buildOutputPreview, buildScreenshotTargets } from "./output";
import { resolveUrlsFromInput } from "./sitemap";
import type { ContentExportSummary, CrawlGraphResult, GraphReport, MetaMode } from "./types";

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));

    if (options.help) {
      console.log(getHelpText());
      return;
    }

    const resolution = await resolveInput(options);
    const urls = resolution.urls;
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

    if (resolution.graphReport) {
      await writeGraphArtifacts(targets, resolution.graphReport);
      console.log("Generated site graph files.");
    }

    const contentSummary = shouldProcessContent(options.markdown, options.meta)
      ? await exportContent(targets, {
          generateMarkdown: shouldGenerateMarkdown(options.markdown),
          metaMode: options.meta,
          embedMetaFrontmatter: shouldEmbedMetaFrontmatter(options.markdown, options.meta),
        })
      : emptyContentSummary(targets.length);
    const captureSummary = shouldCaptureScreenshots(options.shots)
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
    if (resolution.graphReport) {
      console.log(`Generated site graph for ${resolution.graphReport.totalReachablePages} reachable page(s).`);
      if (typeof resolution.graphReport.totalOrphanedPages === "number") {
        console.log(`Detected ${resolution.graphReport.totalOrphanedPages} orphaned sitemap page(s).`);
      }
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

async function resolveInput(
  options: {
    sitemap?: string;
    url?: string;
    crawl?: string;
    max?: number;
    depth?: number;
  },
): Promise<{ urls: string[]; graphReport: GraphReport | null }> {
  if (options.url) {
    return {
      urls: [new URL(options.url).toString()],
      graphReport: null,
    };
  }

  if (options.crawl) {
    const depthLimit = options.depth ?? 4;
    const crawlResult = await crawlSiteGraph(options.crawl, options.max, depthLimit);
    const graphReport = await buildCrawlGraphReport(crawlResult, options.sitemap, depthLimit, options.max);

    return {
      urls: crawlResult.discoveredUrls,
      graphReport,
    };
  }

  if (!options.sitemap) {
    throw new Error("Provide one of --sitemap, --url, or --crawl.");
  }

  return {
    urls: await resolveUrlsFromInput(options.sitemap, options.max),
    graphReport: null,
  };
}

async function buildCrawlGraphReport(
  crawlResult: CrawlGraphResult,
  sitemapInput?: string,
  depthLimit = 4,
  max?: number,
): Promise<GraphReport> {
  let sitemapUrls: string[] | undefined;
  let sitemapSource: "explicit" | "auto" | "none" = "none";
  let sitemapReference: string | undefined;

  if (sitemapInput) {
    sitemapUrls = await resolveUrlsFromInput(sitemapInput);
    sitemapSource = "explicit";
    sitemapReference = sitemapInput;
  } else {
    const autoSitemapUrl = tryBuildAutoSitemapUrl(crawlResult.seedUrl);
    if (autoSitemapUrl) {
      try {
        sitemapUrls = await resolveUrlsFromInput(autoSitemapUrl);
        sitemapSource = "auto";
        sitemapReference = autoSitemapUrl;
      } catch (error) {
        console.warn(`Info: unable to use auto sitemap ${autoSitemapUrl}`);
        console.warn(`  ${toErrorMessage(error)}`);
      }
    }
  }

  return buildGraphReport(crawlResult, {
    depthLimit,
    max,
    sitemapUrls,
    sitemapReference,
    sitemapSource,
  });
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

function shouldGenerateMarkdown(markdownMode: "false" | "true"): boolean {
  return markdownMode === "true";
}

function shouldCaptureScreenshots(shotsMode: "false" | "true"): boolean {
  return shotsMode === "true";
}

function shouldProcessContent(markdownMode: "false" | "true", metaMode: MetaMode): boolean {
  return shouldGenerateMarkdown(markdownMode) || metaMode === "json";
}

function shouldEmbedMetaFrontmatter(markdownMode: "false" | "true", metaMode: MetaMode): boolean {
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

function tryBuildAutoSitemapUrl(seedUrl: string): string | undefined {
  try {
    const url = new URL(seedUrl);
    url.pathname = "/sitemap.xml";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

void main();
