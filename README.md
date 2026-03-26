# sitemap-shots

CLI for resolving URLs from a sitemap XML, single URL, or crawl and capturing full-page desktop and mobile screenshots with Playwright, with optional Markdown, metadata, and crawl graph export.

## Usage

```bash
npm install
npx playwright install chromium
npm run build
node dist/cli.js --sitemap https://example.com/sitemap.xml --output ./shots --max 10
```

Or capture a single URL:

```bash
node dist/cli.js --url https://example.com/ --output ./shots
```

Or crawl internal pages from a starting URL:

```bash
node dist/cli.js --crawl https://example.com/ --max 25 --output ./shots
```

Generate screenshots and Markdown together:

```bash
node dist/cli.js --url https://example.com/ --output ./shots --markdown
```

Generate Markdown without screenshots:

```bash
node dist/cli.js --crawl https://example.com/ --depth 1 --output ./shots --shots false --markdown
```

Write metadata into Markdown frontmatter:

```bash
node dist/cli.js --url https://example.com/ --output ./shots --markdown --meta md
```

Write metadata to a sidecar JSON file:

```bash
node dist/cli.js --url https://example.com/ --output ./shots --markdown false --meta json
```

Disable screenshots explicitly:

```bash
node dist/cli.js --sitemap https://example.com/sitemap.xml --output ./shots --shots false --markdown
```

Skip the confirmation prompt with `--yes`:

```bash
node dist/cli.js --sitemap https://example.com/sitemap.xml --output ./shots --max 10 --yes
```

The CLI prints the resolved URLs before prompting for confirmation. Screenshots are saved under:

```text
<output>/<domain>/<YYYY-MM-DD>/<slug>-desktop.jpg
<output>/<domain>/<YYYY-MM-DD>/<slug>-mobile.jpg
<output>/<domain>/<YYYY-MM-DD>/<slug>.md
<output>/<domain>/<YYYY-MM-DD>/<slug>.meta.json
<output>/<domain>/<YYYY-MM-DD>/site-graph.json
<output>/<domain>/<YYYY-MM-DD>/site-graph.md
```

If the date folder already exists for that domain, the CLI creates `<YYYY-MM-DD>-1`, then `-2`, and so on. The root path `/` is saved as `homepage-desktop.jpg` and `homepage-mobile.jpg`.

For `--crawl`, the seed URL is depth `0`, its direct internal links are depth `1`, and the crawl stays on the same hostname only. The default crawl depth is `4`. Crawl runs always write `site-graph.json` and `site-graph.md`. If you also pass `--sitemap`, the graph report detects orphaned sitemap pages. If you do not pass `--sitemap`, the CLI will try `<origin>/sitemap.xml` automatically and use it when available.

If `--output` is omitted, the CLI writes into `./results`.
