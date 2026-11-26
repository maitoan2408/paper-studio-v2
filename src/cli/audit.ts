import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StudioError } from '../core/errors.ts';
import { auditRender } from '../audit/audit.ts';

/** npm run audit -- <out/<film>/render-manifest.json> [--seed <hex8>] [--assets <dir>] */
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const flagValues = new Set(['--seed', '--assets'].map((f) => args.indexOf(f) + 1).filter((i) => i > 0));
const manifest = args.find((a, i) => !a.startsWith('--') && !flagValues.has(i));
const assets = flag('--assets') ?? 'assets';
if (!manifest) {
  console.error('usage: npm run audit -- <render-manifest.json> [--seed <hex8>] [--assets <dir>]');
  process.exit(2);
}
try {
  const r = await auditRender(manifest, assets, 'config/audit.json', flag('--seed'));
  writeFileSync(join(dirname(manifest), 'audit-report.json'), JSON.stringify(r, null, 2) + '\n');
  console.log(`AUDIT ${r.status} seed=${r.seed} frames=[${r.frames}] minPSNR=${Math.min(...Object.values(r.psnrDb)).toFixed(2)} dB (>= ${r.minPsnrDb}) bake=${r.bakeSha256 ?? 'none'}`);
} catch (e) {
  console.error(`AUDIT FAIL ${e instanceof StudioError ? e.message : e}`);
  process.exit(1);
}
