import { loadArtPack } from './art-pack.ts';
import { makePack, type AssetSpec } from './test-helpers.ts';

/** Hai nhân vật cùng kiểu rig, khác số đo: "stout" (thấp đậm) và "lanky" (cao gầy). */
export function rigFixture() {
  const body = (p: string, s: { torsoH: number; armL: number; farmL: number }): AssetSpec[] => [
    { id: `${p}-pelvis`, w: 80, h: 40, pivot: [40, 40] as [number, number], anchors: { waist: [40, 5] as [number, number] }, category: 'body' },
    { id: `${p}-torso`, w: 100, h: s.torsoH, pivot: [50, s.torsoH] as [number, number],
      anchors: { 'shoulder.l': [15, 10] as [number, number], 'shoulder.r': [85, 10] as [number, number] }, category: 'body' },
    { id: `${p}-uarm`, w: 30, h: s.armL + 10, pivot: [15, 5] as [number, number], anchors: { elbow: [15, s.armL + 5] as [number, number] }, category: 'body' },
    { id: `${p}-farm`, w: 26, h: s.farmL + 10, pivot: [13, 5] as [number, number], anchors: { wrist: [13, s.farmL + 5] as [number, number] }, category: 'body' },
    { id: `${p}-hand`, w: 30, h: 30, pivot: [15, 3] as [number, number], anchors: { grip: [15, 18] as [number, number] }, category: 'hand' },
    { id: `${p}-hand-fist`, w: 26, h: 24, pivot: [13, 3] as [number, number], anchors: { grip: [13, 14] as [number, number] }, category: 'hand' },
  ];
  const pack = makePack([
    ...body('stout', { torsoH: 120, armL: 70, farmL: 60 }),
    ...body('lanky', { torsoH: 190, armL: 110, farmL: 100 }),
  ]);
  const limits = (min: number, max: number) => ({ min, max });
  const sideBones = (s: 'l' | 'r') => [
    { id: `upper-arm.${s}`, parent: 'torso', attach: `shoulder.${s}`, limits: limits(-170, 170), z: s === 'l' ? -1 : 2 },
    { id: `forearm.${s}`, parent: `upper-arm.${s}`, attach: 'elbow', limits: limits(-150, 0), z: s === 'l' ? -1 : 2 },
    { id: `hand.${s}`, parent: `forearm.${s}`, attach: 'wrist', limits: limits(-60, 60), z: s === 'l' ? -1 : 2 },
  ];
  const character = (p: string) => ({
    id: p,
    skin: {
      pelvis: { default: `${p}-pelvis` },
      torso: { default: `${p}-torso` },
      ...Object.fromEntries((['l', 'r'] as const).flatMap((s) => [
        [`upper-arm.${s}`, { default: `${p}-uarm` }],
        [`forearm.${s}`, { default: `${p}-farm` }],
        [`hand.${s}`, { default: `${p}-hand`, variants: { fist: `${p}-hand-fist` } }],
      ])),
    } as Record<string, { default: string; variants?: Record<string, string> }>,
    rest: { pelvis: 0, torso: 0, 'upper-arm.l': -5, 'upper-arm.r': 5, 'forearm.l': -10, 'forearm.r': -10, 'hand.l': 0, 'hand.r': 0 } as Record<string, number>,
  });
  const rig = {
    schemaVersion: 1,
    id: 'biped-test',
    sides: ['l', 'r'],
    bones: [
      { id: 'pelvis', parent: null, attach: null, limits: limits(-20, 20), z: 0 } as any,
      { id: 'torso', parent: 'pelvis', attach: 'waist', limits: limits(-15, 40), z: 1 },
      ...sideBones('l'),
      ...sideBones('r'),
    ],
    contacts: { 'grip.l': { bone: 'hand.l', anchor: 'grip' }, 'grip.r': { bone: 'hand.r', anchor: 'grip' } },
    ground: ['grip.l', 'grip.r'],
    characters: [character('stout'), character('lanky')],
  };
  return { pack: loadArtPack(pack.dir), rig, packFixture: pack };
}
