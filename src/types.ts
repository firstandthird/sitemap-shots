export type CliOptions = {
  sitemap?: string;
  url?: string;
  output: string;
  max?: number;
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

export type SitemapReference =
  | {
      kind: "url";
      value: URL;
    }
  | {
      kind: "file";
      value: string;
    };
