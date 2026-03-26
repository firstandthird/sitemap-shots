export type MarkdownMode = "false" | "true" | "only";

export type CliOptions = {
  sitemap?: string;
  url?: string;
  crawl?: string;
  output: string;
  max?: number;
  depth?: number;
  markdown: MarkdownMode;
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

export type MarkdownFailure = {
  url: string;
  error: string;
};

export type MarkdownSummary = {
  totalPages: number;
  successes: number;
  failures: MarkdownFailure[];
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
