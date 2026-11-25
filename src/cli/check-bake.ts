/**
 * npm run check:bake -- <out/phim-có-physics>... --plain <out/phim-không-physics>
 * Kiểm bake vật lý QUA CLI AUDIT THẬT trên kết quả render thật (M3 việc 4). Mỗi ca: chép thư mục render sang thư mục tạm,
 * làm hỏng theo một cách, chạy `node src/cli/audit.ts <manifest>` (process riêng) và yêu cầu mã thoát 1 + đúng mã lỗi
 * (+ đường dẫn với ca băm lại). Ca hợp lệ của từng phim: vòng "render + audit" trong CI. Phim không physics: hạ manifest
 * về v1 (định dạng trước việc 4) ⇒ audit đầy đủ phải PASS.
 * Log mọi ca ra stdout (CI lưu vào out/check-bake.log).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
/* ca motion: bản sao assets với rig/action sửa — audit chạy với --assets <bản sao> */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadFilm } from '../schema/film.ts';
import { BAKE_FILE, bakeSha256, physicsBakeRecord } from '../physics/bake.ts';

const args = process.argv.slice(2);
const plainIdx = args.indexOf('--plain');
const physicsDirs = (plainIdx >= 0 ? args.slice(0, plainIdx) : args).filter((a) => !a.startsWith('--'));
const plainDirs = plainIdx >= 0 ? args.slice(plainIdx + 1) : [];
if (physicsDirs.length === 0) {
  console.error('usage: npm run check:bake -- <out/film-with-physics>... [--plain <out/film-without-physics>...]');
  process.exit(2);
}

let failures = 0;
const audit = (manifest: string, assets?: string) => {
  const r = spawnSync(process.execPath, ['src/cli/audit.ts', manifest, ...(assets ? ['--assets', assets] : [])], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}`.trim().split('\n').filter((l) => /^AUDIT /.test(l)).join(' ') };
};
const expectFail = (label: string, manifest: string, re: RegExp, assets?: string) => {
  const r = audit(manifest, assets);
  const ok = r.status === 1 && re.test(r.out);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: exit ${r.status} | ${r.out}`);
};
const copy = (dir: string) => {
  const t = mkdtempSync(join(tmpdir(), 'ps-check-bake-'));
  cpSync(dir, t, { recursive: true });
  return { dir: t, manifest: join(t, 'render-manifest.json'), bake: join(t, BAKE_FILE), assets: undefined as string | undefined };
};
/** Bản sao assets trong thư mục ca, sửa một file JSON motion của pack (rig.json / actions/<id>.json). */
const motionEdit = (c: ReturnType<typeof copy>, pack: string, rel: string, edit: (j: any) => void) => {
  const a = join(c.dir, 'assets-copy');
  cpSync('assets', a, { recursive: true });
  const p = join(a, pack, rel);
  const j = readJson(p);
  edit(j);
  writeJson(p, j);
  c.assets = a;
};
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 1) + '\n');

