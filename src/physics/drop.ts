/**
 * Thả tự do (M3 đợt 1) — một TRẠNG THÁI của đạo cụ trong vòng đời props.ts: nằm yên → cầm → THẢ → rơi (Rapier) → nằm yên.
 *
 * Quy ước frame: R = frame của sự kiện release (start + round(t·(dur−1)), như mọi sự kiện). Ở R−1 đạo cụ còn trong tay.
 * Trạng thái ban đầu (thế giới, y-lên, px): pivot(R−1); vận tốc = (pivot(R−1) − pivot(R−2))·fps (tay mang vật tới R−1);
 * góc = góc thế giới hiện tại của đạo cụ (đồ cầm tay không xoay theo tay); vận tốc góc 0. Frame R = sau đúng 1 frame mô phỏng.
 * Mô phỏng: Rapier 2D tất định, đơn vị mét (px / pxPerMeter của dữ liệu), mỗi frame SUBSTEPS bước dt = 1/(fps·SUBSTEPS),
 * SOLVER_ITERATIONS vòng giải, CCD bật. Chỉ dùng tọa độ thế giới — camera không tham gia. Bake một lần từ dữ liệu phim,
 * lấy mẫu frame k = tra bảng ⇒ tua thẳng = xem tuần tự.
 *
 * Bước con → frame phim: tư thế ở frame f là trạng thái SAU bước con thứ S của frame f; bước con k (1..S) của frame f kết
 * thúc tại thời điểm t = (f − 1) + k/S (đơn vị frame). Sự kiện xảy ra trong bước con k của frame f được gán cho frame f
 * (frame đầu tiên có tư thế vẽ ra ở sau sự kiện), thời điểm chính xác tới 1/S frame ghi ở `firstContact.time`.
 *
 * Tiếp xúc = Rapier thật sự đẩy cặp collider (vật, mặt đỡ `onto`) trong một bước con: một điểm tiếp xúc của cặp đó có xung
 * lực pháp tuyến > 0. Không dùng khoảng cách (Rapier tạo điểm tiếp xúc "dự đoán" từ ~8 px, và contactDist của manifold đo
 * TRƯỚC bước giải) và không dùng tư thế cuối frame (vật nảy có thể chạm rồi rời sàn trong cùng một frame). Ba khái niệm:
 *  - ĐÃ TỪNG CHẠM: từ bước con đầu tiên có tiếp xúc (landFrame / firstContact) — không đổi khi vật nảy lại lên không.
 *  - ĐANG ĐƯỢC ĐỠ (`supported`): ở bước con CUỐI của frame, pháp tuyến hướng lên (ny ≥ SUPPORT_MIN_NY) và có MỘT ĐIỂM vừa
 *    chịu xung lực > 0 mà sau bước KHÔNG tách khỏi mặt: vₙ tại chính điểm đó (có tính quay) ≤ g·h (dung sai, xem sepMax).
 *    Xung lực chỉ nói "đã va"; góc bị đập rồi bật đi (vₙ ≫ g·h) là va chạm, không phải đỡ — dù góc kia đang gần mặt với
 *    xung lực 0 (điểm dự đoán). Chạm cạnh bên khối = chạm, không đỡ.
 *  - NẰM YÊN: đang được đỡ, tốc độ ≤ REST_SPEED, quay ≤ REST_SPIN liên tục REST_FRAMES frame → khóa tư thế từ đó.
 *    Thân động KHÔNG được tự ngủ trong Rapier (ngủ = engine ép vận tốc về 0 ⇒ vật đang trượt bị "đóng băng" giả).
 * Hụt (PHYSICS_NO_LANDING): chỉ khi CHẮC CHẮN không thể lên mặt đỡ — frame không có tiếp xúc và ngay cả theo quỹ đạo đạn đạo
 * (chỉ trọng lực) điểm cao nhất vật còn với tới được: KHỐI TÂM + max(v_kt,y,0)²/2g + bán kính lớn nhất của đỉnh quanh khối
 * tâm (pose.missBound), vẫn thấp hơn mặt đỡ quá LAND_GAP_PX. Vị trí tâm khi còn trên không KHÔNG đủ để kết luận (vật bay từ ngoài mép vào vẫn đáp được).
 * Chưa nằm yên trước hết phim → PHYSICS_NOT_AT_REST.
 * Va chạm đợt 1: chỉ mặt đỡ `onto` (khối tĩnh trên [x0, x1], dày SLAB_PX); bàn, đạo cụ khác, nhân vật: đợt sau.
 */
import { fail } from '../core/errors.ts';
import { artToLocal, rotate, type V2 } from '../core/space.ts';
import type { DropSpec, Film } from '../schema/film.ts';
import { contactWorld } from '../motion/character.ts';
import { propPivot, propTimeline } from '../motion/props.ts';
import { RAPIER, RAPIER_VERSION } from './rapier.ts';

export const SUBSTEPS = 8;
export const SOLVER_ITERATIONS = 4;
/** Nằm yên: ≤ 2 px/s (= 0.083 px/frame) và ≤ 2 °/s, liên tục 12 frame (0.5 s). */
export const REST_SPEED_PX = 2;
export const REST_SPIN_DEG = 2;
export const REST_FRAMES = 12;
/** Dung sai độ cao khi kết luận "hụt": điểm cao nhất với tới được phải thấp hơn mặt đỡ quá 1 px (Rapier cho lún ~0.4 px). */
export const LAND_GAP_PX = 1;
/** "Được đỡ": pháp tuyến tiếp xúc (từ mặt đỡ sang vật) nghiêng ≤ 60° so với phương thẳng đứng. */
export const SUPPORT_MIN_NY = 0.5;
/** Độ dày khối tĩnh làm mặt đỡ (px), mặt trên tại y của mặt đỡ. */
export const SLAB_PX = 50;

