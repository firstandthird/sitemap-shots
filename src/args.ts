import path from "node:path";

import type { CliOptions } from "./types";

const HELP_TEXT = `Usage:
  sitemap-shots --sitemap <xml-url-or-file> --output <path> [--max <n>] [--yes]
  sitemap-shots --url <page-url> --output <path> [--yes]
  sitemap-shots --crawl <page-url> --output <path> [--depth <n>] [--max <n>] [--yes]

Options:
  --sitemap <value>  Sitemap URL or local XML file path
  --url <value>      Single page URL to capture
  --crawl <value>    Crawl internal links starting from a page URL
  --output <path>    Base output directory
  --depth <n>        Maximum crawl depth. 0 = seed page only. Defaults to 2 for --crawl
  --max <n>          Maximum number of pages to capture
  --yes              Skip the confirmation prompt and start immediately
  --help             Show this help text`;

export function parseCliArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    output: path.resolve(process.cwd(), "screenshots"),
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

  const activeInputs = [options.sitemap, options.url, options.crawl].filter(Boolean);
  if (activeInputs.length > 1) {
    throw new Error("Provide exactly one of --sitemap, --url, or --crawl.");
  }

  if (activeInputs.length === 0) {
    throw new Error("Provide one of --sitemap, --url, or --crawl.");
  }

  if (typeof options.depth === "number" && !options.crawl) {
    throw new Error("--depth can only be used with --crawl.");
  }
}
