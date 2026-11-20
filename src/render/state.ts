import { fail } from '../core/errors.ts';
import type { SceneFrame, Sprite } from '../scene/sample.ts';
import type { DrawnFrame, DrawnSprite } from './types.ts';

/** Bán kính blur bóng đổ theo px art, làm tròn — cùng công thức Node và trang dùng để chọn texture bóng. */
export function shadowBlurArt(s: Sprite): number {
  return s.shadow ? Math.round(s.shadow.blur / s.scale) : 0;
}

/** State mà trang phải vẽ cho SceneFrame này. */
export function expectedState(f: SceneFrame): DrawnFrame {
  return {
    frame: f.frame,
    sprites: f.sprites.map(
      (s): DrawnSprite => ({
        id: s.id,
        sha256: s.assetSha256,
        x: s.x,
        y: s.y,
        rot: s.rot,
        scale: s.scale,
        flipX: s.flipX,
        opacity: s.opacity,
        shadow: s.shadow ? { dx: s.shadow.dx, dy: s.shadow.dy, blurArt: shadowBlurArt(s), opacity: s.shadow.opacity } : null,
      }),
    ),
  };
}

/** Sai số số thực khi đổi độ↔radian và qua Object3D; không phải ngưỡng chất lượng. */
const EPS = 1e-6;

export function compareState(expected: DrawnFrame, drawn: DrawnFrame): void {
  const at = `frame ${expected.frame}`;
  if (drawn.frame !== expected.frame) fail('RENDER_STATE_MISMATCH', at, `browser drew frame ${drawn.frame}`);
  if (drawn.sprites.length !== expected.sprites.length) {
    fail('RENDER_STATE_MISMATCH', at, `browser drew ${drawn.sprites.length} sprites, expected ${expected.sprites.length}`);
  }
  expected.sprites.forEach((e, i) => {
    const d = drawn.sprites[i]!;
    const where = `${at} sprite[${i}](${e.id})`;
    if (d.id !== e.id || d.sha256 !== e.sha256 || d.flipX !== e.flipX) {
      fail('RENDER_STATE_MISMATCH', where, `drew ${d.id}/${d.sha256.slice(0, 12)}/flip=${d.flipX}`);
    }
    for (const k of ['x', 'y', 'rot', 'scale', 'opacity'] as const) {
      if (!(Math.abs(d[k] - e[k]) <= EPS)) fail('RENDER_STATE_MISMATCH', `${where}.${k}`, `drew ${d[k]}, expected ${e[k]}`);
    }
    if ((d.shadow === null) !== (e.shadow === null)) fail('RENDER_STATE_MISMATCH', `${where}.shadow`, 'presence differs');
    if (d.shadow && e.shadow) {
      if (d.shadow.blurArt !== e.shadow.blurArt) fail('RENDER_STATE_MISMATCH', `${where}.shadow.blurArt`, `${d.shadow.blurArt} != ${e.shadow.blurArt}`);
      for (const k of ['dx', 'dy', 'opacity'] as const) {
        if (!(Math.abs(d.shadow[k] - e.shadow[k]) <= EPS)) fail('RENDER_STATE_MISMATCH', `${where}.shadow.${k}`, `drew ${d.shadow[k]}, expected ${e.shadow[k]}`);
      }
    }
  });
}
