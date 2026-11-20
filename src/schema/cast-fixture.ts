/** Fixture có nhân vật: pack nền + pack rig (2 nhân vật) với 2 clip (breath, wave). Dùng cho test film/motion. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadArtPack, type ArtPack } from './art-pack.ts';
import { loadPackMotion, validateFilm } from './film.ts';
import { rigFixture } from './rig-fixture.ts';
import { makePack } from './test-helpers.ts';

export const breathClip = () => ({
  schemaVersion: 1, id: 'breath', rig: 'biped-test',
  channels: [
    { bone: 'torso', prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'inOutSine' }, { t: 0.5, v: 2, ease: 'inOutSine' }, { t: 1, v: 0 }] },
    { bone: 'pelvis', prop: 'rootY', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'inOutSine' }, { t: 0.5, v: 3, ease: 'inOutSine' }, { t: 1, v: 0 }] },
  ],
  events: [], requires: {},
});
export const waveClip = () => ({
  schemaVersion: 1, id: 'wave', rig: 'biped-test',
  channels: [
    { bone: 'upper-arm.@active', prop: 'rotation', mode: 'offset', keys: [{ t: 0, v: 0, ease: 'inOutSine' }, { t: 0.3, v: 120, ease: 'linear' }, { t: 0.7, v: 120, ease: 'inOutSine' }, { t: 1, v: 0 }] },
    { bone: 'hand.@active', prop: 'variant', mode: 'absolute', keys: [{ t: 0, v: 'default' }, { t: 0.25, v: 'fist', ease: 'step' }, { t: 0.8, v: 'default', ease: 'step' }] },
  ],
  events: [], requires: { hands: ['hand.@active'] },
});

export function castFixture(clips: Record<string, unknown> = { breath: breathClip(), wave: waveClip() }) {
  const stage = makePack([{ id: 'sky', w: 2400, h: 1200, category: 'background' }], 'pack-a');
  const stagePack = loadArtPack(stage.dir);
  const r = rigFixture();
  const dir = r.packFixture.dir;
  writeFileSync(join(dir, 'rig.json'), JSON.stringify(r.rig));
  mkdirSync(join(dir, 'actions'), { recursive: true });
  for (const [id, c] of Object.entries(clips)) writeFileSync(join(dir, 'actions', `${id}.json`), JSON.stringify(c));
  const castPack = loadArtPack(dir);
  const film = {
    schemaVersion: 1,
    id: 'cast',
    output: { width: 1920, height: 1080, fps: 24, durationFrames: 96 },
    packs: [
      { id: 'pack-a', version: '0.1.0', manifestSha256: stagePack.manifestSha256 },
      { id: 'test-pack', version: '0.1.0', manifestSha256: castPack.manifestSha256 },
    ],
    stage: { layers: [{ id: 'bg', asset: 'sky', x: 0, y: -60, scale: 1, rotation: 0, depth: 8 }], surfaces: [{ id: 'floor', y: 0, x0: -900, x1: 900 }] },
    props: [] as any[],
    characters: [
      { id: 'c1', pack: 'test-pack', rig: 'biped-test', character: 'stout', x: -200, scale: 1, depth: 1, facing: 'right', on: 'floor' },
      { id: 'c2', pack: 'test-pack', rig: 'biped-test', character: 'lanky', x: 200, scale: 1.2, depth: 1, facing: 'left', on: 'floor' },
    ] as any[],
    camera: { keys: [{ frame: 0, x: 0, y: 400, zoom: 1 }] },
    timeline: [
      { character: 'c1', clip: 'breath', start: 0, durationFrames: 96, bind: {}, repeat: 2 },
      { character: 'c2', clip: 'breath', start: 0, durationFrames: 96, bind: {}, repeat: 3 },
      { character: 'c1', clip: 'wave', start: 10, durationFrames: 64, bind: { active: 'l' }, layer: 1, blendIn: 4, blendOut: 4 },
      { character: 'c2', clip: 'wave', start: 30, durationFrames: 60, bind: { active: 'r' }, layer: 1, blendIn: 4, blendOut: 4 },
    ] as any[],
    physics: [] as unknown[],
  };
  const packs = new Map<string, ArtPack>([['pack-a', stagePack], ['test-pack', castPack]]);
  const validate = (data: unknown = film) => {
    const m = loadPackMotion(castPack);
    return validateFilm(data, packs, new Map([['test-pack', m.rig!]]), new Map([['test-pack', m.clips]]));
  };
  return { film, validate, castPack };
}
