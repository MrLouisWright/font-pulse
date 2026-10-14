#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, SITE_OPTIONS, SITE_HELP } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'font-pulse', version: pkg.version, configKey: 'fontPulse', rules: RULES,
  tagline: 'audit web font loading in your built site',
  usage: 'Usage: font-pulse [site-dir] [options]',
  help: `${SITE_HELP}Fonts
      --max-payload-kb <n>     Font budget per page in KB (default 300)
      --max-file-kb <n>        Size above which a font file should be subset, in KB (default 100)
`,
  options: { ...SITE_OPTIONS, 'max-payload-kb': { type: 'string' }, 'max-file-kb': { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => check(dir, { cli: o, maxPayload: o['max-payload-kb'] != null ? Number(o['max-payload-kb']) * 1024 : undefined, maxFile: o['max-file-kb'] != null ? Number(o['max-file-kb']) * 1024 : undefined, toolVersion: pkg.version }, config, configFile),
});