export interface DropPose {
  frame: number;
  /** Pivot thế giới (px, y-lên) — cùng điểm mà props.ts dùng cho đạo cụ. */
  x: number;
  y: number;
  /** Góc thế giới (độ, ngược chiều kim đồng hồ). */
  angle: number;
  /** Vận tốc pivot (px/s) và vận tốc góc (độ/s) — để test và bảng bàn giao. */
  vx: number;
  vy: number;
  spin: number;
  /** Trong frame này (bước con bất kỳ) mặt đỡ có đẩy vật — sự kiện tiếp xúc. */
  touching: boolean;
  /** Ở bước con cuối của frame có đối tượng đỡ vật từ bên dưới (xem đầu file). */
  supported: boolean;
  /** Danh tính các đối tượng THỰC SỰ đỡ vật ở bước con cuối (`surface:<id>` / `prop:<id>`), sắp theo khóa — kể cả khi
   *  đang khóa nằm yên (tính lại mỗi frame, không chép từ pose khóa). */
  supportedBy: string[];
  /** Vận tốc tách theo pháp tuyến (px/s, dương = rời mặt) ở bước con cuối, nhỏ nhất trên các điểm CHỊU XUNG LỰC > 0;
   *  null nếu bước con cuối không có điểm nào chịu xung lực. */
  separation: number | null;
  /** Mọi điểm manifold của cặp (vật, mặt đỡ) ở bước con cuối, kể cả điểm dự đoán xung lực 0 — bằng chứng cho test/bàn giao. */
  points: ContactPoint[];
  /** Cận đạn đạo (px, y thế giới): điểm cao nhất vật còn với tới nếu bay tự do từ frame này, tính quanh khối tâm. */
  missBound: number;
  /** Pose pivot (x, y, góc độ) sau từng bước con 1..SUBSTEPS của frame (phần tử cuối = pose frame). Chẩn đoán / kiểm va
   *  nhân vật theo bước con; KHÔNG thuộc bản ghi bake (src/physics/bake.ts chọn trường tường minh). */
  sub: [number, number, number][];
  /** Cận ĐẠN ĐẠO (khối tâm + max(v_kt,y,0)²/2g + bán kính) — bằng missBound khi world chỉ có vật này và mặt đích. */
  ballisticBound: number;
  /** Tổng xung lực pháp tuyến trong frame theo đối tượng đẩy (`surface:<id>` / `prop:<id>`), sắp theo khóa. */
  pushes: { by: string; impulse: number }[];
  /** falling: chưa từng chạm · supported: đã chạm và đang được đỡ · airborne: đã chạm, đang không được đỡ (nảy/lật/trượt mép)
   *  · rest: đã khóa nằm yên. */
  state: 'falling' | 'supported' | 'airborne' | 'rest';
}

export interface ContactPoint {
  /** Vị trí thế giới (px, y-lên) sau bước của điểm vật chất trên vật. */
  x: number;
  y: number;
  /** Xung lực pháp tuyến của bước (đơn vị Rapier: kg·m/s); 0 = điểm dự đoán, không chịu lực. */
  impulse: number;
  /** vₙ sau bước (px/s), dương = tách khỏi mặt. */
  separation: number;
}

export interface FirstContact {
  frame: number;
  /** Bước con 1..SUBSTEPS trong frame `frame`. */
  substep: number;
  /** Thời điểm kết thúc bước con đó, đơn vị frame: frame − 1 + substep/SUBSTEPS. */
  time: number;
}

/** Kết quả mô phỏng chưa xét lỗi (để test/bàn giao xem diễn biến kể cả khi bake bị từ chối). */
export interface DropTrace {
  releaseFrame: number;
  init: { pivot: V2; velocity: V2; angle: number };
  poses: DropPose[];
  firstContact: FirstContact | null;
  /** Điểm manifold của cặp (vật, mặt đỡ) ở đúng bước con chạm đầu (rỗng nếu chưa chạm). */
  firstContactPoints: ContactPoint[];
  /** Lần tiếp xúc đầu (xung lực > 0) với TỪNG đối tượng, theo thứ tự thời gian. */
  contacts: ContactEvent[];
  /** Các lần vật đang nằm yên bị đạo cụ khác đánh thức. */
  wakes: { frame: number; by: string }[];
  /** Frame cuối cùng vật còn được đỡ (−1 nếu chưa bao giờ). */
  lastSupported: number;
  /** Frame khóa nằm yên CUỐI CÙNG (giữ tới hết phim), −1 nếu không. */
  restFrame: number;
  /** Frame kết luận hụt chắc chắn (−1 nếu không). Diễn biến cắt ở frame này. */
  missFrame: number;
  /** Mọi frame thỏa điều kiện hụt (ứng viên); hụt chỉ được kết luận ở ứng viên sau lần đạo cụ khác đẩy vật cuối cùng. */
  missCandidates: number[];
}

export interface DropBake {
  id: string;
  prop: string;
  engine: string;
  releaseFrame: number;
  /** Frame của lần tiếp xúc đầu tiên với mặt đỡ (= firstContact.frame). */
  landFrame: number;
  firstContact: FirstContact;
  firstContactPoints: ContactPoint[];
  contacts: ContactEvent[];
  wakes: { frame: number; by: string }[];
  restFrame: number;
  init: { pivot: V2; velocity: V2; angle: number };
  poses: DropPose[];
}

/** Bộ mô phỏng thế giới chung theo film (ghi nhớ NGAY khi tạo ⇒ truy vấn lồng nhau dùng lại cùng một bộ). */
const sims = new WeakMap<Film, WorldSim>();

