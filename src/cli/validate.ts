import { readJsonFile, StudioError } from '../core/errors.ts';
import { validateState } from '../schema/state.ts';

/** Validate toàn bộ dữ liệu trong repo. Dừng ở lỗi đầu tiên, exit 1. */
function main(): void {
  const checked: string[] = [];
  validateState(readJsonFile('docs/STATE.json'));
  checked.push('docs/STATE.json');
  for (const f of checked) console.log(`OK ${f}`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof StudioError ? e.message : e);
  process.exit(1);
}
