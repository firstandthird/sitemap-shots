export type MarkdownMode = "false" | "true";
export type MetaMode = "md" | "json" | "false";
export type ShotsMode = "true" | "false";

export type CliOptions = {
  sitemap?: string;
  url?: string;
  crawl?: string;
  output: string;
  max?: number;
  depth?: number;
  markdown: MarkdownMode;
  shots: ShotsMode;
  meta: MetaMode;
  metaExplicit: boolean;
  yes?: boolean;
  help?: boolean;
};

export type ScreenshotTarget = {
  url: URL;
  domain: string;
  dateStamp: string;
  slug: string;
  desktopPath: string;
  mobilePath: string;
  markdownPath: string;
  metaJsonPath: string;
};

export type CaptureFailure = {
  url: string;
  error: string;
};

export type CaptureSummary = {
  totalPages: number;
  successes: number;
  failures: CaptureFailure[];
};

export type ContentFailure = {
  url: string;
  error: string;
};

export type ContentExportSummary = {
  totalPages: number;
  markdownSuccesses: number;
  markdownFailures: ContentFailure[];
  metaJsonSuccesses: number;
  metaJsonFailures: ContentFailure[];
};

export type SitemapReference =
  | {
      kind: "url";
      value: URL;
    }
  | {
      kind: "file";
      value: string;
    };

export type CrawlFailure = {
  url: string;
  error: string;
};

export type CrawlNode = {
  url: string;
  depth: number;
  incomingCount: number;
  outgoingUrls: string[];
  error?: string;
};

export type CrawlEdge = {
  from: string;
  to: string;
};

export type CrawlGraphResult = {
  seedUrl: string;
  discoveredUrls: string[];
  nodes: CrawlNode[];
  edges: CrawlEdge[];
  failures: CrawlFailure[];
};

export type GraphSitemapSource = "explicit" | "auto" | "none";

export type GraphNode = {
  url: string;
  depth: number | null;
  incomingCount: number;
  outgoingUrls: string[];
  reachable: boolean;
  orphaned: boolean | null;
  source: "crawl" | "sitemap" | "both";
  error?: string;
};

export type GraphReport = {
  crawlSeed: string;
  sitemapSource: GraphSitemapSource;
  sitemapReference: string | null;
  crawlDepthLimit: number;
  crawlMax: number | null;
  totalCrawledPages: number;
  totalReachablePages: number;
  totalSitemapPages: number | null;
  totalOrphanedPages: number | null;
  maximumDepth: number;
  nodes: GraphNode[];
  edges: CrawlEdge[];
  crawlFailures: CrawlFailure[];
};