function simOf(film: Film): WorldSim {
  let s = sims.get(film);
  if (!s) {
    s = new WorldSim(film);
    sims.set(film, s);
  }
  return s;
}

/**
 * Giải phóng world Rapier đang mở (nếu có) của film — đúng một lần. Dùng khi film bị bỏ dở: validator ném lỗi trước khi
 * bake xong, hoặc film tạm của phép tìm thời lượng tối thiểu (src/schema/film.ts hint). Bộ mô phỏng chưa lỗi bị xóa khỏi
 * bộ nhớ đệm ⇒ truy vấn sau (nếu có) mô phỏng lại từ đầu, cùng kết quả (tất định). Bộ mô phỏng đã lỗi giữ lỗi để ném lại.
 */
export function disposeWorld(film: Film): void {
  const s = sims.get(film);
  if (!s) return;
  if (!s.dispose()) sims.delete(film);
}

/** Bake của drop `id` trong thế giới chung (mô phỏng tới hết phim + kết luận lỗi, một lần mỗi film). */
export function dropBake(film: Film, id: string): DropBake {
  const hit = simOf(film).bakes().get(id);
  if (!hit) return fail('FILM_UNKNOWN_REF', `drop ${id}`, 'no such drop');
  return hit;
}

/**
 * Tư thế đạo cụ ở frame ≥ frame thả: tra bảng đã tính, chỉ chạy tiếp thế giới tới `frame` khi frame đó chưa được tính
 * (hàm thuần của film: lịch mô phỏng luôn tuần tự từ đầu, nên thứ tự truy vấn không đổi kết quả).
 */
export function dropPose(film: Film, id: string, frame: number): DropPose {
  return simOf(film).pose(id, frame);
}

/** Diễn biến của một drop trong thế giới chung của phim (không xét lỗi vật lý) — cho test/CLI. */
export function simulateDrop(film: Film, d: DropSpec): DropTrace {
  const t = simulateWorld(film).get(d.id);
  if (!t) return fail('FILM_UNKNOWN_REF', `drop ${d.id}`, 'no such drop');
  return t;
}

/** Diễn biến mọi drop (mô phỏng tới hết phim, không xét lỗi vật lý). */
export function simulateWorld(film: Film): Map<string, DropTrace> {
  return simOf(film).traces();
}

type World = InstanceType<typeof RAPIER.World>;
type Body = ReturnType<World['createRigidBody']>;
type Shape = ReturnType<World['createCollider']>;

/** Trạng thái mô phỏng của một đạo cụ trong thế giới chung. */
interface Actor {
  d: DropSpec;
  /** Khóa sắp xếp/ghi sự kiện: `prop:<id đạo cụ>`. */
  key: string;
  path: string;
  where: string;
  R: number;
  /** Trạng thái lúc buông (pivot R−1, vận tốc tay) — tính khi DỰNG vật ở frame R (có thể đọc pose đạo cụ khác < R). */
  p1?: V2;
  v0?: V2;
  angle0: number;
  c0: V2;
  verts: V2[];
  collider: { type: 'box' } | { type: 'hull'; points: [number, number][] };
  hw: number;
  hh: number;
  surface: { id: string; y: number; x0: number; x1: number };
  body?: Body;
  shape?: Shape;
  rCom: number;
  /** Khối lượng (kg) và mô-men quán tính chính (kg·m²) — cho cận năng lượng. */
  mass: number;
  inertia: number;
  /** Cận hụt theo năng lượng (world có collider khác ngoài mặt đích của vật này) thay vì đạn đạo. */
  energyBound: boolean;
  poses: DropPose[];
  firstContact: FirstContact | null;
  firstContactPoints: ContactPoint[];
  contacts: ContactEvent[];
  wakes: { frame: number; by: string }[];
  calm: number;
  /** Đang khóa nằm yên: pose hiển thị + trạng thái thân Rapier để ghim lại đầu mỗi frame. */
  lock: { pose: DropPose; t: { x: number; y: number }; r: number } | null;
  restFrame: number;
  /** Frame thỏa điều kiện hụt (không tiếp xúc, cận dưới mặt). */
  missCond: number[];
  /** Frame mà một đạo cụ KHÁC đẩy vật này (xung lực > 0). */
  pushedByPropFrames: number[];
}

type FrameInfo = { touching: boolean; byProp: Map<string, number>; pushes: Map<string, number>; last?: ContactSummary; sub: [number, number, number][] };

/**
 * Thế giới Rapier chung theo thời gian phim (M3 việc 3).
 *  - Thành phần: các mặt đỡ mà drop tham chiếu (`onto`), sắp theo id; mỗi đạo cụ được thêm vào ĐẦU frame thả R của nó
 *    (trạng thái R−1 trong tay, như một vật), sắp theo (R, id đạo cụ) ⇒ không phụ thuộc thứ tự khai báo trong film.
 *  - Lịch bước chung: từ R nhỏ nhất tới hết phim, mỗi frame SUBSTEPS bước dt = 1/(fps·SUBSTEPS) cho cả thế giới.
 *  - TĂNG DẦN: thế giới chỉ chạy tới frame được hỏi (`advanceTo`). Dựng vật ở frame R cần tư thế nhân vật ở R−1/R−2,
 *    có thể phụ thuộc pose đạo cụ ĐÃ THẢ trước đó (vd. quay mặt về phía một đạo cụ: film.turns face.prop) — các truy vấn
 *    đó đọc thẳng bảng đã tính (frame < R). Truy vấn cần frame CHƯA tính trong lúc đang chạy = vòng phụ thuộc thật
 *    ⇒ PHYSICS_CYCLE (không dùng vị trí ban đầu hay hướng cố định làm giá trị thay).
 *  - Vật liệu: mặt đỡ friction = restitution = 0 với luật kết hợp Max ⇒ tiếp xúc (đạo cụ, mặt) dùng đúng hệ số của đạo cụ
 *    (như phim một vật trước đây: trung bình(f, f) = f); đạo cụ–đạo cụ: trung bình hai hệ số (luật mặc định của Rapier).
 *  - Nằm yên KHÔNG còn là khóa vĩnh viễn: pose hiển thị khóa từ frame rest, thân Rapier được ghim về đúng trạng thái khóa
 *    (vận tốc 0) ở đầu mỗi frame; nếu trong frame một đạo cụ KHÁC đẩy vật (xung lực > 0) và sau frame vật vượt ngưỡng nằm
 *    yên ⇒ ĐÁNH THỨC (wakes), vật chuyển động tiếp theo mô phỏng. Mặt đỡ tĩnh không bao giờ đánh thức vật.
 *  - Hụt: frame f thỏa (không tiếp xúc ∧ cận < mặt − LAND_GAP_PX) chỉ là ỨNG VIÊN; kết luận hụt tại ứng viên sớm nhất mà
 *    từ đó tới hết phim KHÔNG đạo cụ nào khác đẩy vật (va chạm sau có thể cấp thêm xung lực). Một vật một mình: trùng
 *    quy tắc cũ (dừng ở ứng viên đầu tiên).
 */
