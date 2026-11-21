/**
 * Server tin cậy cho trang render: chỉ nghe 127.0.0.1, chỉ GET/HEAD, chỉ phục vụ đường dẫn có trong
 * allowlist (nội dung giữ trong bộ nhớ, hash tính lúc đăng ký). Không đọc file theo URL.
 * `faults` chỉ dùng cho check:renderer (tiêm lỗi texture); lệnh render không truyền nó.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fail } from '../core/errors.ts';
import { sha256Hex } from '../core/hash.ts';

export interface Route {
  body: Buffer;
  type: string;
  sha256: string;
}

export function route(body: Buffer | string, type: string): Route {
  const b = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return { body: b, type, sha256: sha256Hex(b) };
}

export interface Faults {
  notFound?: ReadonlySet<string>;
  /** Đổi 1 byte khi gửi (hash sai). */
  tamper?: ReadonlySet<string>;
  /** Trễ trước khi trả lời (ms). */
  delayMs?: ReadonlyMap<string, number>;
}

export interface RunningServer {
  origin: string;
  close(): Promise<void>;
}

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "connect-src 'self'",
  "img-src 'self' blob:",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export async function startServer(routes: ReadonlyMap<string, Route>, faults: Faults = {}): Promise<RunningServer> {
  for (const p of routes.keys()) if (!/^\/[A-Za-z0-9._/-]*$/.test(p) || p.includes('..')) fail('SERVER_ROUTE', p, 'invalid route path');
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const send = (status: number, body: Buffer | string, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, {
        'content-type': type,
        'content-security-policy': CSP,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
        'cross-origin-resource-policy': 'same-origin',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'method not allowed');
    const r = routes.get(path);
    if (!r || faults.notFound?.has(path)) return send(404, 'not found');
    let body = r.body;
    if (faults.tamper?.has(path)) {
      body = Buffer.from(body);
      body[body.length - 2] = (body[body.length - 2]! ^ 0x01) & 0xff;
    }
    const delay = faults.delayMs?.get(path) ?? 0;
    if (delay > 0) setTimeout(() => send(200, body, r.type), delay);
    else send(200, body, r.type);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const addr = server.address() as AddressInfo;
  if (addr.address !== '127.0.0.1') fail('SERVER_BIND', addr.address, 'server must bind 127.0.0.1 only');
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
