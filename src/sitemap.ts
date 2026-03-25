import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { XMLParser } from "fast-xml-parser";

import type { SitemapReference } from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  trimValues: true,
});

type ParsedSitemap = {
  urlset?: {
    url?: SitemapUrlNode | SitemapUrlNode[];
  };
  sitemapindex?: {
    sitemap?: SitemapIndexNode | SitemapIndexNode[];
  };
};

type SitemapUrlNode = {
  loc?: string;
};

type SitemapIndexNode = {
  loc?: string;
};

export async function resolveUrlsFromInput(input: string, max?: number): Promise<string[]> {
  const rootReference = toReference(input);
  const seenSitemaps = new Set<string>();
  const seenUrls = new Set<string>();
  const discoveredUrls: string[] = [];

  await visitSitemap(rootReference, seenSitemaps, seenUrls, discoveredUrls);

  if (typeof max === "number") {
    return discoveredUrls.slice(0, max);
  }

  return discoveredUrls;
}

async function visitSitemap(
  reference: SitemapReference,
  seenSitemaps: Set<string>,
  seenUrls: Set<string>,
  discoveredUrls: string[],
): Promise<void> {
  const sitemapKey = referenceKey(reference);
  if (seenSitemaps.has(sitemapKey)) {
    return;
  }

  seenSitemaps.add(sitemapKey);

  const contents = await loadReference(reference);
  const parsed = parseSitemap(contents, sitemapKey);

  const nestedSitemaps = toArray(parsed.sitemapindex?.sitemap);
  for (const sitemap of nestedSitemaps) {
    if (!sitemap.loc) {
      continue;
    }

    const nestedReference = resolveChildReference(reference, sitemap.loc);
    await visitSitemap(nestedReference, seenSitemaps, seenUrls, discoveredUrls);
  }

  const urls = toArray(parsed.urlset?.url);
  for (const urlNode of urls) {
    if (!urlNode.loc) {
      continue;
    }

    const normalizedUrl = normalizePageUrl(reference, urlNode.loc);
    if (seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    discoveredUrls.push(normalizedUrl);
  }
}

function toReference(input: string): SitemapReference {
  const url = tryParseUrl(input);
  if (url) {
    return { kind: "url", value: url };
  }

  return {
    kind: "file",
    value: path.resolve(process.cwd(), input),
  };
}

function resolveChildReference(parent: SitemapReference, child: string): SitemapReference {
  const absoluteUrl = tryResolveUrl(parent, child);
  if (absoluteUrl) {
    return { kind: "url", value: absoluteUrl };
  }

  if (parent.kind === "file") {
    return {
      kind: "file",
      value: path.resolve(path.dirname(parent.value), child),
    };
  }

  const parentFilePath = fileURLToPath(parent.value);
  return {
    kind: "file",
    value: path.resolve(path.dirname(parentFilePath), child),
  };
}

function normalizePageUrl(parent: SitemapReference, value: string): string {
  const pageUrl = tryResolveUrl(parent, value);

  if (!pageUrl || !/^https?:$/.test(pageUrl.protocol)) {
    throw new Error(`Invalid page URL in sitemap: ${value}`);
  }

  return pageUrl.toString();
}

async function loadReference(reference: SitemapReference): Promise<string> {
  if (reference.kind === "file") {
    return readFile(reference.value, "utf8");
  }

  const response = await fetch(reference.value, {
    headers: {
      "user-agent": "sitemap-shots/0.1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load sitemap ${reference.value.toString()}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseSitemap(contents: string, sourceLabel: string): ParsedSitemap {
  const parsed = xmlParser.parse(contents) as ParsedSitemap;
  const hasUrls = Boolean(parsed.urlset?.url);
  const hasNestedSitemaps = Boolean(parsed.sitemapindex?.sitemap);

  if (!hasUrls && !hasNestedSitemaps) {
    throw new Error(`Unsupported sitemap format: ${sourceLabel}`);
  }

  return parsed;
}

function tryResolveUrl(parent: SitemapReference, candidate: string): URL | undefined {
  const directUrl = tryParseUrl(candidate);
  if (directUrl) {
    return directUrl;
  }

  if (parent.kind === "url") {
    return tryParseUrl(candidate, parent.value);
  }

  const baseUrl = pathToFileURL(parent.value);
  return tryParseUrl(candidate, baseUrl);
}

function tryParseUrl(value: string, base?: URL): URL | undefined {
  try {
    const parsed = base ? new URL(value, base) : new URL(value);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "file:") {
      return parsed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function referenceKey(reference: SitemapReference): string {
  return reference.kind === "url" ? reference.value.toString() : reference.value;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}