class WorldSim {
  private readonly film: Film;
  private readonly N: number;
  private readonly actors: Actor[];
  private readonly byId = new Map<string, Actor>();
  private world: World | null = null;
  private readonly owner = new Map<number, { key: string; actor?: Actor }>();
  private readonly active: Actor[] = [];
  /** Frame kế tiếp sẽ mô phỏng. */
  private next: number;
  private busy = false;
  private error: unknown = null;
  private readonly ppm: number;
  private readonly g: number;
  private readonly sepMax: number;
  private baked: Map<string, DropBake> | null = null;

  constructor(film: Film) {
    this.film = film;
    const drops = film.data.physics;
    this.N = film.data.output.durationFrames;
    this.actors = drops.map((d) => actorOf(film, d)).sort((a, b) => a.R - b.R || (a.d.prop < b.d.prop ? -1 : a.d.prop > b.d.prop ? 1 : 0));
    for (const a of this.actors) this.byId.set(a.d.id, a);
    const surfaceCount = new Set(drops.map((d) => d.onto)).size;
    for (const a of this.actors) a.energyBound = this.actors.length > 1 || surfaceCount > 1;
    this.next = this.actors[0]?.R ?? this.N;
    const w0 = drops[0]?.world ?? { gravity: 9.81, pxPerMeter: 400 };
    this.ppm = w0.pxPerMeter;
    this.g = w0.gravity * this.ppm; // px/s²
    this.sepMax = this.g / (film.data.output.fps * SUBSTEPS); // dung sai vₙ của "đỡ" (xem contactsOf)
  }

  pose(id: string, frame: number): DropPose {
    // Lỗi engine đã lưu (dựng collider, chu trình…) ⇒ mọi truy vấn trên film này ném lại CÙNG lỗi, kể cả frame đã tính.
    if (this.error) throw this.error;
    const a = this.byId.get(id);
    if (!a) return fail('FILM_UNKNOWN_REF', `drop ${id}`, 'no such drop');
    if (frame >= this.next && frame < this.N) {
      if (this.busy) {
        fail('PHYSICS_CYCLE', `${a.where} frame ${frame}`, `the pose of "${a.d.prop}" at frame ${frame} is needed while the shared world is still being built at frame ${this.next} (a release state depends on a later pose)`);
      }
      this.advanceTo(frame);
    }
    const p = a.poses[frame - a.R];
    if (!p) return fail('PHYSICS_FRAME', `drop ${id}`, `frame ${frame} outside [${a.R}, ${a.R + a.poses.length - 1}]`);
    return p;
  }

  traces(): Map<string, DropTrace> {
    this.advanceTo(this.N - 1);
    const out = new Map<string, DropTrace>();
    for (const a of this.actors) out.set(a.d.id, traceOf(a));
    return out;
  }

  bakes(): Map<string, DropBake> {
    if (!this.baked) this.baked = verdicts(this.film, this.traces());
    return this.baked;
  }

  /** Chạy thế giới tới hết frame `target` (tuần tự). Lỗi ⇒ giải phóng world, ghi lỗi, ném lại ở mọi lần gọi sau. */
  private advanceTo(target: number): void {
    if (this.error) throw this.error;
    if (this.next > target || this.next >= this.N) return;
    this.busy = true;
    try {
      if (!this.world) this.open();
      while (this.next <= target && this.next < this.N) {
        this.stepFrame(this.next);
        this.next++;
      }
      if (this.next >= this.N) this.close();
    } catch (e) {
      this.error = e;
      this.close();
      throw e;
    } finally {
      this.busy = false;
    }
  }

  /** Giải phóng world nếu đang mở; trả true nếu bộ mô phỏng đang giữ lỗi engine. */
  dispose(): boolean {
    this.close();
    return this.error !== null;
  }

