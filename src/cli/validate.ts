import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, StudioError } from '../core/errors.ts';
import { validateAction } from '../schema/action.ts';
import { loadArtPack } from '../schema/art-pack.ts';
import { loadFilm } from '../schema/film.ts';
import { validateRig } from '../schema/rig.ts';
import { validateState } from '../schema/state.ts';

const ASSETS = 'assets';
const FILMS = 'examples/films';

const jsonFiles = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f)) : []);

/** Validate toàn bộ dữ liệu trong repo. Dừng ở lỗi đầu tiên, exit 1. */
function main(): void {
  validateState(readJsonFile('docs/STATE.json'));
  console.log('OK docs/STATE.json');

  const packs = existsSync(ASSETS) ? readdirSync(ASSETS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const name of packs) {
    const dir = join(ASSETS, name);
    const pack = loadArtPack(dir);
    if (pack.id !== name) throw new StudioError('ART_SCHEMA', `${dir}/manifest.json`, `pack id "${pack.id}" must equal folder name "${name}"`);
    console.log(`OK ${dir} (${pack.assets.size} assets, manifest ${pack.manifestSha256})`);
    const rigFile = join(dir, 'rig.json');
    const actions = jsonFiles(join(dir, 'actions'));
    if (!existsSync(rigFile)) {
      if (actions.length > 0) throw new StudioError('RIG_SCHEMA', rigFile, 'pack has actions but no rig.json');
      continue;
    }
    const rig = validateRig(readJsonFile(rigFile), pack);
    console.log(`OK ${rigFile} (${rig.order.length} bones, ${rig.characters.size} characters)`);
    for (const f of actions) {
      validateAction(readJsonFile(f), rig);
      console.log(`OK ${f}`);
    }
  }

  for (const f of jsonFiles(FILMS)) {
    const film = loadFilm(f, ASSETS);
    if (`${film.data.id}.json` !== f.split('/').pop()) throw new StudioError('FILM_SCHEMA', f, `film id "${film.data.id}" must equal file name`);
    console.log(`OK ${f}`);
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof StudioError ? e.message : e);
  process.exit(1);
}
