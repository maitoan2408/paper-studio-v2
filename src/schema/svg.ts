import { fail } from '../core/errors.ts';

/**
 * Kiểm SVG theo allowlist trước khi đưa vào Chromium. Không dùng XML parser:
 * tách từng thẻ bằng regex chặt; còn sót bất kỳ '<' nào chưa tách được thì từ chối (fail closed).
 */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'use', 'symbol',
  'filter', 'feblend', 'fecolormatrix', 'fecomposite', 'fedropshadow', 'feflood', 'fegaussianblur',
  'femerge', 'femergenode', 'feoffset', 'feturbulence', 'fedisplacementmap', 'fecomponenttransfer',
  'fefunca', 'fefuncr', 'fefuncg', 'fefuncb', 'femorphology',
]);

const ATTR = /\s+([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/y;
const OPEN_TAG = /<([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
const CLOSE_TAG = /<\/([A-Za-z][\w:.-]*)\s*>/g;

export interface SvgInfo {
  viewBox: [number, number, number, number];
}

export function checkSvg(text: string, where: string): SvgInfo {
  const bad = (detail: string): never => fail('ART_SVG_UNSAFE', where, detail);

  let body = text.replace(/^﻿/, '');
  body = body.replace(/^\s*<\?xml\s[^?]*\?>/, '');
  if (/<!\[CDATA\[|<!DOCTYPE|<!ENTITY|<\?/i.test(body)) bad('CDATA, DOCTYPE, ENTITY and processing instructions are not allowed');
  body = body.replace(/<!--[\s\S]*?-->/g, '');

  let root: Record<string, string> | undefined;
  const rest = body
    .replace(OPEN_TAG, (_m, rawName: string, rawAttrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_ELEMENTS.has(name)) bad(`element <${rawName}> is not allowed`);
      const attrs = parseAttrs(rawAttrs, bad);
      for (const [k, v] of Object.entries(attrs)) {
        const key = k.toLowerCase();
        if (key.startsWith('on')) bad(`event attribute ${k} is not allowed`);
        if ((key === 'href' || key === 'xlink:href') && !v.startsWith('#')) bad(`external ${k}="${v}" is not allowed`);
        if (/url\(\s*['"]?(?!#)/i.test(v)) bad(`non-local url() in ${k}`);
        if (/@import|expression\s*\(/i.test(v)) bad(`forbidden construct in ${k}`);
      }
      if (name === 'svg' && root === undefined) root = attrs;
      return '';
    })
    .replace(CLOSE_TAG, (_m, rawName: string) => {
      if (!ALLOWED_ELEMENTS.has(rawName.toLowerCase())) bad(`element </${rawName}> is not allowed`);
      return '';
    });
  if (rest.includes('<')) bad('unparseable markup');
  if (!root) return bad('missing <svg> root');

  const vb = (root['viewBox'] ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => !Number.isFinite(n))) bad('root <svg> must have a numeric viewBox');
  return { viewBox: vb as [number, number, number, number] };
}

function parseAttrs(raw: string, bad: (d: string) => never): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR.lastIndex = 0;
  while (ATTR.lastIndex < raw.length) {
    const start = ATTR.lastIndex;
    const m = ATTR.exec(raw);
    if (!m) {
      if (raw.slice(start).trim() === '') break;
      bad('malformed attributes');
    }
    const key = m[1] as string;
    if (key in out) bad(`duplicate attribute ${key}`);
    out[key] = m[2] ?? m[3] ?? '';
  }
  return out;
}
