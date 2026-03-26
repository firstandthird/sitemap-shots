import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CrawlGraphResult,
  GraphNode,
  GraphReport,
  GraphSitemapSource,
  ScreenshotTarget,
} from "./types";

export function buildGraphReport(
  crawlResult: CrawlGraphResult,
  options: {
    depthLimit: number;
    max?: number;
    sitemapUrls?: string[];
    sitemapReference?: string;
    sitemapSource: GraphSitemapSource;
  },
): GraphReport {
  const crawlNodeMap = new Map(crawlResult.nodes.map((node) => [node.url, node]));
  const sitemapUrlSet = new Set(options.sitemapUrls ?? []);
  const allUrls = new Set<string>(crawlNodeMap.keys());

  for (const sitemapUrl of sitemapUrlSet) {
    allUrls.add(sitemapUrl);
  }

  const nodes: GraphNode[] = Array.from(allUrls)
    .map((url) => {
      const crawlNode = crawlNodeMap.get(url);
      const inSitemap = sitemapUrlSet.has(url);
      const reachable = Boolean(crawlNode);
      const source: GraphNode["source"] = reachable && inSitemap ? "both" : reachable ? "crawl" : "sitemap";

      return {
        url,
        depth: crawlNode?.depth ?? null,
        incomingCount: crawlNode?.incomingCount ?? 0,
        outgoingUrls: crawlNode?.outgoingUrls ?? [],
        reachable,
        orphaned: options.sitemapUrls ? inSitemap && !reachable : null,
        source,
        error: crawlNode?.error,
      };
    })
    .sort((left, right) => compareGraphNodes(left, right));

  const deepestDepth = crawlResult.nodes.reduce((maxDepth, node) => Math.max(maxDepth, node.depth), 0);
  const orphanedCount = options.sitemapUrls
    ? nodes.filter((node) => node.orphaned === true).length
    : null;

  return {
    crawlSeed: crawlResult.seedUrl,
    sitemapSource: options.sitemapSource,
    sitemapReference: options.sitemapReference ?? null,
    crawlDepthLimit: options.depthLimit,
    crawlMax: typeof options.max === "number" ? options.max : null,
    totalCrawledPages: crawlResult.discoveredUrls.length,
    totalReachablePages: crawlResult.nodes.length,
    totalSitemapPages: options.sitemapUrls ? sitemapUrlSet.size : null,
    totalOrphanedPages: orphanedCount,
    maximumDepth: deepestDepth,
    nodes,
    edges: crawlResult.edges,
    crawlFailures: crawlResult.failures,
  };
}

export async function writeGraphArtifacts(targets: ScreenshotTarget[], report: GraphReport): Promise<void> {
  if (targets.length === 0) {
    return;
  }

  const outputDir = path.dirname(targets[0].desktopPath);
  await mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, "site-graph.json");
  const markdownPath = path.join(outputDir, "site-graph.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${renderGraphReport(report)}\n`, "utf8");
}

