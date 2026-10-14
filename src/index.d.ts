import type { Report, Rule } from './core.js';
export * from './core.js';
export interface FontFace { family?: string; display: string | null; weight: number[]; style: string; unicodeRange: string | null; urls: Array<{ url: string; format: string }>; file: string; line: number }
export interface FontOptions { baseUrl?: string; include?: string[]; exclude?: string[]; cleanUrls?: boolean; maxPayload?: number; maxFile?: number; toolVersion?: string; now?: Date }
export declare const RULES: Record<string, Rule>;
export declare function parseCss(css: string, file?: string): { faces: FontFace[]; used: { families: Set<string>; weights: Set<number | '*'>; italic: boolean }; imports: string[] };
export declare function check(dir: string, opts?: FontOptions, config?: Record<string, unknown>, configFile?: string): Report;
