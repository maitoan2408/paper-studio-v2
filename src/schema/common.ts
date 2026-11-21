import { z } from 'zod';

export const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'id must match ^[a-z0-9][a-z0-9-]{0,63}$');
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be 64 lowercase hex chars');
export const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be MAJOR.MINOR.PATCH');
export const Finite = z.number().finite();
export const Vec2 = z.tuple([Finite, Finite]);

/** Trả về giá trị đầu tiên bị lặp, hoặc undefined. */
export function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return undefined;
}