function renderGraphReport(report: GraphReport): string {
  const reachableNodes = report.nodes.filter((node) => node.reachable);
  const sitemapNodes = report.nodes.filter((node) => node.source === "sitemap" || node.source === "both");
  const orphanedNodes = report.nodes.filter((node) => node.orphaned === true);
  const crawlOnlyNodes = report.nodes.filter((node) => node.source === "crawl");
  const deadEndNodes = reachableNodes.filter((node) => node.outgoingUrls.length === 0);
  const lowLinkedNodes = reachableNodes.filter((node) => node.incomingCount <= 1);
  const deepestNodes = sortNodes(
    reachableNodes.filter((node) => node.depth === report.maximumDepth),
    (left, right) =>
      compareNullableDepth(right.depth, left.depth) ||
      left.incomingCount - right.incomingCount ||
      left.url.localeCompare(right.url),
  );
  const mostLinkedNodes = sortNodes(
    reachableNodes,
    (left, right) =>
      right.incomingCount - left.incomingCount ||
      right.outgoingUrls.length - left.outgoingUrls.length ||
      left.url.localeCompare(right.url),
  ).slice(0, 20);
  const leastLinkedNodes = sortNodes(
    lowLinkedNodes,
    (left, right) =>
      left.incomingCount - right.incomingCount ||
      compareNullableDepth(right.depth, left.depth) ||
      left.url.localeCompare(right.url),
  ).slice(0, 20);
  const hubNodes = sortNodes(
    reachableNodes.filter((node) => node.outgoingUrls.length > 0),
    (left, right) =>
      right.outgoingUrls.length - left.outgoingUrls.length ||
      right.incomingCount - left.incomingCount ||
      left.url.localeCompare(right.url),
  ).slice(0, 20);
  const buriedNodes = sortNodes(
    reachableNodes,
    (left, right) =>
      compareNullableDepth(right.depth, left.depth) ||
      left.incomingCount - right.incomingCount ||
      left.outgoingUrls.length - right.outgoingUrls.length ||
      left.url.localeCompare(right.url),
  ).slice(0, 20);
  const sectionSummaries = buildSectionSummaries(report.nodes);
  const findings = buildKeyFindings(report, {
    orphanedCount: orphanedNodes.length,
    crawlOnlyCount: crawlOnlyNodes.length,
    deadEndCount: deadEndNodes.length,
    lowLinkedCount: lowLinkedNodes.length,
    deepestNodes,
    sectionSummaries,
  });

  const lines = ["# Site Graph", ""];

  lines.push("## Executive Summary", "");
  lines.push(`- Crawl seed: ${report.crawlSeed}`);
  lines.push(`- Sitemap source: ${describeSitemapSource(report.sitemapSource, report.sitemapReference)}`);
  lines.push(`- Crawl depth limit: ${report.crawlDepthLimit}`);
  lines.push(`- Crawl max: ${report.crawlMax ?? "none"}`);
  lines.push(`- Reachable pages: ${report.totalReachablePages}`);
  lines.push(`- Crawled pages: ${report.totalCrawledPages}`);
  lines.push(`- Maximum click depth: ${report.maximumDepth}`);
  lines.push(`- Dead ends: ${deadEndNodes.length}`);
  lines.push(`- Low-linked reachable pages: ${lowLinkedNodes.length}`);

  if (typeof report.totalSitemapPages === "number") {
    lines.push(`- Sitemap pages: ${report.totalSitemapPages}`);
  }
  if (typeof report.totalOrphanedPages === "number") {
    lines.push(`- Orphaned sitemap pages: ${report.totalOrphanedPages}`);
  }
  if (typeof report.totalSitemapPages === "number") {
    lines.push(`- Crawl-only pages missing from sitemap: ${crawlOnlyNodes.length}`);
  }
  if (report.crawlFailures.length > 0) {
    lines.push(`- Crawl failures: ${report.crawlFailures.length}`);
  }

  lines.push("", "## Key Findings", "");
  if (findings.length === 0) {
    lines.push("- No obvious structural issues were detected from the crawl graph.");
  } else {
    for (const finding of findings) {
      lines.push(`- ${finding}`);
    }
  }

  lines.push("", "## Coverage Analysis", "");
  lines.push(`- Reachable pages: ${report.totalReachablePages}`);
  if (typeof report.totalSitemapPages === "number") {
    lines.push(`- Sitemap pages: ${report.totalSitemapPages}`);
    lines.push(`- Sitemap coverage: ${formatRatio(report.totalReachablePages - crawlOnlyNodes.length, report.totalSitemapPages)}`);
    lines.push(`- Orphaned sitemap pages: ${orphanedNodes.length}`);
    lines.push(`- Crawl-only pages: ${crawlOnlyNodes.length}`);
    lines.push(`- Reachable pages present in sitemap: ${sitemapNodes.length - orphanedNodes.length}`);
  } else {
    lines.push("- Sitemap coverage: unavailable because no sitemap source was available.");
  }
  lines.push(`- Crawl failures: ${report.crawlFailures.length}`);

  lines.push("", "## Depth Distribution", "");
  appendDepthDistribution(lines, reachableNodes);

  lines.push("", "## Deepest / Most Buried Pages", "");
  appendRankedNodes(lines, buriedNodes, (node) => {
    const depth = node.depth ?? "n/a";
    return `depth ${depth}, inbound ${node.incomingCount}, outbound ${node.outgoingUrls.length}: ${node.url}`;
  });

  lines.push("", "## Most Linked Pages", "");
  appendRankedNodes(lines, mostLinkedNodes, (node) => {
    const depth = node.depth ?? "n/a";
    return `${node.incomingCount} inbound, ${node.outgoingUrls.length} outbound, depth ${depth}: ${node.url}`;
  });

  lines.push("", "## Least Linked Pages", "");
  appendRankedNodes(lines, leastLinkedNodes, (node) => {
    const depth = node.depth ?? "n/a";
    return `${node.incomingCount} inbound, ${node.outgoingUrls.length} outbound, depth ${depth}: ${node.url}`;
  });

  lines.push("", "## Dead Ends", "");
  appendRankedNodes(lines, sortNodes(deadEndNodes, compareGraphNodes), (node) => {
    const depth = node.depth ?? "n/a";
    return `depth ${depth}, inbound ${node.incomingCount}: ${node.url}`;
  });

  lines.push("", "## Hub Pages", "");
  appendRankedNodes(lines, hubNodes, (node) => {
    const depth = node.depth ?? "n/a";
    return `${node.outgoingUrls.length} outbound, ${node.incomingCount} inbound, depth ${depth}: ${node.url}`;
  });

  if (typeof report.totalOrphanedPages === "number") {
    lines.push("", "## Orphaned Sitemap Pages", "");
    appendSectionGroupedUrls(lines, orphanedNodes);
  }

  if (typeof report.totalSitemapPages === "number") {
    lines.push("", "## Crawl-Only Pages Missing From Sitemap", "");
    appendSectionGroupedUrls(lines, crawlOnlyNodes);
  }

  lines.push("", "## Section Breakdown", "");
  appendSectionBreakdown(lines, sectionSummaries);

  if (report.crawlFailures.length > 0) {
    lines.push("", "## Crawl Failures", "");
    for (const failure of report.crawlFailures) {
      lines.push(`- ${failure.url}`);
      lines.push(`  - ${failure.error}`);
    }
  }

  lines.push("", "## Page Appendix", "");
  appendPageAppendix(lines, report.nodes);

  return lines.join("\n");
}

