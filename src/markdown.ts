import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

import type { MarkdownFailure, MarkdownSummary, ScreenshotTarget } from "./types";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

export async function exportMarkdown(targets: ScreenshotTarget[]): Promise<MarkdownSummary> {
  await ensureDirectories(targets);

  const turndown = new TurndownService({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });
  const failures: MarkdownFailure[] = [];
  let successes = 0;

  for (const target of targets) {
    console.log(`Generating markdown for ${target.url.toString()}`);

    try {
      const markdown = await createMarkdown(target.url.toString(), turndown);
      await writeFile(target.markdownPath, markdown, "utf8");
      successes += 1;
    } catch (error) {
      failures.push({
        url: target.url.toString(),
        error: toErrorMessage(error),
      });
    }
  }

  return {
    totalPages: targets.length,
    successes,
    failures,
  };
}

async function createMarkdown(url: string, turndown: TurndownService): Promise<string> {
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
  const article = new Readability(dom.window.document).parse();
  const fallbackTitle = dom.window.document.title.trim();
  const contentHtml = article?.content?.trim() || dom.window.document.body?.innerHTML?.trim();

  if (!contentHtml) {
    throw new Error("No readable content found on page.");
  }

  let markdown = turndown.turndown(contentHtml).trim();
  const title = article?.title?.trim() || fallbackTitle;

  if (!markdown) {
    throw new Error("Markdown conversion produced no content.");
  }

  if (title && !markdown.startsWith("# ")) {
    markdown = `# ${title}\n\n${markdown}`;
  }

  return `${markdown}\n`;
}

async function ensureDirectories(targets: ScreenshotTarget[]): Promise<void> {
  const directories = new Set<string>();

  for (const target of targets) {
    directories.add(path.dirname(target.markdownPath));
  }

  await Promise.all(Array.from(directories).map((directory) => mkdir(directory, { recursive: true })));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
