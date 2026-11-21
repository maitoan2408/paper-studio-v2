import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { StudioError } from '../core/errors.ts';
import { auditRender } from '../audit/audit.ts';

/** npm run audit -- <out/<film>/render-manifest.json> [--seed <hex8>] */
const args = process.argv.slice(2);
const manifest = args.find((a) => !a.startsWith('--') && !/^[0-9a-f]{8}$/.test(a));
const seedIdx = args.indexOf('--seed');
if (!manifest) {
  console.error('usage: npm run audit -- <render-manifest.json> [--seed <hex8>]');
  process.exit(2);
}
try {
  const r = await auditRender(manifest, 'assets', 'config/audit.json', seedIdx >= 0 ? args[seedIdx + 1] : undefined);
  writeFileSync(join(dirname(manifest), 'audit-report.json'), JSON.stringify(r, null, 2) + '\n');
  console.log(`AUDIT ${r.status} seed=${r.seed} frames=[${r.frames}] minPSNR=${Math.min(...Object.values(r.psnrDb)).toFixed(2)} dB (>= ${r.minPsnrDb})`);
} catch (e) {
  console.error(`AUDIT FAIL ${e instanceof StudioError ? e.message : e}`);
  process.exit(1);
}
