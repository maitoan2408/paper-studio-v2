import { readFileSync, statSync } from 'node:fs';
import type { z } from 'zod';

/** Lỗi có mã. Mọi lỗi dữ liệu trong dự án dùng lớp này; in ra dạng `CODE: path — detail`. */
export class StudioError extends Error {
  readonly code: string;
  readonly path: string;
  readonly detail: string;

  constructor(code: string, path: string, detail: string) {
    super(`${code}: ${path} — ${detail}`);
    this.name = 'StudioError';
    this.code = code;
    this.path = path;
    this.detail = detail;
  }
}

export function fail(code: string, path: string, detail: string): never {
  throw new StudioError(code, path, detail);
}

/** Parse bằng zod; lỗi đầu tiên được đổi thành StudioError với mã cho trước. */
export function parseWith<S extends z.ZodType>(schema: S, data: unknown, code: string, label: string): z.output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${label}.${issue.path.join('.')}` : label;
  return fail(code, where, issue ? issue.message : 'invalid');
}

/** Đọc JSON với giới hạn kích thước; không fallback. */
export function readJsonFile(file: string, maxBytes = 4 * 1024 * 1024): unknown {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return fail('JSON_FILE_MISSING', file, 'file does not exist');
  }
  if (size > maxBytes) fail('JSON_TOO_LARGE', file, `${size} bytes > ${maxBytes}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return fail('JSON_PARSE', file, (e as Error).message);
  }
}
