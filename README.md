# sitemap-shots

CLI for resolving URLs from a sitemap XML and capturing full-page desktop and mobile screenshots with Playwright.

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

Skip the confirmation prompt with `--yes`:

```bash
node dist/cli.js --sitemap https://example.com/sitemap.xml --output ./shots --max 10 --yes
```

The CLI prints the resolved URLs before prompting for confirmation. Screenshots are saved under:

```text
<output>/<domain>/<YYYY-MM-DD>/<slug>-desktop.jpg
<output>/<domain>/<YYYY-MM-DD>/<slug>-mobile.jpg
```

If the date folder already exists for that domain, the CLI creates `<YYYY-MM-DD>-1`, then `-2`, and so on. The root path `/` is saved as `homepage-desktop.jpg` and `homepage-mobile.jpg`.