  private open(): void {
    const { fps } = this.film.data.output;
    const w0 = this.film.data.physics[0]!.world;
    const world = new RAPIER.World({ x: 0, y: -w0.gravity });
    this.world = world;
    world.timestep = 1 / (fps * SUBSTEPS);
    world.numSolverIterations = SOLVER_ITERATIONS;
    const ppm = this.ppm;
    const surfaces = [...new Set(this.film.data.physics.map((d) => d.onto))].sort().map((id) => this.film.data.stage.surfaces.find((s) => s.id === id)!);
    for (const surface of surfaces) {
      const slab = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((surface.x0 + surface.x1) / 2 / ppm, (surface.y - SLAB_PX) / ppm));
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid((surface.x1 - surface.x0) / 2 / ppm, SLAB_PX / ppm)
          .setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
          .setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
        slab,
      );
      this.owner.set(c.handle, { key: `surface:${surface.id}` });
    }
  }

  private close(): void {
    this.world?.free();
    this.world = null;
  }

  private stepFrame(fr: number): void {
    const world = this.world!, ppm = this.ppm;
    for (const a of this.actors) {
      if (a.R !== fr) continue;
      release(this.film, a);
      spawn(world, a, ppm);
      this.owner.set(a.shape!.handle, { key: a.key, actor: a });
      this.active.push(a);
    }
    // ghim vật đang khóa nằm yên về đúng trạng thái khóa
    for (const a of this.active) {
      if (!a.lock) continue;
      a.body!.setTranslation(a.lock.t, true);
      a.body!.setRotation(a.lock.r, true);
      a.body!.setLinvel({ x: 0, y: 0 }, true);
      a.body!.setAngvel(0, true);
    }
    const frameInfo = new Map<Actor, FrameInfo>();
    for (const a of this.active) frameInfo.set(a, { touching: false, byProp: new Map(), pushes: new Map(), sub: [] });
    for (let k = 1; k <= SUBSTEPS; k++) {
      world.step();
      for (const a of this.active) {
        const ct = contactsOf(world, a, this.owner, ppm, this.sepMax);
        const fi = frameInfo.get(a)!;
        for (const [key, imp] of ct.pushes) {
          fi.touching = true;
          fi.pushes.set(key, (fi.pushes.get(key) ?? 0) + imp);
          if (key.startsWith('prop:')) fi.byProp.set(key, (fi.byProp.get(key) ?? 0) + imp);
          if (!a.contacts.some((e) => e.other === key)) a.contacts.push({ other: key, frame: fr, substep: k, time: fr - 1 + k / SUBSTEPS });
        }
        if (ct.onto.pushed && !a.firstContact) {
          a.firstContact = { frame: fr, substep: k, time: fr - 1 + k / SUBSTEPS };
          a.firstContactPoints = ct.onto.points;
        }
        if (k === SUBSTEPS) fi.last = ct;
        // pivot + góc sau bước con k (cho phép quét va nhân vật theo bước con — src/physics/hits.ts; không vào bake)
        const bt = a.body!.translation(), ba = (a.body!.rotation() * 180) / Math.PI, r0 = rotate(a.c0, ba);
        fi.sub.push([bt.x * ppm - r0[0], bt.y * ppm - r0[1], ba]);
      }
    }
    for (const a of this.active) frameEnd(a, fr, frameInfo.get(a)!, ppm, this.g);
  }
}

export interface ContactEvent {
  /** `surface:<id>` hoặc `prop:<id>`. */
  other: string;
  frame: number;
  substep: number;
  time: number;
}

interface ContactSummary {
  /** Tổng xung lực pháp tuyến theo khóa đối tượng trong bước con này (chỉ > 0). */
  pushes: Map<string, number>;
  /** Có đối tượng (tĩnh hay động) đỡ vật: điểm chịu lực, pháp tuyến hướng lên, vận tốc tách tương đối ≤ sepMax. */
  supports: boolean;
  /** Khóa các đối tượng đang ĐỠ vật (theo tiêu chí trên), sắp theo khóa. */
  supporters: string[];
  /** Cặp (vật, mặt đích `onto`) — giữ nghĩa cũ cho firstContact/points/separation. */
  onto: { pushed: boolean; sep: number | null; points: ContactPoint[] };
}

