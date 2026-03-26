import path from "node:path";

import type { CliOptions, MarkdownMode, MetaMode, ShotsMode } from "./types";

const HELP_TEXT = `Usage:
  sitemap-shots --sitemap <xml-url-or-file> --output <path> [--max <n>] [--shots <mode>] [--markdown[=<mode>]] [--meta <mode>] [--yes]
  sitemap-shots --url <page-url> --output <path> [--shots <mode>] [--markdown[=<mode>]] [--meta <mode>] [--yes]
  sitemap-shots --crawl <page-url> [--sitemap <xml-url-or-file>] --output <path> [--depth <n>] [--max <n>] [--shots <mode>] [--markdown[=<mode>]] [--meta <mode>] [--yes]

Options:
  --sitemap <value>  Sitemap URL or local XML file path
  --url <value>      Single page URL to capture
  --crawl <value>    Crawl internal links starting from a page URL
  --output <path>    Base output directory. Defaults to ./results
  --depth <n>        Maximum crawl depth. 0 = seed page only. Defaults to 4 for --crawl
  --max <n>          Maximum number of pages to capture
  --shots <mode>     Capture screenshots. Modes: true, false. Defaults to true
  --markdown [mode]  Generate markdown too. Modes: true, false. Bare --markdown = true
  --meta <mode>      Metadata export mode. Modes: md, json, false. Defaults to md
  --yes              Skip the confirmation prompt and start immediately
  --help             Show this help text`;

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    output: path.resolve(process.cwd(), "results"),
    shots: "true",
    markdown: "false",
    meta: "md",
    metaExplicit: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--yes") {
      options.yes = true;
      continue;
    }

    if (arg === "--markdown") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        options.markdown = "true";
      } else {
        options.markdown = parseMarkdownMode(next);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("--markdown=")) {
      options.markdown = parseMarkdownMode(arg.slice("--markdown=".length));
      continue;
    }

    if (arg === "--meta") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("Missing value for --meta");
      }
      options.meta = parseMetaMode(next);
      options.metaExplicit = true;
      index += 1;
      continue;
    }

    if (arg.startsWith("--meta=")) {
      options.meta = parseMetaMode(arg.slice("--meta=".length));
      options.metaExplicit = true;
      continue;
    }

    if (arg === "--shots") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("Missing value for --shots");
      }
      options.shots = parseShotsMode(next);
      index += 1;
      continue;
    }

    if (arg.startsWith("--shots=")) {
      options.shots = parseShotsMode(arg.slice("--shots=".length));
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case "--sitemap":
        options.sitemap = next;
        index += 1;
        break;
      case "--url":
        options.url = next;
        index += 1;
        break;
      case "--crawl":
        options.crawl = next;
        index += 1;
        break;
      case "--output":
        options.output = path.resolve(process.cwd(), next);
        index += 1;
        break;
      case "--depth":
        options.depth = parseDepth(next);
        index += 1;
        break;
      case "--max":
        options.max = parseMax(next);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  validateOptions(options);
  return options;
}

export function getHelpText(): string {
  return HELP_TEXT;
}

function parseMax(value: string): number {
  return parseIntegerOption(value, "--max", 1);
}

function parseDepth(value: string): number {
  return parseIntegerOption(value, "--depth", 0);
}

function parseIntegerOption(value: string, name: string, minimum: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < minimum) {
    const rangeLabel = minimum === 0 ? "a non-negative integer" : "a positive integer";
    throw new Error(`${name} must be ${rangeLabel}. Received: ${value}`);
  }

  return parsed;
}

function validateOptions(options: CliOptions): void {
  if (options.help) {
    return;
  }

  if (options.url && options.crawl) {
    throw new Error("Provide either --url or --crawl, not both.");
  }

  if (options.url && options.sitemap) {
    throw new Error("Provide either --url or --sitemap, not both.");
  }

  if (!options.url && !options.crawl && !options.sitemap) {
    throw new Error("Provide one of --sitemap, --url, or --crawl.");
  }

  if (typeof options.depth === "number" && !options.crawl) {
    throw new Error("--depth can only be used with --crawl.");
  }

  if (options.metaExplicit && options.meta === "md" && options.markdown === "false") {
    throw new Error("--meta md requires markdown output. Use --markdown or --markdown true.");
  }

  if (options.shots === "false" && options.markdown === "false" && options.meta === "false" && !options.crawl) {
    throw new Error("No outputs selected. Enable --shots, --markdown, --meta json, or use --crawl for graph output.");
  }
}

function parseMarkdownMode(value: string): MarkdownMode {
  const normalized = value.toLowerCase();

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  throw new Error(`--markdown must be true or false. Received: ${value}`);
}

function parseMetaMode(value: string): MetaMode {
  const normalized = value.toLowerCase();

  if (normalized === "md" || normalized === "json" || normalized === "false") {
    return normalized;
  }

  throw new Error(`--meta must be md, json, or false. Received: ${value}`);
}

function parseShotsMode(value: string): ShotsMode {
  const normalized = value.toLowerCase();

  if (normalized === "true" || normalized === "false") {
    return normalized;
  }

  throw new Error(`--shots must be true or false. Received: ${value}`);
}
