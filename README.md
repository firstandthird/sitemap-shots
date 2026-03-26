# sitemap-shots

CLI for resolving URLs from a sitemap XML and capturing full-page desktop and mobile screenshots with Playwright, with optional Markdown export.

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
node dist/cli.js --crawl https://example.com/ --depth 2 --max 25 --output ./shots
```

Generate screenshots and Markdown together:

```bash
node dist/cli.js --url https://example.com/ --output ./shots --markdown
```

Generate Markdown only:

```bash
node dist/cli.js --crawl https://example.com/ --depth 1 --output ./shots --markdown only
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
```

If the date folder already exists for that domain, the CLI creates `<YYYY-MM-DD>-1`, then `-2`, and so on. The root path `/` is saved as `homepage-desktop.jpg` and `homepage-mobile.jpg`.

For `--crawl`, the seed URL is depth `0`, its direct internal links are depth `1`, and the crawl stays on the same hostname only.
