// Sprite Shop prompt builder. Identity-locked, avatar-authoritative.
// Mirrors the prompts/sprite.txt from booa-sprite repo.

export interface PromptVars {
  atlasWidth: number;
  atlasHeight: number;
  cellSize: number;
  tokenLabel: string; // e.g. "BOOA #847" or "Custom"
}

export function buildSpritePrompt(vars: PromptVars): string {
  return `You are generating a game-ready pixel-art sprite atlas. You receive TWO reference images.

REFERENCE 1 (LAYOUT TEMPLATE) provides the cell grid, frame positions, pose vocabulary, and motion logic. Use it ONLY for layout — what pose goes in which cell, how limbs swing between adjacent frames, direction handling.

REFERENCE 2 (CANONICAL BASE — the BOOA NFT) is the character. Identity is locked to REFERENCE 2.

Do NOT redesign the BOOA's face, head, eyes, mouth, ears, horns, antennae, fins, markings, palette, outline weight, or silhouette. Do NOT transfer hair color, clothing, skin tone, eyewear, scarf, tail, prop, or any visual element from REFERENCE 1. Only the pose changes between cells; everything else stays as it is in REFERENCE 2.

The BOOA's outfit, headwear, accessories, and any visible items are already drawn in REFERENCE 2 — copy them exactly, do not add or invent anything that is not visible there. Do not "improve" the BOOA. Do not "stylize" it. Do not interpret it. Reproduce it.

OUTPUT
A single PNG sprite atlas at exactly ${vars.atlasWidth}×${vars.atlasHeight} pixels, 6 columns × 8 rows of ${vars.cellSize}×${vars.cellSize} cells. No borders, no gutters, no labels, no text, no UI. Each cell holds one frame of the BOOA in the matching pose from REFERENCE 1's same cell. Character centered horizontally, feet on the bottom edge of each cell.

BACKGROUND
Flat bright green (#00FF00) chroma key, fully covering every transparent area inside and around the character. The chroma key must be a single uniform shade — no gradient, no texture, no anti-aliasing into character pixels. Empty cells (if any in the reference) are also flat #00FF00.

PIXEL DISCIPLINE
Pure pixel art. Hard 1-2 px outlines. No anti-aliasing, no soft gradients, no painterly texture, no glow, no motion lines, no shadows, no particles, no sparkles. Step every diagonal as discrete pixels.

PALETTE
Use only colors that already appear in REFERENCE 2, plus the chroma-key background. Do not introduce any new color, lighting, or material.

SUCCESS CRITERION
A holder of ${vars.tokenLabel} who has never seen REFERENCE 1 must look at this atlas and immediately recognize their BOOA in every frame. The character is the BOOA, full stop. The reference template is invisible.`;
}
