/**
 * Rapier 2D bản tất định (IEEE, giống từng bit trên mọi máy) — module lá, khởi tạo WASM một lần (top-level await).
 * Ghim phiên bản: kết quả mô phỏng đi thẳng vào SceneFrame (tất định mức 1), nên đổi phiên bản = đổi golden.
 */
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { fail } from '../core/errors.ts';

export const RAPIER_VERSION = '0.21.0';
await RAPIER.init();
if (RAPIER.version() !== RAPIER_VERSION) fail('PHYSICS_ENGINE_VERSION', 'rapier2d-deterministic-compat', `loaded ${RAPIER.version()}, pinned ${RAPIER_VERSION}`);
export { RAPIER };
