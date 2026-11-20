import { join } from 'node:path';
import { StudioError } from '../core/errors.ts';
import { renderFilm } from '../render/render.ts';
import { canonicalSha256 } from '../core/hash.ts';

/** npm run render -- <film.json> [--out <dir>] */
const args = process.argv.slice(2);
const film = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
if (!film) {
  console.error('usage: npm run render -- <film.json> [--out <dir>]');
  process.exit(2);
}
try {
  const id = film.split('/').pop()!.replace(/\.json$/, '');
  const out = outIdx >= 0 ? args[outIdx + 1]! : join('out', id);
  const m = await renderFilm(film, 'assets', out);
  console.log(`OK ${out}/film.mp4 ${m.output.frames} frames sha256=${m.mp4.sha256}`);
  console.log(`sceneFrames sha256=${canonicalSha256(m.sceneFrameSha256)}`);
} catch (e) {
  console.error(e instanceof StudioError ? e.message : e);
  process.exit(1);
}
