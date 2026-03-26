import type { CrawlEdge, CrawlFailure, CrawlGraphResult } from "./types";

const HTML_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];

type CrawlQueueItem = {
  url: URL;
  depth: number;
};

type MutableCrawlNode = {
  url: string;
  depth: number;
  incomingUrls: Set<string>;
  outgoingUrls: Set<string>;
  error?: string;
};

export async function crawlSiteGraph(input: string, max?: number, depthLimit = 4): Promise<CrawlGraphResult> {
  const startUrl = normalizeSeedUrl(input);
  const queue: CrawlQueueItem[] = [{ url: startUrl, depth: 0 }];
  const discoveredUrls: string[] = [];
  const seenUrls = new Set<string>();
  const failures: CrawlFailure[] = [];
  const nodes = new Map<string, MutableCrawlNode>();
  const edges = new Set<string>();

  seenUrls.add(startUrl.toString());
  ensureNode(nodes, startUrl.toString(), 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const currentUrl = current.url.toString();
    console.log(
      `Crawling depth ${current.depth}: ${currentUrl} (${discoveredUrls.length + 1}${typeof max === "number" ? `/${max}` : ""})`,
    );
    discoveredUrls.push(currentUrl);
    if (hasReachedMax(discoveredUrls.length, max)) {
      console.log(`Reached --max limit after ${currentUrl}.`);
      break;
    }

    if (current.depth >= depthLimit) {
      console.log(`Reached depth limit at ${currentUrl}; not following child links.`);
      continue;
    }

    try {
      const childUrls = await extractInternalLinks(current.url, startUrl.hostname);
      console.log(`  Found ${childUrls.length} internal link${childUrls.length === 1 ? "" : "s"} on ${currentUrl}.`);
      let enqueuedCount = 0;

      for (const childUrl of childUrls) {
        const normalized = childUrl.toString();
        connectNodes(nodes, edges, currentUrl, normalized, current.depth + 1);

        if (seenUrls.has(normalized)) {
          continue;
        }

        seenUrls.add(normalized);
        queue.push({ url: childUrl, depth: current.depth + 1 });
        enqueuedCount += 1;

        if (hasReachedMax(seenUrls.size, max)) {
          console.log(`  Reached --max limit while queueing links from ${currentUrl}.`);
          break;
        }
      }

      if (enqueuedCount > 0) {
        console.log(`  Queued ${enqueuedCount} new page${enqueuedCount === 1 ? "" : "s"} from ${currentUrl}.`);
      } else {
        console.log(`  No new pages queued from ${currentUrl}.`);
      }
    } catch (error) {
      const message = toErrorMessage(error);
      failures.push({
        url: currentUrl,
        error: message,
      });
      ensureNode(nodes, currentUrl, current.depth).error = message;
      console.warn(`  Crawl failed for ${currentUrl}: ${message}`);
    }
  }

  for (const failure of failures) {
    console.warn(`Warning: failed to crawl ${failure.url}`);
    console.warn(`  ${failure.error}`);
  }

  return {
    seedUrl: startUrl.toString(),
    discoveredUrls,
    nodes: Array.from(nodes.values())
      .map((node) => ({
        url: node.url,
        depth: node.depth,
        incomingCount: node.incomingUrls.size,
        outgoingUrls: Array.from(node.outgoingUrls).sort(),
        error: node.error,
      }))
      .sort((left, right) => left.depth - right.depth || left.url.localeCompare(right.url)),
    edges: Array.from(edges)
      .map((key) => parseEdgeKey(key))
      .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    failures,
  };
}

export async function resolveUrlsFromCrawl(input: string, max?: number, depthLimit = 4): Promise<string[]> {
  const result = await crawlSiteGraph(input, max, depthLimit);
  return result.discoveredUrls;
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

function ensureNode(nodes: Map<string, MutableCrawlNode>, url: string, depth: number): MutableCrawlNode {
  const existing = nodes.get(url);
  if (existing) {
    if (depth < existing.depth) {
      existing.depth = depth;
    }
    return existing;
  }

  const created: MutableCrawlNode = {
    url,
    depth,
    incomingUrls: new Set<string>(),
    outgoingUrls: new Set<string>(),
  };
  nodes.set(url, created);
  return created;
}

function connectNodes(
  nodes: Map<string, MutableCrawlNode>,
  edges: Set<string>,
  fromUrl: string,
  toUrl: string,
  childDepth: number,
): void {
  const fromNode = ensureNode(nodes, fromUrl, childDepth - 1);
  const toNode = ensureNode(nodes, toUrl, childDepth);

  fromNode.outgoingUrls.add(toUrl);
  toNode.incomingUrls.add(fromUrl);
  edges.add(buildEdgeKey(fromUrl, toUrl));
}

function buildEdgeKey(fromUrl: string, toUrl: string): string {
  return `${fromUrl}\u0000${toUrl}`;
}

function parseEdgeKey(value: string): CrawlEdge {
  const [from, to] = value.split("\u0000");
  return { from, to };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
