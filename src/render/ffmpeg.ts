import { spawn, spawnSync } from 'node:child_process';
import { fail } from '../core/errors.ts';

const FFMPEG = process.env['FFMPEG_PATH'] ?? 'ffmpeg';
const FFPROBE = process.env['FFPROBE_PATH'] ?? 'ffprobe';

export function toolVersion(bin: 'ffmpeg' | 'ffprobe'): string {
  const r = spawnSync(bin === 'ffmpeg' ? FFMPEG : FFPROBE, ['-version'], { encoding: 'utf8' });
  if (r.status !== 0) fail('ENV_FFMPEG_MISSING', bin, r.error ? r.error.message : r.stderr);
  return r.stdout.split('\n')[0]!.trim();
}

/**
 * H.264 yuv420p BT.709, tham số cố định để tất định: 1 luồng, bitexact, không metadata.
 * Ma trận màu ghi rõ khi đổi RGB→YUV (và ngược lại khi audit).
 */
export const ENCODE_ARGS = (w: number, h: number, fps: number, out: string) => [
  '-v', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-threads', '1', '-x264-params', 'threads=1',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-fflags', '+bitexact', '-flags:v', '+bitexact', '-map_metadata', '-1', '-movflags', '+faststart',
  out,
];

export interface Encoder {
  write(rgba: Buffer): Promise<void>;
  finish(): Promise<void>;
}

export function startEncoder(w: number, h: number, fps: number, out: string): Encoder {
  const p = spawn(FFMPEG, ENCODE_ARGS(w, h, fps, out), { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  p.stderr.on('data', (d) => (stderr += d));
  const done = new Promise<void>((resolve, reject) => {
    p.on('error', (e) => reject(e));
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}: ${stderr}`))));
  });
  done.catch(() => undefined);
  return {
    write: (rgba) =>
      new Promise((resolve, reject) => {
        if (rgba.length !== w * h * 4) return reject(new Error(`frame is ${rgba.length} bytes`));
        if (p.stdin.write(rgba)) resolve();
        else p.stdin.once('drain', resolve);
      }),
    finish: async () => {
      p.stdin.end();
      try {
        await done;
      } catch (e) {
        fail('RENDER_ENCODE', out, (e as Error).message);
      }
    },
  };
}

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  rFrameRate: string;
  pixFmt: string;
  frames: number;
}

export function probe(file: string): ProbeResult {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,width,height,r_frame_rate,pix_fmt,nb_read_frames', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) fail('PROBE_FAILED', file, r.stderr);
  const s = (JSON.parse(r.stdout) as { streams?: Record<string, unknown>[] }).streams?.[0];
  if (!s) return fail('PROBE_FAILED', file, 'no video stream');
  return {
    codec: String(s['codec_name']),
    width: Number(s['width']),
    height: Number(s['height']),
    rFrameRate: String(s['r_frame_rate']),
    pixFmt: String(s['pix_fmt']),
    frames: Number(s['nb_read_frames']),
  };
}

/** Kiểm container đúng 1920x1080, 24/1, yuv420p, h264, đúng số frame. */
export function checkProbe(file: string, expect: { width: number; height: number; fps: number; frames: number }): ProbeResult {
  const p = probe(file);
  const want: ProbeResult = { codec: 'h264', width: expect.width, height: expect.height, rFrameRate: `${expect.fps}/1`, pixFmt: 'yuv420p', frames: expect.frames };
  for (const k of Object.keys(want) as (keyof ProbeResult)[]) {
    if (p[k] !== want[k]) fail('PROBE_MISMATCH', `${file}.${k}`, `got ${p[k]}, expected ${want[k]}`);
  }
  return p;
}

/** Decode toàn bộ; -xerror dừng ở lỗi đầu tiên. Có bất kỳ thông báo lỗi nào cũng là FAIL. */
export function decodeAll(file: string): void {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.status !== 0 || r.stderr.trim() !== '') fail('DECODE_FAILED', file, r.stderr.trim() || `exit ${r.status}`);
}

/** Trích các frame (theo chỉ số) về RGBA, dùng đúng ma trận BT.709 như lúc encode. */
export function extractFrames(file: string, w: number, h: number, indices: number[]): Map<number, Buffer> {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const select = sorted.map((i) => `eq(n\\,${i})`).join('+');
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-vf', `select='${select}',scale=in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgba`,
    '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 2 ** 31 });
  if (r.status !== 0) fail('DECODE_FAILED', file, r.stderr.toString());
  const size = w * h * 4;
  if (r.stdout.length !== size * sorted.length) fail('DECODE_FAILED', file, `extracted ${r.stdout.length} bytes for ${sorted.length} frames`);
  return new Map(sorted.map((i, k) => [i, r.stdout.subarray(k * size, (k + 1) * size)]));
}

/** PSNR trên kênh RGB (bỏ alpha), dB. */
export function psnr(a: Buffer, b: Buffer): number {
  if (a.length !== b.length) fail('PSNR_SIZE', 'psnr', `${a.length} != ${b.length}`);
  let se = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = a[i + c]! - b[i + c]!;
      se += d * d;
      n++;
    }
  }
  return se === 0 ? Infinity : 10 * Math.log10((255 * 255 * n) / se);
}

/** Bản xem chậm 0.5× và contact sheet — chỉ để người duyệt xem, không phải đầu ra được audit. */
export function reviewCopies(mp4: string, frames: number, half: string, sheet: string): void {
  const step = Math.max(1, Math.floor(frames / 16));
  const rows = Math.ceil(Math.ceil(frames / step) / 4);
  for (const args of [
    ['-v', 'error', '-y', '-i', mp4, '-vf', 'setpts=2.0*PTS', '-r', '24', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', half],
    ['-v', 'error', '-y', '-i', mp4, '-vf', `select='not(mod(n\\,${step}))',scale=480:-1,tile=4x${rows}`, '-frames:v', '1', '-update', '1', sheet],
  ]) {
    const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    if (r.status !== 0) fail('REVIEW_COPY_FAILED', args[args.length - 1]!, r.stderr);
  }
}