function actorOf(film: Film, d: DropSpec): Actor {
  const where = `film.physics(${d.id})`;
  const idx = film.data.physics.indexOf(d);
  const path = idx >= 0 ? `film.physics[${idx}]` : where;
  const seg = propTimeline(film).get(d.prop)!.find((s) => s.drop === d.id);
  if (!seg) return fail('PHYSICS_NO_RELEASE', where, `"${d.prop}" is never let go by timeline[${d.release}]`);
  const R = seg.from;
  const list = propTimeline(film).get(d.prop)!;
  const heldAt = (fr: number) => fr >= 0 && list.filter((s) => s.from <= fr).at(-1)!.holders.length > 0;
  if (!heldAt(R - 1) || !heldAt(R - 2)) fail('PHYSICS_RELEASE_TOO_EARLY', where, `release at frame ${R} needs the prop held at frames ${R - 2} and ${R - 1} (hand velocity)`);
  const prop = film.data.props.find((x) => x.id === d.prop)!;
  const asset = film.assets.get(prop.asset)!;
  // Gốc thân Rapier = TÂM KHUNG ART × scale (tính từ pivot trong khung local, y-lên) — với mọi hình collider, nên pivot ↔
  // gốc thân không đổi giữa hộp và hull. Hình (src/schema/film.ts Collider): mặc định hộp = khung art; hull = bao lồi của
  // các điểm art. Khối tâm do Rapier tính từ hình (hull: khác gốc thân) — mọi vận tốc dưới đây lấy quanh KHỐI TÂM.
  const hw = (asset.width * prop.scale) / 2, hh = (asset.height * prop.scale) / 2;
  const cLocal = artToLocal([asset.width / 2, asset.height / 2], asset.pivot);
  const c0: V2 = [cLocal[0] * prop.scale, cLocal[1] * prop.scale];
  const collider = d.body.collider ?? { type: 'box' as const };
  /** Đỉnh hình trong khung thân (px, quanh gốc thân). */
  const verts: V2[] = collider.type === 'box'
    ? [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
    : collider.points.map((a) => { const l = artToLocal(a, asset.pivot); return [l[0] * prop.scale - c0[0], l[1] * prop.scale - c0[1]] as V2; });
  const surface = film.data.stage.surfaces.find((s) => s.id === d.onto)!;
  return {
    d, key: `prop:${d.prop}`, path, where, R, angle0: prop.rotation, c0, verts, collider, hw, hh, surface, rCom: 0, mass: 0, inertia: 0, energyBound: false,
    poses: [], firstContact: null, firstContactPoints: [], contacts: [], wakes: [], calm: 0, lock: null, restFrame: -1, missCond: [], pushedByPropFrames: [],
  };
}

/** Trạng thái buông: pivot ở R−1 và vận tốc tay (pivot(R−1) − pivot(R−2))·fps — đọc tư thế nhân vật ở chính các frame đó. */
function release(film: Film, a: Actor): void {
  const held = (fr: number): V2 => propPivot(film, a.d.prop, fr, (ci, c) => contactWorld(film, ci, fr, c));
  const p1 = held(a.R - 1), p2 = held(a.R - 2), fps = film.data.output.fps;
  a.p1 = p1;
  a.v0 = [(p1[0] - p2[0]) * fps, (p1[1] - p2[1]) * fps];
}

function spawn(world: World, a: Actor, ppm: number): void {
  const { d, c0, angle0, verts, collider, hw, hh } = a;
  const p1 = a.p1!, v0 = a.v0!;
  const r = rotate(c0, angle0);
  a.body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation((p1[0] + r[0]) / ppm, (p1[1] + r[1]) / ppm)
      .setRotation((angle0 * Math.PI) / 180)
      .setLinvel(v0[0] / ppm, v0[1] / ppm)
      .setAngvel(0)
      .setCcdEnabled(true)
      // Không cho Rapier tự ngủ: khi ngủ, Rapier ĐẶT VẬN TỐC VỀ 0 cho vật chậm (kể cả vật đang trượt đều trên mặt không
      // ma sát) — nằm yên chỉ do tiêu chí của file này quyết định (REST_*), không do ngưỡng ngủ nội bộ của engine.
      .setCanSleep(false),
  );
  // Rapier 0.21: ColliderDesc.convexHull chỉ giữ đỉnh; bao lồi được tính khi createCollider, và bao rỗng (vd. tam giác
  // gần thẳng hàng vượt qua kiểm diện tích của validator) làm binding ném "expected instance of t" — đổi thành mã dự án.
  const desc = collider.type === 'box' ? RAPIER.ColliderDesc.cuboid(hw / ppm, hh / ppm) : RAPIER.ColliderDesc.convexHull(new Float32Array(verts.flatMap((v) => [v[0] / ppm, v[1] / ppm])));
  try {
    if (!desc) throw new Error('convexHull returned null');
    a.shape = world.createCollider(desc.setDensity(d.body.density).setFriction(d.body.friction).setRestitution(d.body.restitution), a.body);
  } catch (e) {
    fail('PHYSICS_COLLIDER', `${a.path}.body.collider`, `Rapier could not build the ${collider.type} collider of "${d.prop}" (${verts.length} points; ${(e as Error).message}) — the shape is too thin or degenerate`);
  }
  // Cận báo hụt quanh KHỐI TÂM: bán kính lớn nhất của đỉnh quanh khối tâm local (Rapier tính từ hình; hộp: = gốc thân).
  const lc = a.body.localCom();
  a.rCom = Math.max(...verts.map((v) => Math.hypot(v[0] - lc.x * ppm, v[1] - lc.y * ppm)));
  a.mass = a.body.mass();
  a.inertia = a.body.principalInertia();
}

/**
 * Tiếp xúc của vật `a` với MỌI collider khác ở bước vừa chạy, từng ĐIỂM MANIFOLD i (Rapier 0.21):
 *  - contactImpulse(i): xung lực pháp tuyến bộ giải đặt lên đúng điểm i trong bước này;
 *  - localContactPoint1/2(i): điểm i trên collider 1/2, trong khung local của collider (= khung thân, collider không lệch).
 *    Lấy phía VẬT NÀY, biến đổi bằng tư thế SAU bước ⇒ vị trí hiện tại của chính điểm vật chất đã chịu lực;
 *  - normal(): pháp tuyến thế giới của manifold, từ collider 1 sang 2 (flipped ⇒ collider 1 là đối tượng kia).
 * Không dùng solverContactPoint (không ánh xạ được về điểm manifold).
 * Mỗi điểm: vₙ = (v_vật(p) − v_kia(p)) · n sau bước giải, v(p) = v_khối-tâm + ω × (p − khối tâm) (đối tượng tĩnh: 0).
 * Dung sai vₙ của "đỡ" = g·h (h = bước con) — độ phân giải của mô phỏng, không phải ngưỡng nảy: một điểm rời mặt với
 * vₙ ≤ g·h chỉ dưới trọng lực cao lên tối đa g·h²/2 (≈ 0,05 px ở 9,81 m/s², 400 px/m, 192 bước/s) và trở lại sau ≤ 2 bước
 * con — dưới độ lún cho phép của Rapier (~0,4 px). Cú bật thật có vₙ ≫ g·h (đo được 91,7–644,8 px/s).
 * Đối tượng khác ĐỠ vật ⇔ pháp tuyến hướng lên (ny ≥ SUPPORT_MIN_NY) và CÓ điểm vừa chịu xung lực > 0 mà vₙ ≤ g·h.
 */
