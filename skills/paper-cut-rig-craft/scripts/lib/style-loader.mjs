/**
 * Fail-closed Style Grammar Pack loader & blueprint preset merger for paper-cut-rig-craft (v4.0).
 * Loads styles/<slug>/preset.json and merges default cadence/lighting into a blueprint
 * without overwriting any explicit author settings.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STYLES_DIR = resolve(__dirname, '../../styles');
const SAFE_STYLE_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function listAvailableStyles() {
  if (!existsSync(STYLES_DIR)) return [];
  return readdirSync(STYLES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(STYLES_DIR, d.name, 'preset.json')))
    .map((d) => d.name)
    .sort();
}

export function loadStylePreset(styleId, pushErr = null) {
  const available = listAvailableStyles();
  if (typeof styleId !== 'string' || !SAFE_STYLE_ID_RE.test(styleId) || !available.includes(styleId)) {
    if (pushErr) {
      pushErr(
        'BP_STYLE_UNKNOWN',
        'style',
        `unknown style "${styleId}". Available styles: [${available.join(', ')}]`,
      );
    }
    return null;
  }
  const presetPath = join(STYLES_DIR, styleId, 'preset.json');
  try {
    return JSON.parse(readFileSync(presetPath, 'utf8'));
  } catch (err) {
    if (pushErr) {
      pushErr('BP_STYLE_UNKNOWN', presetPath, `failed to parse style preset "${styleId}": ${err.message}`);
    }
    return null;
  }
}

/**
 * Merges declared blueprint.style preset defaults into a shallow-cloned blueprint.
 * Explicit author settings in blueprint.scene always take precedence over preset defaults.
 */
export function applyStylePreset(bp, pushErr = null) {
  if (!bp || typeof bp !== 'object' || Array.isArray(bp) || bp.style == null) return bp;
  const preset = loadStylePreset(bp.style, pushErr);
  if (!preset) return bp;
  const defScene = preset.sceneDefaults ?? {};
  const userScene = bp.scene && typeof bp.scene === 'object' ? bp.scene : {};
  return {
    ...bp,
    style: preset.id,
    scene: {
      ...defScene,
      ...userScene,
      cadence: {
        ...(defScene.cadence ?? {}),
        ...(userScene.cadence ?? {}),
      },
      lighting: {
        ...(defScene.lighting ?? {}),
        ...(userScene.lighting ?? {}),
      },
      ...(defScene.boxCavity || userScene.boxCavity
        ? {
            boxCavity: {
              ...(defScene.boxCavity ?? {}),
              ...(userScene.boxCavity ?? {}),
            },
          }
        : {}),
      ...(defScene.lighting3d || userScene.lighting3d
        ? {
            lighting3d: {
              ...(defScene.lighting3d ?? {}),
              ...(userScene.lighting3d ?? {}),
            },
          }
        : {}),
    },
  };
}
