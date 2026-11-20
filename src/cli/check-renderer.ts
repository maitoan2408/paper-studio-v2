import { mkdirSync, writeFileSync } from 'node:fs';
import { StudioError } from '../core/errors.ts';
import { checkRenderer } from '../render/check-renderer.ts';

try {
  const results = await checkRenderer();
  mkdirSync('out/check-renderer', { recursive: true });
  const failed = results.filter((r) => r.status !== 'PASS');
  const status = failed.length === 0 ? 'PASS_TECHNICAL' : 'FAIL';
  writeFileSync('out/check-renderer/report.json', JSON.stringify({ status, results }, null, 2) + '\n');
  console.log(`check:renderer ${status} (${results.length - failed.length}/${results.length})`);
  process.exit(failed.length === 0 ? 0 : 1);
} catch (e) {
  console.error(e instanceof StudioError ? e.message : e);
  process.exit(1);
}
