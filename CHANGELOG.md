# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Parses @font-face and font usage from linked stylesheets (with @import), <style> blocks and style attributes.
- Checks font-display, WOFF2, file size and unicode-range subsetting, unused faces and weights, per-page payload and face count.
- Preload checks: missing preload, preload without crossorigin, preloads not used by any @font-face, too many preloads.
- Google Fonts display=swap and preconnect for third-party font hosts.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
