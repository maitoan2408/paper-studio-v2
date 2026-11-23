/**
 * Sheet duyệt hình (M1a): model sheet / sheet tư thế là DỮ LIỆU. Mỗi ô là một frame của phim có sẵn (đổi skin nếu cần)
 * hoặc một tư thế tổng hợp (góc khớp tuyệt đối); variant (thân, tay…) chọn bằng clip tổng hợp đi qua cùng validator.
 */
import { z } from 'zod';
import { parseWith } from '../core/errors.ts';

const Id = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);
const Bone = z.string().regex(/^[a-z][a-z0-9-]*(\.[lr])?$/);

const View = z
  .object({
    /** Xương làm tâm vùng cắt (pivot của sprite xương đó), hoặc "body" = khung bao toàn thân nhân vật. */
    around: z.union([Bone, z.literal('body')]).default('body'),
    /** Kích thước vùng cắt trên khung 1920×1080 (px màn hình). */
    size: z.tuple([z.number().int().min(16).max(1920), z.number().int().min(16).max(1080)]).default([420, 620]),
    /** Dời tâm vùng cắt (px màn hình). */
    offset: z.tuple([z.number(), z.number()]).default([0, 0]),
    /** Phóng to khi xuất. */
    zoom: z.number().min(0.25).max(6).default(1),
  })
  .strict();

const FilmSource = z
  .object({
    film: z.string().regex(/^examples\/films\/[a-z0-9-]+\.json$/),
    frame: z.number().int().min(0),
    /** Đổi pack nhân vật: { "demo-cast": "xuong-giay" } — rig và tên clip phải tương thích (validator kiểm). */
    reskin: z.record(Id, Id).default({}),
  })
  .strict();

const PoseSource = z
  .object({
    pack: Id,
    /** Góc khớp tuyệt đối (độ) — validator kiểm giới hạn khớp như mọi action. */
    angles: z.record(Bone, z.number().finite()).default({}),
    facing: z.enum(['left', 'right']).default('right'),
    scale: z.number().positive().default(1.35),
  })
  .strict();

const Panel = z
  .object({
    label: z.string().min(1).max(120),
    /** id nhân vật trong phim (với film) hoặc trong rig (với pose). */
    character: Id,
    source: z.union([z.object({ film: FilmSource }).strict(), z.object({ pose: PoseSource }).strict()]),
    /** Variant theo xương của nhân vật này ở frame được chụp, vd { "torso": "three-quarter", "hand.r": "relaxed" }. */
    variants: z.record(Bone, z.string().regex(/^[a-z][a-z0-9-]*$/)).default({}),
    view: View.default({ around: 'body', size: [420, 620], offset: [0, 0], zoom: 1 }),
    note: z.string().max(240).optional(),
  })
  .strict();

const SheetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: Id,
    title: z.string().min(1).max(160),
    columns: z.number().int().min(1).max(8).default(3),
    panels: z.array(Panel).min(1).max(60),
  })
  .strict();

export type SheetSpec = z.output<typeof SheetSchema>;
export type SheetPanel = z.output<typeof Panel>;

export function parseSheet(raw: unknown): SheetSpec {
  return parseWith(SheetSchema, raw, 'SHEET_SCHEMA', 'sheet');
}