function contactsOf(world: World, a: Actor, owner: Map<number, { key: string; actor?: Actor }>, ppm: number, sepMax: number): ContactSummary {
  const others: { key: string; actor?: Actor; c: Shape }[] = [];
  world.contactPairsWith(a.shape!, (c) => { const o = owner.get(c.handle); if (o) others.push({ ...o, c }); });
  others.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)); // thứ tự tất định, không phụ thuộc đồ thị va chạm
  const out: ContactSummary = { pushes: new Map(), supports: false, supporters: [], onto: { pushed: false, sep: null, points: [] } };
  const body = a.body!;
  const velAt = (b: Body | undefined, px: number, py: number) => {
    if (!b) return { x: 0, y: 0 };
    const c = b.worldCom(), v = b.linvel(), w = b.angvel();
    return { x: v.x - w * (py - c.y), y: v.y + w * (px - c.x) };
  };
  const ontoKey = `surface:${a.d.onto}`;
  for (const o of others) {
    world.contactPair(a.shape!, o.c, (m, flipped) => {
      const n = m.normal(), s = flipped ? 1 : -1, nx = s * n.x, ny = s * n.y;
      const t = body.translation(), r = body.rotation();
      const cr = Math.cos(r), sr = Math.sin(r);
      let imp = 0;
      for (let i = 0; i < m.numContacts(); i++) {
        const lb = (flipped ? m.localContactPoint2(i) : m.localContactPoint1(i))!;
        const px = t.x + cr * lb.x - sr * lb.y, py = t.y + sr * lb.x + cr * lb.y; // điểm local quanh GỐC thân
        const va = velAt(body, px, py), vb = velAt(o.actor?.body, px, py);
        const vn = ((va.x - vb.x) * nx + (va.y - vb.y) * ny) * ppm;
        const impulse = m.contactImpulse(i);
        if (o.key === ontoKey) out.onto.points.push({ x: px * ppm, y: py * ppm, impulse, separation: vn });
        if (!(impulse > 0)) continue;
        imp += impulse;
        if (o.key === ontoKey) { out.onto.pushed = true; out.onto.sep = out.onto.sep === null ? vn : Math.min(out.onto.sep, vn); }
        if (ny >= SUPPORT_MIN_NY && vn <= sepMax) {
          out.supports = true;
          if (!out.supporters.includes(o.key)) out.supporters.push(o.key); // others đã sắp theo khóa ⇒ danh sách sắp sẵn
        }
      }
      if (imp > 0) out.pushes.set(o.key, (out.pushes.get(o.key) ?? 0) + imp);
    });
  }
  return out;
}

function frameEnd(a: Actor, fr: number, fi: FrameInfo, ppm: number, g: number): void {
  const body = a.body!;
  const t = body.translation(), lv = body.linvel(), com = body.worldCom();
  const w = body.angvel();
  const speed = Math.hypot(lv.x * ppm, lv.y * ppm), spin = (w * 180) / Math.PI;
  const pushes = [...fi.pushes].map(([by, impulse]) => ({ by, impulse }));
  if (fi.byProp.size > 0) a.pushedByPropFrames.push(fr);
  const last = fi.last!;
  if (a.lock) {
    // Đánh thức khi (a) một ĐẠO CỤ khác vừa đẩy vật và vật vượt ngưỡng nằm yên, hoặc (b) vật MẤT điểm tựa (vd. vật đỡ nó
    // bị đẩy đi). Còn lại giữ pose khóa (thân được ghim lại); điểm tựa/xung lực của frame vẫn là số thật của frame đó.
    const pushedAway = fi.byProp.size > 0 && (speed > REST_SPEED_PX || Math.abs(spin) > REST_SPIN_DEG);
    const unsupported = !last.supports;
    if (!pushedAway && !unsupported) {
      a.poses.push({ ...a.lock.pose, frame: fr, vx: 0, vy: 0, spin: 0, sub: [], touching: fi.touching, supported: true, supportedBy: last.supporters, separation: last.onto.sep, points: last.onto.points, pushes });
      return;
    }
    a.wakes.push({ frame: fr, by: unsupported ? 'lost-support' : [...fi.byProp.keys()].join(',') });
    a.lock = null;
    a.restFrame = -1;
    a.calm = 0;
  }
  const angle = (body.rotation() * 180) / Math.PI;
  const r0 = rotate(a.c0, angle);
  const pv: V2 = [t.x * ppm - r0[0], t.y * ppm - r0[1]];
  // vận tốc của pivot = v_khối-tâm + ω × (pivot − khối tâm)  (linvel của Rapier là vận tốc khối tâm)
  const rx = pv[0] - com.x * ppm, ry = pv[1] - com.y * ppm;
  const vx = lv.x * ppm - w * ry, vy = lv.y * ppm + w * rx;
  const supported = last.supports;
  const calmNow = supported && speed <= REST_SPEED_PX && Math.abs(spin) <= REST_SPIN_DEG;
  a.calm = calmNow ? a.calm + 1 : 0;
  // falling = chưa chạm BẤT KỲ đối tượng nào (một vật: = chưa chạm mặt đích như trước); đã chạm thì supported/airborne.
  const state: DropPose['state'] = a.calm >= REST_FRAMES ? 'rest' : a.contacts.length === 0 ? 'falling' : supported ? 'supported' : 'airborne';
  // Cận điểm cao nhất vật còn với tới (quanh khối tâm, + bán kính đỉnh quanh khối tâm):
  //  - một vật, một mặt (chỉ mặt đích trong world): ĐẠN ĐẠO — khối tâm + max(v_kt,y, 0)²/2g (không có gì để nảy lên);
  //  - world có collider khác (mặt tĩnh khác / đạo cụ khác): NĂNG LƯỢNG — khối tâm + (|v_kt|² + ω²·I/m)/2g: vật có thể nảy
  //    khỏi mặt tĩnh khác (restitution ≤ 1, ma sát tiêu tán ⇒ không vượt cơ năng); đạo cụ khác có thể cấp thêm năng lượng
  //    nên kết luận hụt còn chờ lần đẩy cuối từ đạo cụ (traceOf).
  const vy2 = a.energyBound ? (lv.x * lv.x + lv.y * lv.y) * ppm * ppm + (w * w * a.inertia * ppm * ppm) / a.mass : Math.max(lv.y * ppm, 0) ** 2;
  const missBound = com.y * ppm + vy2 / (2 * g) + a.rCom;
  const ballisticBound = com.y * ppm + Math.max(lv.y * ppm, 0) ** 2 / (2 * g) + a.rCom;
  const pose: DropPose = { frame: fr, x: pv[0], y: pv[1], angle, vx, vy, spin, sub: fi.sub, touching: fi.touching, supported, supportedBy: last.supporters, separation: last.onto.sep, points: last.onto.points, missBound, ballisticBound, pushes, state };
  a.poses.push(pose);
  if (state === 'rest') {
    a.lock = { pose, t: { x: t.x, y: t.y }, r: body.rotation() };
    a.restFrame = fr;
  }
  if (!fi.touching && missBound < a.surface.y - LAND_GAP_PX) a.missCond.push(fr);
}

