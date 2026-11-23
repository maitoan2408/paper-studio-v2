import { readFileSync } from 'node:fs';
import { loadFilm, type Film } from '../schema/film.ts';
import { simulateDrop } from '../physics/drop.ts';
import { DROP_FIXTURES, dropFixture } from '../physics/drop-fixtures.ts';

/**
 * node src/cli/drop-trace.ts <fixture|m3-drop> [fromFrame] [toFrame] [--json]
 * In diễn biến mô phỏng thả tự do (kể cả khi bake bị từ chối): dữ liệu fixture trên art/rig/clip đã nạp của m3-drop —
 * cùng cách với helper `unbaked` trong src/physics/drop.test.ts. Chỉ để kiểm tra/bàn giao, không dùng khi render.
 */
const args = process.argv.slice(2);
const json = args.includes('--json');
const [name, from, to] = args.filter((a) => a !== '--json');
if (!name || (name !== 'm3-drop' && !DROP_FIXTURES[name])) {
  console.error(`usage: node src/cli/drop-trace.ts <m3-drop|${Object.keys(DROP_FIXTURES).join('|')}> [from] [to] [--json]`);
  process.exit(2);
}
const base = loadFilm('examples/films/m3-drop.json', 'assets');
const data = name === 'm3-drop' ? JSON.parse(readFileSync('examples/films/m3-drop.json', 'utf8')) : dropFixture(name);
const film: Film = { ...base, data };
const d = simulateDrop(film, data.physics[0]);
const a = from ? Number(from) : d.releaseFrame, z = to ? Number(to) : Infinity;
const poses = d.poses.filter((q) => q.frame >= a && q.frame <= z);
if (json) {
  console.log(JSON.stringify({ ...d, poses }));
} else {
  console.log(`${name}: release f${d.releaseFrame} v0=(${d.init.velocity.map((x) => x.toFixed(2)).join(', ')}) firstContact=${JSON.stringify(d.firstContact)} lastSupported=f${d.lastSupported} rest=f${d.restFrame} miss=f${d.missFrame}`);
  console.log('frame\tx\ty\tvx\tvy\tangle\tspin\tsep\ttouch\tsupp\tstate');
  for (const q of poses) {
    console.log([q.frame, q.x.toFixed(2), q.y.toFixed(2), q.vx.toFixed(2), q.vy.toFixed(2), q.angle.toFixed(2), q.spin.toFixed(1), q.separation === null ? '-' : q.separation.toFixed(2), q.touching ? 'T' : '-', q.supported ? 'S' : '-', q.state].join('\t'));
  }
}
