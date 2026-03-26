import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import type { ScreenshotTarget } from "./types";

export function buildScreenshotTargets(urls: string[], outputRoot: string): ScreenshotTarget[] {
  const dateStamp = formatLocalDate(new Date());
  const groupSizes = countSlugGroups(urls);
  const domainDateDirs = new Map<string, string>();

  return urls.map((url) => {
    const parsedUrl = new URL(url);
    const domain = sanitizeDomain(parsedUrl.hostname);
    const slug = buildSlug(parsedUrl);
    const groupKey = buildGroupKey(domain, slug);
    const needsHash = (groupSizes.get(groupKey) ?? 0) > 1;
    const fileSlug = needsHash ? `${slug}-${shortHash(parsedUrl.toString())}` : slug;
    const targetDir = resolveTargetDir(outputRoot, domain, dateStamp, domainDateDirs);

    return {
      url: parsedUrl,
      domain,
      dateStamp,
      slug: fileSlug,
      desktopPath: path.join(targetDir, `${fileSlug}-desktop.jpg`),
      mobilePath: path.join(targetDir, `${fileSlug}-mobile.jpg`),
      markdownPath: path.join(targetDir, `${fileSlug}.md`),
      metaJsonPath: path.join(targetDir, `${fileSlug}.meta.json`),
    };
  });
}

export function buildOutputPreview(targets: ScreenshotTarget[]): string {
  const uniqueDirs = new Set(targets.map((target) => path.dirname(target.desktopPath)));

  return Array.from(uniqueDirs)
    .sort()
    .join("\n");
}

function countSlugGroups(urls: string[]): Map<string, number> {
  const groups = new Map<string, number>();

  for (const url of urls) {
    const parsedUrl = new URL(url);
    const domain = sanitizeDomain(parsedUrl.hostname);
    const slug = buildSlug(parsedUrl);
    const key = buildGroupKey(domain, slug);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return groups;
}

function buildSlug(url: URL): string {
  const trimmedPath = url.pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmedPath) {
    return "homepage";
  }

  const parts = trimmedPath
    .split("/")
    .map((part) => sanitizeSlugPart(safeDecodeURIComponent(part)))
    .filter(Boolean);

  return parts.length > 0 ? parts.join("-") : "homepage";
}

function sanitizeSlugPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized;
}

function sanitizeDomain(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildGroupKey(domain: string, slug: string): string {
  return `${domain}::${slug}`;
}

function resolveTargetDir(
  outputRoot: string,
  domain: string,
  dateStamp: string,
  cache: Map<string, string>,
): string {
  const domainRoot = path.join(outputRoot, domain);
  const cached = cache.get(domainRoot);
  if (cached) {
    return cached;
  }

  let folderName = dateStamp;
  let suffix = 1;

  while (existsSync(path.join(domainRoot, folderName))) {
    folderName = `${dateStamp}-${suffix}`;
    suffix += 1;
  }

  const resolved = path.join(domainRoot, folderName);
  cache.set(domainRoot, resolved);
  return resolved;
}
