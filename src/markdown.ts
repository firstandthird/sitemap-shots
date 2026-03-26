import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

import type { ContentExportSummary, MetaMode, ScreenshotTarget } from "./types";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

type PageMetadata = {
  title: string;
  meta: Array<{
    name: string;
    value: string;
  }>;
};

type ParsedPage = {
  metadata: PageMetadata;
  markdown: string;
};

export async function exportContent(
  targets: ScreenshotTarget[],
  options: {
    generateMarkdown: boolean;
    metaMode: MetaMode;
    embedMetaFrontmatter: boolean;
  },
): Promise<ContentExportSummary> {
  await ensureDirectories(targets);

  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });
  const markdownFailures: ContentExportSummary["markdownFailures"] = [];
  const metaJsonFailures: ContentExportSummary["metaJsonFailures"] = [];
  let markdownSuccesses = 0;
  let metaJsonSuccesses = 0;

  for (const target of targets) {
    console.log(`Processing content for ${target.url.toString()}`);

    try {
      const parsedPage = await createParsedPage(target.url.toString(), turndown);

      if (options.generateMarkdown) {
        const markdown = options.embedMetaFrontmatter
          ? addYamlFrontmatter(parsedPage.markdown, parsedPage.metadata)
          : parsedPage.markdown;
        await writeFile(target.markdownPath, markdown, "utf8");
        markdownSuccesses += 1;
      }

      if (options.metaMode === "json") {
        await writeFile(target.metaJsonPath, `${JSON.stringify(parsedPage.metadata, null, 2)}\n`, "utf8");
        metaJsonSuccesses += 1;
      }
    } catch (error) {
      const failure = { url: target.url.toString(), error: toErrorMessage(error) };
      if (options.generateMarkdown) {
        markdownFailures.push(failure);
      }
      if (options.metaMode === "json") {
        metaJsonFailures.push(failure);
      }
    }
  }

  return {
    totalPages: targets.length,
    markdownSuccesses,
    markdownFailures,
    metaJsonSuccesses,
    metaJsonFailures,
  };
}

async function createParsedPage(url: string, turndown: TurndownService): Promise<ParsedPage> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "sitemap-shots/0.1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load page: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!HTML_CONTENT_TYPES.some((type) => contentType.includes(type))) {
    throw new Error(`Unsupported content type for markdown export: ${contentType || "unknown"}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;
  const article = new Readability(document).parse();
  const pageTitle = document.title.trim();
  const contentHtml = article?.content?.trim() || dom.window.document.body?.innerHTML?.trim();
  const title = pageTitle || article?.title?.trim();

  if (!contentHtml) {
    throw new Error("No readable content found on page.");
  }

  let markdown = turndown.turndown(contentHtml).trim();

  if (!markdown) {
    throw new Error("Markdown conversion produced no content.");
  }

  if (title && !markdown.startsWith("# ")) {
    markdown = `# ${title}\n\n${markdown}`;
  }

  return {
    metadata: {
      title: pageTitle || article?.title?.trim() || "",
      meta: extractMetaTags(document),
    },
    markdown: `${markdown}\n`,
  };
}

async function ensureDirectories(targets: ScreenshotTarget[]): Promise<void> {
  const directories = new Set<string>();

  for (const target of targets) {
    directories.add(path.dirname(target.markdownPath));
    directories.add(path.dirname(target.metaJsonPath));
  }

  await Promise.all(Array.from(directories).map((directory) => mkdir(directory, { recursive: true })));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function extractMetaTags(document: Document): PageMetadata["meta"] {
  const entries: PageMetadata["meta"] = [];

  for (const tag of Array.from(document.querySelectorAll("meta"))) {
    const name =
      tag.getAttribute("name")?.trim() ||
      tag.getAttribute("property")?.trim() ||
      tag.getAttribute("http-equiv")?.trim();
    const value = tag.getAttribute("content")?.trim();

    if (!name || !value) {
      continue;
    }

    entries.push({ name, value });
  }

  return entries;
}

function addYamlFrontmatter(markdown: string, metadata: PageMetadata): string {
  const lines = ["---", `title: ${toYamlString(metadata.title)}`, "meta:"];

  if (metadata.meta.length === 0) {
    lines.push("  []");
  } else {
    for (const entry of metadata.meta) {
      lines.push(`  - name: ${toYamlString(entry.name)}`);
      lines.push(`    value: ${toYamlString(entry.value)}`);
    }
  }

  lines.push("---", "");

  return `${lines.join("\n")}${markdown}`;
}

function toYamlString(value: string): string {
  return JSON.stringify(value);
}
