/**
 * M3 việc 4 — bản ghi bake vật lý và kiểm của audit (không cần trình duyệt: verifyPhysicsBake chạy trên manifest + file
 * bake thật trong thư mục tạm). Ca qua CLI render/audit thật: src/cli/check-bake.ts (CI render).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFilm, type Film } from '../schema/film.ts';
import { code } from '../schema/test-helpers.ts';
import { verifyPhysicsBake } from '../audit/audit.ts';
import { BAKE_FILE, BAKE_FORMAT_VERSION, bakeSha256, firstDifference, physicsBakeRecord } from './bake.ts';

const load = (id: string) => loadFilm(`examples/films/${id}.json`, 'assets');
const tmp = () => mkdtempSync(join(tmpdir(), 'ps-bake-'));
/** Thư mục render giả: chỉ manifest (các trường audit cần ở bước bake) + file bake. */
function renderDir(film: Film, record: unknown, opts: { schemaVersion?: 1 | 2; physics?: unknown } = {}) {
  const dir = tmp();
  const m: any = { schemaVersion: opts.schemaVersion ?? 2 };
  if (record !== undefined) writeFileSync(join(dir, BAKE_FILE), JSON.stringify(record, null, 1) + '\n');
  if (m.schemaVersion === 2) m.physics = 'physics' in opts ? opts.physics : record ? { bake: { file: BAKE_FILE, formatVersion: BAKE_FORMAT_VERSION, sha256: bakeSha256(record) } } : null;
  return { dir, manifestPath: join(dir, 'render-manifest.json'), m };
}

test('bake record: deterministic across fresh loads, canonical (no −0), null without physics; shared world keeps prop–prop relations', () => {
  for (const id of ['m3-drop', 'm3-drop-table', 'm3-collide', 'm3-collide-miss']) {
    const a = physicsBakeRecord(load(id))!, b = physicsBakeRecord(load(id))!;
    assert.equal(bakeSha256(a), bakeSha256(b), id);
    assert.equal(firstDifference(a, b), null);
  }
  for (const id of ['m0-static', 'demo-greeting', 'm2-handover', 'm2-plant']) assert.equal(physicsBakeRecord(load(id)), null, id);
  const c = physicsBakeRecord(load('m3-collide'))!;
  assert.deepEqual(c.drops.map((d) => d.id), ['drop-lantern', 'drop-plant']);
  const plant = c.drops.find((d) => d.id === 'drop-plant')!, lantern = c.drops.find((d) => d.id === 'drop-lantern')!;
  assert.deepEqual(plant.wakes, [{ frame: 309, by: 'prop:lantern-1' }]);
  assert.deepEqual(plant.contacts.find((x) => x.other === 'prop:lantern-1'), { other: 'prop:lantern-1', frame: 309, substep: 6 });
  assert.deepEqual(lantern.contacts[0], { other: 'prop:plant-1', frame: 309, substep: 6 });
  assert.equal(c.config.substeps, 8);
  assert.equal(c.config.fps, 24);
});

test('audit bake check: valid bake for a one-prop and a two-prop film', () => {
  for (const id of ['m3-drop', 'm3-collide']) {
    const f = load(id), rec = physicsBakeRecord(f)!;
    const { manifestPath, m } = renderDir(f, rec);
    assert.equal(verifyPhysicsBake(manifestPath, m, f), bakeSha256(rec));
    // bake đã ghi lại không phụ thuộc định dạng khoảng trắng: SHA trên JSON chuẩn hóa
    assert.equal(bakeSha256(JSON.parse(readFileSync(join(manifestPath, '..', BAKE_FILE), 'utf8'))), m.physics.bake.sha256);
  }
});

test('audit bake check: missing / corrupt file, wrong SHA', () => {
  const f = load('m3-drop'), rec = physicsBakeRecord(f)!;
  const miss = renderDir(f, undefined, { physics: { bake: { file: BAKE_FILE, formatVersion: 1, sha256: bakeSha256(rec) } } });
  assert.throws(() => verifyPhysicsBake(miss.manifestPath, miss.m, f), code('AUDIT_BAKE_FILE'));
  const bad = renderDir(f, rec);
  writeFileSync(join(bad.dir, BAKE_FILE), '{"format": "paper-studio-physics-bake", ');
  assert.throws(() => verifyPhysicsBake(bad.manifestPath, bad.m, f), code('AUDIT_BAKE_FILE'));
  const edited = renderDir(f, rec);
  const r = structuredClone(rec); r.drops[0]!.poses[10]!.x += 0.5;
  writeFileSync(join(edited.dir, BAKE_FILE), JSON.stringify(r));
  assert.throws(() => verifyPhysicsBake(edited.manifestPath, edited.m, f), code('AUDIT_BAKE_HASH'));
});