for (const src of physicsDirs) {
  const m0 = readJson(join(src, 'render-manifest.json'));
  if (!m0.physics?.bake) { console.log(`FAIL ${src}: manifest has no physics.bake`); failures++; continue; }
  const film = loadFilm(m0.film.path, 'assets');
  console.log(`== ${src} (${m0.film.id}) bake sha256=${m0.physics.bake.sha256}`);
  const cases: [string, (c: ReturnType<typeof copy>) => void, RegExp][] = [
    ['bake file missing', (c) => rmSync(c.bake), /AUDIT FAIL AUDIT_BAKE_FILE: .*physics-bake\.json — bake file is missing/],
    ['bake file corrupt (truncated JSON)', (c) => writeFileSync(c.bake, readFileSync(c.bake, 'utf8').slice(0, 200)), /AUDIT FAIL AUDIT_BAKE_FILE: .*not valid JSON/],
    ['pose edited, SHA not updated', (c) => { const b = readJson(c.bake); b.drops[0].poses[3].x += 0.25; writeJson(c.bake, b); }, /AUDIT FAIL AUDIT_BAKE_HASH: /],
    ['manifest physics set to null', (c) => { const m = readJson(c.manifest); m.physics = null; writeJson(c.manifest, m); }, /AUDIT FAIL AUDIT_BAKE_MISSING: /],
    ['manifest downgraded to v1 without physics', (c) => { const m = readJson(c.manifest); delete m.physics; m.schemaVersion = 1; writeJson(c.manifest, m); }, /AUDIT FAIL AUDIT_BAKE_MISSING: .*manifest v1/],
    ['stale bake (restitution changed) re-hashed into manifest', (c) => {
      const raw = readJson(m0.film.path);
      raw.physics[0].body.restitution = raw.physics[0].body.restitution === 0.2 ? 0.3 : 0.2;
      const p = join(c.dir, 'variant.json');
      writeJson(p, raw);
      const stale = physicsBakeRecord(loadFilm(p, 'assets'))!;
      writeJson(c.bake, stale);
      const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(stale); writeJson(c.manifest, m);
    }, /AUDIT FAIL AUDIT_BAKE_STALE: .*\$\.inputs\.filmSha256/],
    ['pose edited AND re-hashed (manifest SHA updated)', (c) => {
      const b = readJson(c.bake);
      const d = b.drops.find((x: any) => x.restFrame > x.releaseFrame) ?? b.drops[0];
      const q = d.poses[Math.min(10, d.poses.length - 1)];
      console.log(`   edit: ${d.id} frame ${q.frame} x ${q.x} -> ${q.x + 0.25}`);
      q.x += 0.25;
      writeJson(c.bake, b);
      const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(b); writeJson(c.manifest, m);
      console.log(`   new bake sha256=${m.physics.bake.sha256}`);
    }, /AUDIT FAIL AUDIT_BAKE_MISMATCH: .*\$\.drops\[[\w-]+\]\.poses\[frame \d+\]\.x — re-simulation gives /],
    ['bake is JSON null, SHA updated', (c) => { writeFileSync(c.bake, 'null\n'); const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(null); writeJson(c.manifest, m); }, /AUDIT FAIL AUDIT_BAKE_FORMAT: .*physics-bake\.json \$ — bake root must be a JSON object, got null/],
    ['bake is a JSON number, SHA updated', (c) => { writeFileSync(c.bake, '42\n'); const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(42); writeJson(c.manifest, m); }, /AUDIT FAIL AUDIT_BAKE_FORMAT: .*\$ — bake root must be a JSON object, got number/],
    ['bake is a JSON array, SHA updated', (c) => { const b = [readJson(c.bake)]; writeJson(c.bake, b); const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(b); writeJson(c.manifest, m); }, /AUDIT FAIL AUDIT_BAKE_FORMAT: .*\$ — bake root must be a JSON object, got an array/],
    ['action drop.events[0].t 0.3 → 0.301 (same trajectory), old bake', (c) => motionEdit(c, 'demo-cast', 'actions/drop.json', (j) => (j.events[0].t = 0.301)), /AUDIT FAIL AUDIT_BAKE_STALE: .*\$\.inputs\.motion\[demo-cast\]\.clips\[drop\]\.sha256/],
    ['rig pelvis.maxDegPerFrame 12 → 13, old bake', (c) => motionEdit(c, 'demo-cast', 'rig.json', (j) => (j.bones.find((b: any) => b.id === 'pelvis').maxDegPerFrame = 13)), /AUDIT FAIL AUDIT_BAKE_STALE: .*\$\.inputs\.motion\[demo-cast\]\.rig\.sha256/],
  ];
  if (film.data.physics.length > 1) {
    cases.push(['prop–prop wake removed AND re-hashed', (c) => {
      const b = readJson(c.bake);
      const d = b.drops.find((x: any) => x.wakes.length > 0);
      if (!d) throw new Error('no wake to remove');
      d.wakes = [];
      writeJson(c.bake, b);
      const m = readJson(c.manifest); m.physics.bake.sha256 = bakeSha256(b); writeJson(c.manifest, m);
    }, /AUDIT FAIL AUDIT_BAKE_MISMATCH: .*\.wakes\.length/]);
  }
  for (const [label, mutate, re] of cases) {
    const c = copy(src);
    try {
      mutate(c);
      expectFail(label, c.manifest, re, c.assets);
    } finally {
      rmSync(c.dir, { recursive: true, force: true });
    }
  }
}

for (const src of plainDirs) {
  const c = copy(src);
  try {
    const m = readJson(c.manifest);
    console.log(`== ${src} (${m.film.id}) no physics`);
    if (m.physics !== null) { console.log('FAIL manifest of a film without physics must have physics: null'); failures++; }
    delete m.physics; m.schemaVersion = 1; writeJson(c.manifest, m);
    const r = audit(c.manifest);
    const ok = r.status === 0 && /AUDIT PASS_TECHNICAL .* bake=none/.test(r.out);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} v1 manifest (pre-bake format), film without physics: exit ${r.status} | ${r.out}`);
  } finally {
    rmSync(c.dir, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? 'check:bake PASS_TECHNICAL' : `check:bake FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