type SectionSummary = {
  section: string;
  totalPages: number;
  reachablePages: number;
  orphanedPages: number;
  crawlOnlyPages: number;
  deadEndPages: number;
  lowLinkedPages: number;
  averageDepth: number | null;
};

function compareGraphNodes(left: GraphNode, right: GraphNode): number {
  const leftDepth = left.depth ?? Number.POSITIVE_INFINITY;
  const rightDepth = right.depth ?? Number.POSITIVE_INFINITY;
  return leftDepth - rightDepth || left.url.localeCompare(right.url);
}

function describeSitemapSource(source: GraphSitemapSource, reference: string | null): string {
  if (source === "none") {
    return "none";
  }

  return reference ? `${source} (${reference})` : source;
}

function appendDepthDistribution(lines: string[], reachableNodes: GraphNode[]): void {
  if (reachableNodes.length === 0) {
    lines.push("- None");
    return;
  }

  const buckets = new Map<number, number>();
  for (const node of reachableNodes) {
    const depth = node.depth ?? 0;
    buckets.set(depth, (buckets.get(depth) ?? 0) + 1);
  }

  for (const depth of Array.from(buckets.keys()).sort((left, right) => left - right)) {
    const count = buckets.get(depth) ?? 0;
    lines.push(`- Depth ${depth}: ${count} page(s) (${formatPercent(count, reachableNodes.length)})`);
  }
}

function appendRankedNodes(
  lines: string[],
  nodes: GraphNode[],
  renderNode: (node: GraphNode) => string,
): void {
  if (nodes.length === 0) {
    lines.push("- None");
    return;
  }

  for (const node of nodes) {
    lines.push(`- ${renderNode(node)}`);
  }
}

function appendSectionGroupedUrls(lines: string[], nodes: GraphNode[]): void {
  if (nodes.length === 0) {
    lines.push("- None");
    return;
  }

  const groups = new Map<string, GraphNode[]>();
  for (const node of sortNodes(nodes, compareGraphNodes)) {
    const section = getSectionLabel(node.url);
    const existing = groups.get(section);
    if (existing) {
      existing.push(node);
    } else {
      groups.set(section, [node]);
    }
  }

  for (const section of Array.from(groups.keys()).sort()) {
    const grouped = groups.get(section) ?? [];
    lines.push(`- ${section}: ${grouped.length} page(s)`);
    for (const node of grouped) {
      lines.push(`  - ${node.url}`);
    }
  }
}

function appendSectionBreakdown(lines: string[], summaries: SectionSummary[]): void {
  if (summaries.length === 0) {
    lines.push("- None");
    return;
  }

  lines.push("| Section | Total | Reachable | Avg Depth | Orphaned | Crawl-Only | Dead Ends | Low-Linked |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const summary of summaries) {
    lines.push(
      `| ${escapeTableCell(summary.section)} | ${summary.totalPages} | ${summary.reachablePages} | ${formatAverageDepth(summary.averageDepth)} | ${summary.orphanedPages} | ${summary.crawlOnlyPages} | ${summary.deadEndPages} | ${summary.lowLinkedPages} |`,
    );
  }
}

function appendPageAppendix(lines: string[], nodes: GraphNode[]): void {
  if (nodes.length === 0) {
    lines.push("- None");
    return;
  }

  lines.push("| URL | Depth | Inbound | Outbound | Reachable | Orphaned | Source | Error |");
  lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- |");

  for (const node of sortNodes(nodes, compareGraphNodes)) {
    lines.push(
      `| ${escapeTableCell(node.url)} | ${node.depth ?? "n/a"} | ${node.incomingCount} | ${node.outgoingUrls.length} | ${node.reachable ? "yes" : "no"} | ${formatNullableBoolean(node.orphaned)} | ${node.source} | ${escapeTableCell(node.error ?? "")} |`,
    );
  }
}

