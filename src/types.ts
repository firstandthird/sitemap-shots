export type MarkdownMode = "false" | "true" | "only";
export type MetaMode = "md" | "json" | "false";

export type CliOptions = {
  sitemap?: string;
  url?: string;
  crawl?: string;
  output: string;
  max?: number;
  depth?: number;
  markdown: MarkdownMode;
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