function traceOf(a: Actor): DropTrace {
  // Hụt: ứng viên sớm nhất mà từ đó KHÔNG còn đạo cụ nào khác đẩy vật.
  const lastPush = a.pushedByPropFrames.at(-1) ?? -1;
  const missFrame = a.missCond.find((f) => f > lastPush) ?? -1;
  const poses = missFrame >= 0 ? a.poses.filter((q) => q.frame <= missFrame) : a.poses;
  const lastSupported = poses.filter((q) => q.supported).at(-1)?.frame ?? -1;
  return {
    releaseFrame: a.R, init: { pivot: a.p1!, velocity: a.v0!, angle: a.angle0 }, poses, firstContact: a.firstContact, firstContactPoints: a.firstContactPoints,
    contacts: a.contacts, wakes: a.wakes, lastSupported, restFrame: missFrame >= 0 ? -1 : a.restFrame, missFrame, missCandidates: a.missCond,
  };
}

function verdicts(film: Film, traces: Map<string, DropTrace>): Map<string, DropBake> {
  const N = film.data.output.durationFrames;
  const out = new Map<string, DropBake>();
  for (const d of [...film.data.physics].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))) {
    const where = `film.physics(${d.id})`;
    const tr = traces.get(d.id)!;
    const fc = tr.firstContact;
    const history = fc ? `first touched "${d.onto}" at frame ${fc.frame} (substep ${fc.substep}/${SUBSTEPS}), last supported at frame ${tr.lastSupported}` : `never touched "${d.onto}"`;
    if (tr.missFrame >= 0) {
      const s = film.data.stage.surfaces.find((x) => x.id === d.onto)!;
      const p = tr.poses[tr.poses.length - 1]!;
      fail('PHYSICS_NO_LANDING', `${where} frame ${tr.missFrame}`, `"${d.prop}" ${history}; it is now below "${d.onto}" (y=${s.y}, x∈[${s.x0}, ${s.x1}]) and cannot reach it any more (pivot ${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
    }
    if (tr.restFrame < 0) {
      const last = tr.poses[tr.poses.length - 1];
      fail('PHYSICS_NOT_AT_REST', where, `"${d.prop}" ${history} but is not at rest at the last frame ${N - 1}${last ? ` (speed ${Math.hypot(last.vx, last.vy).toFixed(1)} px/s, ${last.state})` : ''}; lengthen the film or release earlier`);
    }
    // Mặt đích = mặt THỰC SỰ đỡ vật khi nằm yên: trong cả cửa sổ nghỉ cuối (REST_FRAMES frame tới restFrame) và mọi frame
    // khóa sau đó, `surface:<onto>` phải nằm trong supportedBy. Từng chạm/quệt mặt đích trước đó không đủ, và chưa từng chạm
    // nó cũng không bị coi là "chưa nằm yên". Quy ước chồng vật: đạo cụ nằm trên đạo cụ khác mà không chạm trực tiếp mặt
    // đích ⇒ sai đích (chưa hỗ trợ "đích = đạo cụ"), bất kể trước đó nó từng quệt mặt nào.
    const ontoKey = `surface:${d.onto}`;
    const settled = tr.poses.filter((q) => q.frame > tr.restFrame - REST_FRAMES);
    const off = settled.filter((q) => !q.supportedBy.includes(ontoKey));
    if (off.length > 0 || !fc) {
      const actual = [...new Set((off.length ? off : settled).flatMap((q) => q.supportedBy))].sort();
      const w0 = tr.restFrame - REST_FRAMES + 1, last = tr.poses.at(-1)!.frame;
      const touch = fc ? `it touched "${d.onto}" at frame ${fc.frame} substep ${fc.substep}/${SUBSTEPS} — a touch is not a landing` : `it never touched "${d.onto}"`;
      fail('PHYSICS_WRONG_SUPPORT', `${where} frames ${w0}–${tr.restFrame}`, `"${d.prop}" comes to rest on ${actual.length ? actual.join(' + ') : 'nothing'}, not on its target "${d.onto}" (rest window ${w0}–${tr.restFrame}; ${off.length}/${settled.length} settled frames up to ${last} lack "${d.onto}"); ${touch}`);
    }
    out.set(d.id, { id: d.id, prop: d.prop, engine: `rapier2d-deterministic-compat@${RAPIER_VERSION}`, releaseFrame: tr.releaseFrame, landFrame: fc!.frame, firstContact: fc!, firstContactPoints: tr.firstContactPoints, contacts: tr.contacts, wakes: tr.wakes, restFrame: tr.restFrame, init: tr.init, poses: tr.poses });
  }
  return out;
}
