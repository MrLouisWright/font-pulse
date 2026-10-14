// font-pulse: audit web font loading in a built static site: font-display, preloads, formats, subsetting,
// unused faces and weights, and total font payload. Zero dependencies. Louis Wright, MIT.
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { runBeacon, finder } from './site.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { loadSite, parseHtml, SITE_OPTIONS, SITE_HELP } from './site.js';

export const RULES = {
  'font-display-missing': { severity: 'medium', title: '@font-face has no font-display (or uses block/auto): invisible text while the font loads' },
  'font-preload-no-crossorigin': { severity: 'medium', title: 'Font preload without crossorigin is fetched twice' },
  'font-preload-unused': { severity: 'medium', title: 'Preloaded font is not used by any @font-face on the page' },
  'font-no-woff2': { severity: 'medium', title: '@font-face offers no WOFF2 source' },
  'font-heavy': { severity: 'medium', title: 'Font file is large (subset it)' },
  'font-payload': { severity: 'medium', title: 'Total font payload for a page is over budget' },
  'font-google-display': { severity: 'medium', title: 'Google Fonts URL without display=swap/optional' },
  'font-not-preloaded': { severity: 'low', title: 'Self-hosted fonts are used but none is preloaded' },
  'font-too-many-preloads': { severity: 'low', title: 'Too many font preloads compete with other critical resources' },
  'font-too-many-faces': { severity: 'low', title: 'Many font files are loaded on one page' },
  'font-unused-face': { severity: 'low', title: '@font-face family is never used in font-family' },
  'font-unused-weight': { severity: 'low', title: '@font-face weight/style is never used' },
  'font-no-unicode-range': { severity: 'info', title: 'Large font without unicode-range (no subsetting by script)' },
  'font-no-preconnect': { severity: 'info', title: 'Third-party font host without preconnect' },
};
const kb = (n) => `${Math.round(n / 1024)} KB`;
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const lineAt = (s, i) => s.slice(0, i).split('\n').length;
const decl = (body, prop) => { const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, 'i').exec(body); return m ? m[1].trim() : null; };
const familyList = (v) => String(v || '').split(',').map((f) => f.trim().replace(/^["']|["']$/g, '').toLowerCase()).filter(Boolean);
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', '-apple-system', 'blinkmacsystemfont', 'revert']);
const WEIGHT = { normal: 400, bold: 700, lighter: 300, bolder: 700 };
const weightsOf = (v) => { if (!v) return [400]; const p = String(v).trim().split(/\s+/).map((x) => WEIGHT[x] ?? Number(x)).filter(Number.isFinite); return p.length === 2 ? [p[0], p[1]] : p.length ? [p[0]] : [400]; };

/** Parse CSS into @font-face rules and the font families/weights/styles used. */
export function parseCss(css, file = '') {
  css = stripComments(css); const faces = []; const used = { families: new Set(), weights: new Set(), italic: false }; const imports = [];
  const re = /@font-face\s*\{([^}]*)\}/gi; let m;
  while ((m = re.exec(css))) {
    const body = m[1]; const src = decl(body, 'src') || ''; const urls = [...src.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)\s*(?:format\(\s*['"]?([\w-]+)['"]?\s*\))?/gi)].map((u) => ({ url: u[2], format: (u[3] || (/\.(woff2|woff|ttf|otf|eot|svg)(\?|#|$)/i.exec(u[2])?.[1]) || '').toLowerCase().replace('truetype', 'ttf').replace('opentype', 'otf').replace('embedded-opentype', 'eot') }));
    faces.push({ family: familyList(decl(body, 'font-family'))[0], display: (decl(body, 'font-display') || '').toLowerCase() || null, weight: weightsOf(decl(body, 'font-weight')), style: (decl(body, 'font-style') || 'normal').toLowerCase().split(/\s/)[0], unicodeRange: decl(body, 'unicode-range'), urls, file, line: lineAt(css, m.index) });
  }
  const rest = css.replace(re, '');
  for (const d of rest.matchAll(/(?:^|[;{\s])font-family\s*:\s*([^;}]+)/gi)) for (const f of familyList(d[1].replace(/!important/i, ''))) used.families.add(f);
  for (const d of rest.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/gi)) { const v = d[1]; const fam = /(?:\d+(?:\.\d+)?(?:px|r?em|%|pt|vw|vh|ch|ex)|xx?-small|small|medium|xx?-large|large|smaller|larger)(?:\s*\/\s*[\w.]+)?\s+(.+)$/.exec(v)?.[1]; for (const f of familyList(fam)) used.families.add(f); const w = /\b(bold|bolder|lighter|[1-9]00)\b/.exec(v); used.weights.add(w ? (WEIGHT[w[1]] ?? +w[1]) : 400); if (/\bitalic|oblique\b/.test(v)) used.italic = true; }
  for (const d of rest.matchAll(/font-weight\s*:\s*([^;}]+)/gi)) { const w = d[1].trim().replace(/!important/i, '').trim(); const n = WEIGHT[w] ?? Number(w); if (Number.isFinite(n)) used.weights.add(n); else if (/var\(/.test(w)) used.weights.add('*'); }
  for (const d of rest.matchAll(/--[\w-]+\s*:\s*([1-9]00|bold)\b/gi)) used.weights.add(WEIGHT[d[1]] ?? +d[1]);
  for (const d of rest.matchAll(/--[\w-]+\s*:\s*([^;}]+)/gi)) if (/['"]|,\s*(sans-serif|serif|monospace)/.test(d[1])) for (const f of familyList(d[1])) used.families.add(f);
  if (/font-style\s*:\s*(italic|oblique)/i.test(rest)) used.italic = true;
  for (const im of rest.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi)) imports.push(im[1]);
  return { faces, used, imports };
}

function analyze(site, opts, config) {
  const { findings, add } = finder(RULES);
  const budget = opts.maxPayload ?? config.maxPayload ?? 300 * 1024; const maxFile = opts.maxFile ?? config.maxFile ?? 100 * 1024; const maxFaces = config.maxFaces ?? 6; const maxPreloads = config.maxPreloads ?? 3;
  const cssCache = new Map(); const sizeCache = new Map(); const reported = new Set();
  const once = (rule, key, ...a) => { const k = `${rule}|${key}`; if (reported.has(k)) return; reported.add(k); add(rule, ...a); };
  const relOf = (u) => { if (!u || !site.isInternal(u)) return null; let p = u.pathname; if (site.basePath && p.startsWith(site.basePath)) p = p.slice(site.basePath.length); try { p = decodeURIComponent(p); } catch { /* keep */ } return p.replace(/^\/+/, ''); };
  const size = (rel) => { if (!sizeCache.has(rel)) { let s = null; try { s = statSync(join(site.dir, rel)).size; } catch { /* missing */ } sizeCache.set(rel, s); } return sizeCache.get(rel); };
  const loadCss = (rel, depth = 0) => { if (cssCache.has(rel)) return cssCache.get(rel); cssCache.set(rel, null); const t = site.read(rel); if (t == null) return null; const p = parseCss(t, rel); p.base = new URL('/' + rel, 'http://site.invalid/'); p.children = depth < 3 ? p.imports.map((i) => { try { const u = new URL(i, p.base); return u.origin === 'http://site.invalid' ? loadCss(u.pathname.slice(1), depth + 1) : { external: u.href }; } catch { return null; } }).filter(Boolean) : []; cssCache.set(rel, p); return p; };
  const allUsed = { families: new Set(), weights: new Set(), italic: false }; const allFaces = []; let pagesWithFonts = 0;
  const bold = site.pages.some((pg) => pg.doc.all.some((e) => /^(h[1-6]|b|strong|th)$/.test(e.tag))); const ital = site.pages.some((pg) => pg.doc.all.some((e) => /^(em|i|cite)$/.test(e.tag)));
  for (const pg of site.pages) {
    const sheets = []; const external = [];
    for (const l of pg.doc.links) if (l.rel.includes('stylesheet') && l.href) { const u = site.resolve(pg, l.href); const rel = relOf(u); if (rel) { const c = loadCss(rel); if (c) sheets.push(c); } else if (u) external.push({ href: u.href, line: l.line }); }
    for (const st of pg.doc.find('style')) { const c = parseCss(st.rawText || '', pg.file); c.inline = true; c.lineOffset = st.line - 1; c.base = new URL(pg.path, 'http://site.invalid/'); c.children = c.imports.map((i) => { try { const u = new URL(i, c.base); return u.origin === 'http://site.invalid' ? loadCss(u.pathname.slice(1)) : { external: u.href }; } catch { return null; } }).filter(Boolean); sheets.push(c); }
    for (const e of pg.doc.all) if (e.attrs.style) { const c = parseCss(`x{${e.attrs.style}}`); for (const f of c.used.families) allUsed.families.add(f); for (const w of c.used.weights) allUsed.weights.add(w); }
    const flat = []; const walkS = (s) => { if (!s) return; if (s.external) { external.push({ href: s.external }); return; } flat.push(s); for (const c of s.children || []) walkS(c); }; sheets.forEach(walkS);
    for (const ex of external) { if (/fonts\.googleapis\.com\/css/.test(ex.href) && !/[?&]display=(swap|optional|fallback)/.test(ex.href)) once('font-google-display', ex.href, ex.href, `Google Fonts stylesheet without display=swap: ${ex.href.slice(0, 120)}`, 'Append &display=swap (or optional) so text renders with a fallback font while loading.', { file: pg.file, line: ex.line }); }
    const fontHosts = new Set(external.map((x) => { try { const h = new URL(x.href).hostname; return /fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net|fast\.fonts\.net|use\.fontawesome\.com/.test(h) ? h : null; } catch { return null; } }).filter(Boolean));
    if (fontHosts.has('fonts.googleapis.com')) fontHosts.add('fonts.gstatic.com');
    const preconnected = new Set(pg.doc.links.filter((l) => l.rel.includes('preconnect') || l.rel.includes('dns-prefetch')).map((l) => { try { return new URL(l.href, 'https://x.invalid').hostname; } catch { return ''; } }));
    for (const h of fontHosts) if (!preconnected.has(h)) once('font-no-preconnect', `${pg.file}|${h}`, h, `${pg.path} loads fonts from ${h} without <link rel="preconnect">`, `Add <link rel="preconnect" href="https://${h}"${h === 'fonts.gstatic.com' ? ' crossorigin' : ''}>, or self-host the fonts.`, { file: pg.file });
    const faces = []; for (const s of flat) { for (const f of s.faces) { const urls = f.urls.map((u) => { let abs = null; try { abs = new URL(u.url, s.base); } catch { /* bad */ } const rel = abs && abs.origin === 'http://site.invalid' ? decodeURIComponent(abs.pathname.slice(1)) : null; return { ...u, rel }; }); faces.push({ ...f, urls, sheet: s, line: s.inline ? f.line + s.lineOffset : f.line }); } for (const x of s.used.families) allUsed.families.add(x); for (const w of s.used.weights) allUsed.weights.add(w); if (s.used.italic) allUsed.italic = true; }
    const preloads = pg.doc.links.filter((l) => l.rel.includes('preload') && (l.el?.attrs?.as === 'font' || /\.(woff2?|ttf|otf)(\?|$)/i.test(l.href || '')));
    const preloadEls = pg.doc.find('link').filter((e) => /\bpreload\b/i.test(e.attrs.rel || '') && (e.attrs.as === 'font' || /\.(woff2?|ttf|otf)(\?|$)/i.test(e.attrs.href || '')));
    const faceFiles = new Set(faces.flatMap((f) => f.urls.map((u) => u.rel).filter(Boolean)));
    for (const e of preloadEls) {
      const u = site.resolve(pg, e.attrs.href); const rel = relOf(u); const loc = { file: pg.file, line: e.line };
      if (e.attrs.crossorigin == null) add('font-preload-no-crossorigin', e.attrs.href, `${pg.path}: <link rel="preload" href="${e.attrs.href}"> has no crossorigin`, 'Add crossorigin (fonts are always fetched in CORS mode, so the preload is wasted otherwise).', loc);
      if (rel && faces.length && !faceFiles.has(rel)) add('font-preload-unused', e.attrs.href, `${pg.path}: preloaded ${e.attrs.href} is not referenced by any @font-face on this page`, 'Remove the preload or point it at the WOFF2 the @font-face actually uses.', loc);
    }
    if (preloadEls.length > maxPreloads) add('font-too-many-preloads', pg.path, `${pg.path} preloads ${preloadEls.length} fonts`, `Preload only the 1–2 fonts used above the fold (max ${maxPreloads}).`, { file: pg.file });
    void preloads;
    if (!faces.length) continue; pagesWithFonts++;
    allFaces.push(...faces);
    const selfHosted = faces.filter((f) => f.urls.some((u) => u.rel));
    if (selfHosted.length && !preloadEls.length && config.requirePreload !== false) once('font-not-preloaded', pg.file, pg.path, `${pg.path} uses ${selfHosted.length} self-hosted @font-face rule(s) but preloads none`, 'Preload the main text font: <link rel="preload" href="/fonts/x.woff2" as="font" type="font/woff2" crossorigin>.', { file: pg.file });
    // payload: the first (preferred) available source of each face
    let total = 0; const files = new Set();
    for (const f of faces) { const pick = f.urls.find((u) => u.rel && size(u.rel) != null); if (pick && !files.has(pick.rel)) { files.add(pick.rel); total += size(pick.rel); } }
    if (total > budget) add('font-payload', pg.path, `${pg.path} declares ${files.size} font file(s) totalling ${kb(total)} (budget ${kb(budget)})`, 'Drop unused weights, use a variable font, subset to the scripts you need.', { file: pg.file });
    if (files.size > maxFaces) add('font-too-many-faces', pg.path, `${pg.path} declares ${files.size} font files`, `Keep it to about ${maxFaces}: fewer weights/styles or one variable font.`, { file: pg.file });
  }
  // face-level checks (once per @font-face location)
  for (const f of allFaces) {
    const key = `${f.file}:${f.line}`; const loc = { file: f.file, line: f.line }; const name = f.family || '(no family)';
    if (!f.display || f.display === 'block' || f.display === 'auto') once('font-display-missing', key, name, `@font-face "${name}" ${f.display ? `uses font-display: ${f.display}` : 'has no font-display'}`, 'Add font-display: swap (body text) or optional (to avoid layout shift).', loc);
    const local = f.urls.filter((u) => u.rel || !/^https?:/i.test(u.url));
    if (local.length && !f.urls.some((u) => u.format === 'woff2')) once('font-no-woff2', key, name, `@font-face "${name}" offers ${[...new Set(f.urls.map((u) => u.format || '?'))].join(', ')} but no WOFF2`, 'Convert to WOFF2 (about 30% smaller than WOFF, 50%+ smaller than TTF) and list it first.', loc);
    for (const u of f.urls) { if (!u.rel) continue; const s = size(u.rel); if (s == null) continue; if (s > maxFile && (u.format === 'woff2' || u === f.urls[0])) once('font-heavy', u.rel, u.rel, `${u.rel} is ${kb(s)}`, 'Subset to the characters you use (e.g. glyphhanger, pyftsubset) or split by unicode-range.', loc); if (s > maxFile && !f.unicodeRange) once('font-no-unicode-range', u.rel, u.rel, `${u.rel} (${kb(s)}) has no unicode-range`, 'Split into per-script subsets with unicode-range so pages only download what they render.', loc); break; }
    if (f.family && !allUsed.families.has(f.family)) once('font-unused-face', `fam|${f.family}`, name, `@font-face "${name}" is never used in font-family`, 'Remove the @font-face (and its preload) or use it.', loc);
    else if (f.family && !allUsed.weights.has('*')) {
      const [lo, hi = lo] = f.weight; const usedW = new Set([400, ...allUsed.weights, ...(bold ? [700] : [])]);
      if (lo === hi && !usedW.has(lo)) once('font-unused-weight', key, `${name} ${lo}`, `@font-face "${name}" weight ${lo} is never used`, 'Remove this weight, or use a variable font.', loc);
      else if (f.style === 'italic' && !allUsed.italic && !ital) once('font-unused-weight', key, `${name} italic`, `@font-face "${name}" italic is never used`, 'Remove the italic face.', loc);
    }
  }
  const faceFiles = new Set(allFaces.flatMap((f) => f.urls.map((u) => u.rel).filter(Boolean)));
  return { findings, info: { fontFaces: allFaces.length, fontFiles: faceFiles.size }, summary: `${site.pages.length} page(s), ${pagesWithFonts} with web fonts, ${faceFiles.size} font file(s)` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'font-pulse', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🔤', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
