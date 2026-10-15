# font-pulse

[![npm version](https://img.shields.io/npm/v/font-pulse.svg)](https://www.npmjs.com/package/font-pulse) [![CI](https://github.com/MrLouisWright/font-pulse/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/font-pulse/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/font-pulse.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Audit how your built site loads web fonts: font-display, preloads, WOFF2, subsetting, unused weights and total font payload.

Web fonts are a quiet source of slow text and layout shift: a missing `font-display` hides text for up to three seconds, a preload without `crossorigin` downloads the font twice, and a design system that ships nine weights when the pages use two costs hundreds of kilobytes. `font-pulse` reads the HTML and CSS in your static build output, follows linked stylesheets and `@import`, and checks every `@font-face` against how the site actually uses it.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Loading:** `font-display` missing or `block`/`auto`; Google Fonts URLs without `display=swap`; third-party font hosts without `preconnect`.
- **Preloads:** self-hosted fonts with no preload, preloads without `crossorigin` (double download), preloads of files no `@font-face` uses, and too many font preloads.
- **Formats and size:** `@font-face` without a WOFF2 source, font files over 100 kB (subset them), large fonts without `unicode-range`.
- **Waste:** families declared but never used in `font-family`, weights and italic faces never used (headings and `<strong>` count as bold), more than six font files per page, and a per-page payload budget (default 300 kB).
- **Understands real CSS:** the `font` shorthand, CSS custom properties, variable-font weight ranges, `@import` chains and inline styles.

### Scope

font-pulse works from your build output and file sizes on disk; it does not render pages, so "unused" means not referenced by any CSS or default bold element. It does not check cache headers for font files (see cache-pulse) or broken font URLs (static-link-sentinel).

## Rules

| Rule | Default severity | What it means |
|---|---|---|
| `font-display-missing` | medium | @font-face has no font-display (or uses block/auto): invisible text while the font loads |
| `font-preload-no-crossorigin` | medium | Font preload without crossorigin is fetched twice |
| `font-preload-unused` | medium | Preloaded font is not used by any @font-face on the page |
| `font-no-woff2` | medium | @font-face offers no WOFF2 source |
| `font-heavy` | medium | Font file is large (subset it) |
| `font-payload` | medium | Total font payload for a page is over budget |
| `font-google-display` | medium | Google Fonts URL without display=swap/optional |
| `font-not-preloaded` | low | Self-hosted fonts are used but none is preloaded |
| `font-too-many-preloads` | low | Too many font preloads compete with other critical resources |
| `font-too-many-faces` | low | Many font files are loaded on one page |
| `font-unused-face` | low | @font-face family is never used in font-family |
| `font-unused-weight` | low | @font-face weight/style is never used |
| `font-no-unicode-range` | info | Large font without unicode-range (no subsetting by script) |
| `font-no-preconnect` | info | Third-party font host without preconnect |
| `allowlist-expired` | medium | An allowlist entry is past its `expires` date |
| `allowlist-unused` | info | An allowlist entry matched nothing |

## Install and run

```bash
npx font-pulse dist
npx font-pulse public --max-payload-kb 200 --fail-on medium
npx font-pulse _site --format markdown >> $GITHUB_STEP_SUMMARY
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Meta-refresh redirect stubs and `404.html` are skipped. `X-Robots-Tag` and `Link` headers are read from Netlify/Cloudflare `_headers` and `vercel.json`.

### Sample output

```text
font-pulse — /workspace/font-pulse/test/fixtures/bad
1 page(s), 1 with web fonts, 4 font file(s)

MEDIUM   css/fonts.css:2 @font-face "brand" has no font-display [font-display-missing]
MEDIUM   css/fonts.css:2 @font-face "brand" offers woff, ttf but no WOFF2 [font-no-woff2]
MEDIUM   css/fonts.css:2 fonts/brand.woff is 88 KB [font-heavy]
MEDIUM   css/fonts.css:3 @font-face "brand" uses font-display: block [font-display-missing]
MEDIUM   index.html / declares 3 font file(s) totalling 195 KB (budget 150 KB) [font-payload]
MEDIUM   index.html:2 /: <link rel="preload" href="/fonts/brand.woff"> has no crossorigin [font-preload-no-crossorigin]
```

## Options

```text
font-pulse 1.0.0 — audit web font loading in your built site

Usage: font-pulse [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Fonts
      --max-payload-kb <n>     Font budget per page in KB (default 300)
      --max-file-kb <n>        Size above which a font file should be subset, in KB (default 100)

Common
  -c, --config <file>     JSON config (default: .font-pulse.json or "fontPulse" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.font-pulse.json` (or a `"fontPulse"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": {
    "font-display-missing": "low"
  },
  "allowlist": [
    {
      "rule": "font-heavy",
      "subject": "fonts/noto-sans-jp.woff2",
      "reason": "CJK font, already split by unicode-range on the CDN",
      "expires": "2027-03-31"
    }
  ],
  "maxPayload": 204800,
  "maxFile": 81920,
  "maxFaces": 4,
  "maxPreloads": 2,
  "requirePreload": true
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.font-pulse.json` can live at your repository root. Other keys: `maxPayload`, `maxFile`, `maxFaces` (default 6), `maxPreloads` (default 3), `requirePreload` (default true), plus `baseUrl`, `include`, `exclude` and `cleanUrls`.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  font-pulse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/font-pulse@v1
        with:
          path: dist
          fail-on: high
          sarif: font-pulse.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: font-pulse.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, parseCss } from "font-pulse";
parseCss("@font-face{font-family:Inter;src:url(i.woff2) format('woff2')}").faces;
const report = check("dist", { maxPayload: 200 * 1024 });
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Credit (optional)

Free to use under MIT, no attribution required. If font-pulse helps you, a link back is appreciated:

```html
<a href="https://louiswright.co.uk">Built with font-pulse by Louis Wright</a>
```

```markdown
[![Built with font-pulse by Louis Wright](https://img.shields.io/badge/built%20with-font--pulse-blue)](https://louiswright.co.uk)
```

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
