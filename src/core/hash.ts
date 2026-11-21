import { createHash } from 'node:crypto';
import { fail } from './errors.ts';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * JSON canonical: key sắp theo thứ tự code unit, không khoảng trắng.
 * Từ chối giá trị không biểu diễn được ổn định (NaN, Infinity, undefined, hàm, -0).
 */
export function canonicalJson(value: unknown, path = '$'): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) fail('HASH_NON_CANONICAL', path, `non-finite number ${value}`);
      if (Object.is(value, -0)) fail('HASH_NON_CANONICAL', path, 'negative zero');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v, i) => canonicalJson(v, `${path}[${i}]`)).join(',')}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail('HASH_NON_CANONICAL', path, 'not a plain object');
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k], `${path}.${k}`)}`).join(',')}}`;
    }
    default:
      return fail('HASH_NON_CANONICAL', path, `unsupported type ${typeof value}`);
  }
}

export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
