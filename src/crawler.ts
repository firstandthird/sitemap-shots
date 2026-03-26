import type { CrawlFailure } from "./types";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

type CrawlQueueItem = {
  url: URL;
  depth: number;
};

export async function resolveUrlsFromCrawl(input: string, max?: number, depthLimit = 2): Promise<string[]> {
  const startUrl = normalizeSeedUrl(input);
  const queue: CrawlQueueItem[] = [{ url: startUrl, depth: 0 }];
  const discoveredUrls: string[] = [];
  const seenUrls = new Set<string>();
  const failures: CrawlFailure[] = [];

  seenUrls.add(startUrl.toString());

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    discoveredUrls.push(current.url.toString());
    if (hasReachedMax(discoveredUrls.length, max)) {
      break;
    }

    if (current.depth >= depthLimit) {
      continue;
    }

    try {
      const childUrls = await extractInternalLinks(current.url, startUrl.hostname);

      for (const childUrl of childUrls) {
        const normalized = childUrl.toString();
        if (seenUrls.has(normalized)) {
          continue;
        }

        seenUrls.add(normalized);
        queue.push({ url: childUrl, depth: current.depth + 1 });

        if (hasReachedMax(seenUrls.size, max)) {
          break;
        }
      }
    } catch (error) {
      failures.push({
        url: current.url.toString(),
        error: toErrorMessage(error),
      });
    }

  }

  for (const failure of failures) {
    console.warn(`Warning: failed to crawl ${failure.url}`);
    console.warn(`  ${failure.error}`);
  }

  return discoveredUrls;
}

async function extractInternalLinks(pageUrl: URL, hostname: string): Promise<URL[]> {
  const response = await fetch(pageUrl, {
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
    return [];
  }

  const html = await response.text();
  const hrefs = extractAnchorHrefs(html);
  const urls: URL[] = [];

  for (const href of hrefs) {
    const normalized = normalizeCrawledUrl(href, pageUrl, hostname);
    if (normalized) {
      urls.push(normalized);
    }
  }

  return urls;
}

function normalizeSeedUrl(input: string): URL {
  const parsed = new URL(input);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error(`--crawl must be an http(s) URL. Received: ${input}`);
  }

  parsed.hash = "";
  return parsed;
}

function normalizeCrawledUrl(href: string, pageUrl: URL, hostname: string): URL | undefined {
  const trimmed = href.trim();
  if (!trimmed || isSkippableHref(trimmed)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed, pageUrl);
  } catch {
    return undefined;
  }

  if (!/^https?:$/.test(url.protocol)) {
    return undefined;
  }

  url.hash = "";

  if (url.hostname !== hostname) {
    return undefined;
  }

  return url;
}

function extractAnchorHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const anchorRegex = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))/gi;

  for (const match of html.matchAll(anchorRegex)) {
    const href = match[1] ?? match[2] ?? match[3];
    if (href) {
      hrefs.push(decodeHtmlEntities(href));
    }
  }

  return hrefs;
}

function isSkippableHref(href: string): boolean {
  const lower = href.toLowerCase();
  return (
    lower.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:") ||
    lower.startsWith("javascript:") ||
    lower.startsWith("data:")
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function hasReachedMax(count: number, max?: number): boolean {
  return typeof max === "number" && count >= max;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