test('audit bake check: a pose edited and RE-HASHED (manifest SHA updated) is still caught by re-simulation, with its location', () => {
  for (const [id, drop, frame] of [['m3-drop', 'drop-plant', 170], ['m3-collide', 'drop-plant', 310]] as const) {
    const f = load(id);
    const r = structuredClone(physicsBakeRecord(f)!);
    const p = r.drops.find((d) => d.id === drop)!.poses.find((q) => q.frame === frame)!;
    const was = p.x;
    p.x += 0.25;
    const { manifestPath, m } = renderDir(f, r); // SHA trong manifest = SHA của bake đã sửa
    assert.equal(m.physics.bake.sha256, bakeSha256(r));
    assert.throws(() => verifyPhysicsBake(manifestPath, m, f), (e: Error) =>
      e.message.startsWith('AUDIT_BAKE_MISMATCH: ') && e.message.includes(`$.drops[${drop}].poses[frame ${frame}].x`) && e.message.includes(`re-simulation gives ${was}`));
  }
  // đổi quan hệ giữa hai đạo cụ (ai đánh thức ai) cũng bị bắt
  const f = load('m3-collide');
  const r = structuredClone(physicsBakeRecord(f)!);
  r.drops.find((d) => d.id === 'drop-plant')!.wakes = [];
  const { manifestPath, m } = renderDir(f, r);
  assert.throws(() => verifyPhysicsBake(manifestPath, m, f), (e: Error) => /AUDIT_BAKE_MISMATCH: .*\$\.drops\[drop-plant\]\.wakes\.length/.test(e.message));
});

test('audit bake check: a stale bake (made before a physics input changed) is rejected as AUDIT_BAKE_STALE', () => {
  // bake của film với restitution khác, băm lại đúng, đặt vào render của film hiện tại
  const raw = JSON.parse(readFileSync('examples/films/m3-drop.json', 'utf8'));
  raw.physics[0].body.restitution = 0.2;
  const dir0 = tmp(); writeFileSync(join(dir0, 'm3-drop.json'), JSON.stringify(raw));
  const other = loadFilm(join(dir0, 'm3-drop.json'), 'assets');
  const stale = physicsBakeRecord(other)!;
  const f = load('m3-drop');
  const { manifestPath, m } = renderDir(f, stale);
  assert.throws(() => verifyPhysicsBake(manifestPath, m, f), (e: Error) => /^AUDIT_BAKE_STALE: .*\$\.inputs\.filmSha256/.test(e.message));
  // engine / cấu hình khác (băm lại đúng) cũng bị từ chối trước khi so quỹ đạo
  const eng = structuredClone(physicsBakeRecord(f)!); eng.engine.version = '0.20.0';
  const e1 = renderDir(f, eng);
  assert.throws(() => verifyPhysicsBake(e1.manifestPath, e1.m, f), code('AUDIT_BAKE_ENGINE'));
  const cfg = structuredClone(physicsBakeRecord(f)!); cfg.config.substeps = 4;
  const e2 = renderDir(f, cfg);
  assert.throws(() => verifyPhysicsBake(e2.manifestPath, e2.m, f), (e: Error) => /^AUDIT_BAKE_CONFIG: .*\$\.config\.substeps/.test(e.message));
});

test('compatibility: physics films need a v2 manifest with physics.bake; films without physics accept v1 and v2/null', () => {
  const f = load('m3-collide'), rec = physicsBakeRecord(f)!;
  const v1 = renderDir(f, rec, { schemaVersion: 1 });
  assert.throws(() => verifyPhysicsBake(v1.manifestPath, v1.m, f), code('AUDIT_BAKE_MISSING'));
  const dropped = renderDir(f, rec, { physics: null });
  assert.throws(() => verifyPhysicsBake(dropped.manifestPath, dropped.m, f), code('AUDIT_BAKE_MISSING'));
  const still = load('m0-static');
  const a = renderDir(still, undefined, { schemaVersion: 1 });
  assert.equal(verifyPhysicsBake(a.manifestPath, a.m, still), null);
  const b = renderDir(still, undefined, { physics: null });
  assert.equal(verifyPhysicsBake(b.manifestPath, b.m, still), null);
  const c = renderDir(still, rec);
  assert.throws(() => verifyPhysicsBake(c.manifestPath, c.m, still), code('AUDIT_MANIFEST'));
});
