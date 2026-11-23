import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DROP_FIXTURES, dropFixture } from '../physics/drop-fixtures.ts';

/** node src/cli/drop-fixture.ts <tên> <out.json> — ghi phim fixture thả tự do (biến thể dữ liệu của m3-drop) để render. */
const [name, out] = process.argv.slice(2);
if (!name || !out) {
  console.error(`usage: node src/cli/drop-fixture.ts <${Object.keys(DROP_FIXTURES).join('|')}> <out.json>`);
  process.exit(2);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(dropFixture(name), null, 2) + '\n');
console.log(`OK ${out}`);
