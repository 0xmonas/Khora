export interface PromptVars {
  atlasWidth: number;
  atlasHeight: number;
  cellSize: number;
  cols: number;
  rows: number;
  tokenLabel: string;
  customLayoutDescription?: string;
  hasLayoutReference?: boolean;
  // Triggers row-major single-animation layout (used with a square-ish gen
  // grid to bypass image-model distortion on wide strips).
  rearrangedFrameCount?: number;
  // When true, the canonical reference is a user-uploaded character (not a
  // BOOA NFT). Prompt swaps BOOA-specific language for generic phrasing.
  isCustomCharacter?: boolean;
}

export function buildExtendPrompt(): string {
  return `The attached source image is a bust portrait of a pixel-art character — head and shoulders only. Extend it into a complete full-body sprite.

ABSOLUTE RULES:
- Keep every existing pixel of the head and shoulders EXACTLY as drawn in the source. Do not redraw, restyle, recolor, or reinterpret the head, face, eyes, mouth, nose, ears, horns, fins, antennae, hair, markings, or any visible accessory in the bust.
- The character's identity is whatever is drawn in the source image. You do not know what species, what name, what story. Do not infer. Do not improve. Do not stylize. Reproduce the existing pixels and add the missing body below them.
- Below the existing shoulders, add the missing parts: torso, arms, hands, legs, feet. The new pixels must match the source's palette, outline weight, and pixel cadence exactly. Sample colors from the source — do not introduce any color not already present.
- Pose: standing neutrally, feet on the ground, ready for sprite-sheet animation. Symmetric posture, arms at sides.

OUTPUT:
- Pure pixel art. Hard 1-2 px outlines. No anti-aliasing, no soft gradients, no shadows, no glow, no motion lines, no text, no UI.
- Background: flat bright green (#00FF00) chroma key, fully covering every transparent area. Single uniform shade, no gradient, no halo.
- Identity is locked to the source image. The output must read as the same character that is drawn in the source — full stop.`;
}