function buildKeyFindings(
  report: GraphReport,
  metrics: {
    orphanedCount: number;
    crawlOnlyCount: number;
    deadEndCount: number;
    lowLinkedCount: number;
    deepestNodes: GraphNode[];
    sectionSummaries: SectionSummary[];
  },
): string[] {
  const findings: string[] = [];

  if (metrics.orphanedCount > 0) {
    findings.push(
      `${metrics.orphanedCount} sitemap page(s) were not reachable from the crawl seed, indicating orphaned content or missing internal links.`,
    );
  }

  if (metrics.crawlOnlyCount > 0) {
    findings.push(
      `${metrics.crawlOnlyCount} reachable page(s) were found by crawling but are missing from the sitemap, which suggests sitemap coverage gaps.`,
    );
  }

  if (metrics.deadEndCount > 0) {
    findings.push(
      `${metrics.deadEndCount} reachable page(s) are dead ends with no outgoing internal links, which may trap users or search crawlers at leaf pages.`,
    );
  }

  if (metrics.lowLinkedCount > 0) {
    findings.push(
      `${metrics.lowLinkedCount} reachable page(s) have one or fewer inbound internal links, making them comparatively hard to discover.`,
    );
  }

  if (report.maximumDepth >= 3 && metrics.deepestNodes.length > 0) {
    findings.push(
      `The deepest reachable content sits ${report.maximumDepth} clicks away from the seed page, which may indicate buried pages or over-nested navigation.`,
    );
  }

  const weakestSection = metrics.sectionSummaries
    .filter((summary) => summary.totalPages > 1)
    .sort(
      (left, right) =>
        right.orphanedPages - left.orphanedPages ||
        right.lowLinkedPages - left.lowLinkedPages ||
        right.deadEndPages - left.deadEndPages ||
        left.section.localeCompare(right.section),
    )[0];

  if (weakestSection && (weakestSection.orphanedPages > 0 || weakestSection.lowLinkedPages > 0)) {
    findings.push(
      `The \`${weakestSection.section}\` section looks structurally weak: ${weakestSection.orphanedPages} orphaned, ${weakestSection.lowLinkedPages} low-linked, ${weakestSection.deadEndPages} dead-end page(s).`,
    );
  }

  if (report.crawlFailures.length > 0) {
    findings.push(
      `${report.crawlFailures.length} page(s) failed during crawl, so the graph may underrepresent reachable content behind those failures.`,
    );
  }

  return findings;
}

function buildSectionSummaries(nodes: GraphNode[]): SectionSummary[] {
  const groups = new Map<string, GraphNode[]>();

  for (const node of nodes) {
    const section = getSectionLabel(node.url);
    const existing = groups.get(section);
    if (existing) {
      existing.push(node);
    } else {
      groups.set(section, [node]);
    }
  }

  return Array.from(groups.entries())
    .map(([section, sectionNodes]) => {
      const reachableNodes = sectionNodes.filter((node) => node.reachable);
      const depthSum = reachableNodes.reduce((total, node) => total + (node.depth ?? 0), 0);
      return {
        section,
        totalPages: sectionNodes.length,
        reachablePages: reachableNodes.length,
        orphanedPages: sectionNodes.filter((node) => node.orphaned === true).length,
        crawlOnlyPages: sectionNodes.filter((node) => node.source === "crawl").length,
        deadEndPages: reachableNodes.filter((node) => node.outgoingUrls.length === 0).length,
        lowLinkedPages: reachableNodes.filter((node) => node.incomingCount <= 1).length,
        averageDepth: reachableNodes.length > 0 ? depthSum / reachableNodes.length : null,
      };
    })
    .sort(
      (left, right) =>
        right.totalPages - left.totalPages ||
        right.orphanedPages - left.orphanedPages ||
        left.section.localeCompare(right.section),
    );
}

function getSectionLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length === 0) {
      return "homepage";
    }

    return pathSegments[0];
  } catch {
    return "unknown";
  }
}

function sortNodes(nodes: GraphNode[], comparator: (left: GraphNode, right: GraphNode) => number): GraphNode[] {
  return [...nodes].sort(comparator);
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "0 of 0 (0.0%)";
  }

  return `${numerator} of ${denominator} (${formatPercent(numerator, denominator)})`;
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return "0.0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatAverageDepth(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return value.toFixed(2);
}

function formatNullableBoolean(value: boolean | null): string {
  if (value === null) {
    return "n/a";
  }

  return value ? "yes" : "no";
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function compareNullableDepth(left: number | null, right: number | null): number {
  return (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY);
}
