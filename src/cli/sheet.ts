/**
 * npm run sheet -- sheets/<id>.json [--out DIR] [--before PACK=DIR ... --before-label TEXT] [--label TEXT]
 * Không có --before: một bản (pack trong assets/). Có --before: mỗi ô là cặp trước (pack từ DIR) | sau (assets/).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, StudioError } from '../core/errors.ts';
import { sha256Hex } from '../core/hash.ts';
import { parseSheet } from '../sheet/spec.ts';
import { renderSheet, type Edition } from '../sheet/render.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1]!.startsWith('--')));
  if (!file) throw new StudioError('SHEET_ARGS', 'argv', 'usage: sheet <sheets/x.json> [--out DIR] [--before PACK=DIR] [--before-label T] [--label T]');
  const opt = (k: string) => args.flatMap((a, i) => (a === k ? [args[i + 1]!] : []));
  const spec = parseSheet(readJsonFile(file));
  const before = new Map(opt('--before').map((kv) => {
    const [k, v] = kv.split('=');
    if (!k || !v) throw new StudioError('SHEET_ARGS', '--before', `expected PACK=DIR, got "${kv}"`);
    return [k, v] as const;
  }));
  const after: Edition = { label: opt('--label')[0] ?? 'repo (assets/)', overrides: new Map() };
  const editions: Edition[] = before.size > 0 ? [{ label: opt('--before-label')[0] ?? `trước (${[...before].map(([k, v]) => `${k}=${v}`).join(', ')})`, overrides: before }, after] : [after];
  const out = opt('--out')[0] ?? join('out', 'sheets', spec.id);
  const r = await renderSheet(spec, editions, out, sha256Hex(readFileSync(file)));
  for (const f of r.files) console.log(`OK ${f}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof StudioError ? e.message : e);
  process.exit(1);
});