export function buildSpritePrompt(vars: PromptVars): string {
  const customLayout = vars.customLayoutDescription?.trim();
  const hasLayoutRef = vars.hasLayoutReference !== false;
  const isCustom = vars.isCustomCharacter === true;
  const charNoun = isCustom ? 'character' : 'BOOA';
  const charPossessive = isCustom ? "the character's" : "the BOOA's";
  const canonicalLabel = isCustom ? 'CANONICAL BASE' : 'CANONICAL BASE — the BOOA NFT';

  const intro = hasLayoutRef
    ? `You are generating a game-ready pixel-art sprite atlas. You receive TWO reference images.

REFERENCE 1 (LAYOUT TEMPLATE) provides the cell grid, frame positions, pose vocabulary, and motion logic. Use it ONLY for layout — what pose goes in which cell, how limbs swing between adjacent frames, direction handling.

REFERENCE 2 (${canonicalLabel}) is the character. Identity is locked to REFERENCE 2.

Do NOT redesign ${charPossessive} face, head, eyes, mouth, ears, horns, antennae, fins, markings, palette, outline weight, or silhouette. Do NOT transfer hair color, clothing, skin tone, eyewear, scarf, tail, prop, or any visual element from REFERENCE 1. Only the pose changes between cells; everything else stays as it is in REFERENCE 2.

${charPossessive[0].toUpperCase() + charPossessive.slice(1)} outfit, headwear, accessories, and any visible items are already drawn in REFERENCE 2 — copy them exactly, do not add or invent anything that is not visible there. Do not "improve" the ${charNoun}. Do not "stylize" it. Do not interpret it. Reproduce it.`
    : `You are generating a game-ready pixel-art sprite atlas. You receive ONE reference image.

The attached image is the ${canonicalLabel}. Identity is locked to it.

Do NOT redesign ${charPossessive} face, head, eyes, mouth, ears, horns, antennae, fins, markings, palette, outline weight, or silhouette. Only the pose changes between cells; everything else stays as it is in the canonical base.

${charPossessive[0].toUpperCase() + charPossessive.slice(1)} outfit, headwear, accessories, and any visible items are already drawn in the canonical base — copy them exactly, do not add or invent anything that is not visible there. Do not "improve" the ${charNoun}. Do not "stylize" it. Do not interpret it. Reproduce it.

The layout below is described in text only — no layout reference image is provided. Follow the description precisely.`;

  const rearranged = vars.rearrangedFrameCount && vars.rearrangedFrameCount > 0
    ? vars.rearrangedFrameCount
    : null;
  const totalCells = vars.cols * vars.rows;

  let layoutBlock: string;
  if (rearranged !== null) {
    const lastFrame = rearranged - 1;
    const blankCells = totalCells - rearranged;
    const blankNote = blankCells > 0
      ? `After frame ${lastFrame}, the remaining ${blankCells} cell${blankCells === 1 ? '' : 's'} at the end of the grid contain ONLY flat #00FF00 chroma. No character, no shrunken character, no distant character, no ghost, no silhouette, no partial pose, no motion blur, no decoration. Pure flat green pixels filling those cells edge to edge. Treat them as if they do not exist.`
      : `Every cell holds one keyframe.`;
    layoutBlock = `LAYOUT — single animation, ${rearranged} frames in row-major order
This atlas contains ONE animation cycle of ${rearranged} frames laid out left-to-right, top-to-bottom across the ${vars.cols} × ${vars.rows} grid:
- Frame 0 occupies the top-left cell (row 0, column 0).
- Frame 1 is the cell directly to its right (row 0, column 1).
- After frame ${vars.cols - 1}, frame ${vars.cols} starts a new row at row 1 column 0.
- Continue in this row-major order through frame ${lastFrame}.
${blankNote}

CRITICAL — uniform character scale across all ${rearranged} frames:
Every used cell contains the ${charNoun} at the IDENTICAL scale and vertical anchor. Same head height, same body proportions, same character size relative to the cell, feet on the bottom edge of the cell. Do not draw any frame at a smaller, larger, more distant, more zoomed-in, or differently-scaled version of the character. The only thing that changes between frames is the POSE of the limbs.

The animation:
${customLayout || 'A clean keyframed cycle of the action described above. Each frame is one distinct pose; consecutive frames must read as a smooth motion when played back as a flat strip in this order.'}`;
  } else if (customLayout) {
    layoutBlock = `LAYOUT (custom — described by the operator)
${customLayout}

Reproduce this layout across the ${vars.cols} columns × ${vars.rows} rows of the atlas.${hasLayoutRef ? " Every cell must contain the ${charNoun} in the matching pose described above. Use the reference image only for pose vocabulary and motion logic — if the operator's description conflicts with the reference, the description wins." : ' Every used cell must contain the ${charNoun} in the matching pose described above. Cells that are not part of any animation must be fully transparent (#00FF00 chroma).'}`;
  } else if (hasLayoutRef) {
    layoutBlock = `LAYOUT
Mirror the reference template (REFERENCE 1) cell-for-cell. Whatever pose, action, or direction the reference shows in each cell, reproduce that pose with ${charPossessive} identity. All ${totalCells} cells must contain the ${charNoun} in a pose; do not leave cells empty unless the reference cell is empty.`;
  } else {
    layoutBlock = `LAYOUT
${vars.cols} columns × ${vars.rows} rows of ${vars.cellSize}×${vars.cellSize} cells. Each row is one animation; each cell is one keyframe of that animation. Without further direction, draw a top-down RPG layout: row 0 idle (south), row 1 walk south, row 2 walk west, row 3 walk east, row 4 walk north. Beyond row 4, fill remaining rows with reasonable additional poses.`;
  }

  const successCriterion = isCustom
    ? hasLayoutRef
      ? `A viewer who has never seen REFERENCE 1 must look at this atlas and immediately recognize the same character from REFERENCE 2 in every frame. Identity is locked to REFERENCE 2, full stop. The reference template is invisible.`
      : `A viewer must look at this atlas and immediately recognize the same character from the canonical base in every frame. Identity is locked to the canonical base, full stop.`
    : hasLayoutRef
      ? `A holder of ${vars.tokenLabel} who has never seen REFERENCE 1 must look at this atlas and immediately recognize their BOOA in every frame. The character is the BOOA, full stop. The reference template is invisible.`
      : `A holder of ${vars.tokenLabel} must look at this atlas and immediately recognize their BOOA in every frame. The character is the BOOA, full stop.`;

  const paletteRule = hasLayoutRef
    ? `Use only colors that already appear in REFERENCE 2, plus the chroma-key background. Do not introduce any new color, lighting, or material.`
    : `Use only colors that already appear in the canonical base reference, plus the chroma-key background. Do not introduce any new color, lighting, or material.`;

  return `${intro}

OUTPUT
A single PNG sprite atlas at exactly ${vars.atlasWidth}×${vars.atlasHeight} pixels, ${vars.cols} columns × ${vars.rows} rows of ${vars.cellSize}×${vars.cellSize} cells. The grid is INVISIBLE — no cell borders, no dividers, no separator lines, no gutters, no margin marks, no row/column rulers, no frame numbers, no labels, no text, no UI. The chroma background must flow continuously across the whole atlas as if cells did not exist. Each used cell holds one frame of the ${charNoun} in the matching pose. Character centered horizontally, feet on the bottom edge of each cell.

UNIFORM SCALE
The ${charNoun} must appear at the SAME scale, head height, body proportions, and vertical anchor in every used cell of the atlas. Pose changes between frames; size, distance, and framing do NOT. Never draw a smaller, larger, distant, zoomed-in, or perspective-shifted version of the character. If the ${charNoun} fills 80% of cell 0's height, it fills 80% of every other used cell's height too.

${layoutBlock}

BACKGROUND
Flat bright green (#00FF00) chroma key, fully covering every transparent area inside and around the character. The chroma key must be a single uniform shade — no gradient, no texture, no anti-aliasing into character pixels, no faint outline of cells, no tonal shift between cells. Empty cells (those past a row's frame count, or unused) are also flat #00FF00 with NOTHING drawn on them — no character, no shrunken figure, no ghost.

PIXEL DISCIPLINE
Pure pixel art. Hard 1-2 px outlines. No anti-aliasing, no soft gradients, no painterly texture, no glow, no motion lines, no shadows, no particles, no sparkles, no cell-edge highlights, no frame separators. Step every diagonal as discrete pixels.

PALETTE
${paletteRule}

SUCCESS CRITERION
${successCriterion}`;
}
