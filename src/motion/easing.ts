/** Easing có tên. Mọi hàm: [0,1] → [0,1], f(0)=0, f(1)=1, đơn điệu không giảm. */
export const EASINGS = {
  linear: (t: number) => t,
  step: (t: number) => (t >= 1 ? 1 : 0),
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => (1 - Math.cos(t * Math.PI)) / 2,
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
} as const satisfies Record<string, (t: number) => number>;

export type EasingName = keyof typeof EASINGS;
export const EASING_NAMES = Object.keys(EASINGS) as [EasingName, ...EasingName[]];

export function ease(name: EasingName, t: number): number {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return EASINGS[name](c);
}
