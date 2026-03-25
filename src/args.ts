import path from "node:path";

import type { CliOptions } from "./types";

const HELP_TEXT = `Usage:
  sitemap-shots --sitemap <xml-url-or-file> --output <path> [--max <n>] [--yes]
  sitemap-shots --url <page-url> --output <path> [--yes]

Options:
  --sitemap <value>  Sitemap URL or local XML file path
  --url <value>      Single page URL to capture
  --output <path>    Base output directory
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
      case "--output":
        options.output = path.resolve(process.cwd(), next);
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
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--max must be a positive integer. Received: ${value}`);
  }

  return parsed;
}

function validateOptions(options: CliOptions): void {
  if (options.help) {
    return;
  }

  if (options.sitemap && options.url) {
    throw new Error("Provide either --sitemap or --url, not both.");
  }

  if (!options.sitemap && !options.url) {
    throw new Error("Provide one of --sitemap or --url.");
  }
}
