// Validation + sanitization for Writers Room user inputs.
// Inputs are displayed as plain text via React, so we keep the text human
// (newlines preserved) but strip control chars and length-bound everything.

import {
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MAX_TOKEN_TAGS_PER_SUBMISSION,
  PROMPT_MAX,
  TOKEN_ID_MAX,
} from './types';

// Match #NNN tags in free text. Word boundary on both sides so "#word" or
// "channel#1" don't trigger false positives, only standalone numeric tags.
const TOKEN_TAG_RE = /(?<![\w#])#(\d{1,5})\b/g;

const ADDRESS_RE = /^0x[a-f0-9]{40}$/i;

// Strip null bytes and ASCII control chars except newline (LF) and tab.
function stripControl(s: string): string {
  return s.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
}

function clean(s: string, max: number): string {
  return stripControl(s)
    // Collapse triple+ newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

export function isValidAddress(address: string): boolean {
  return typeof address === 'string' && ADDRESS_RE.test(address);
}

export function isValidTokenId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= TOKEN_ID_MAX
  );
}

// Extract #NNN tags from free text. Returns the deduped, validated, capped
// list of token ids. Tags out of range (or beyond the cap) are dropped
// silently — this lets a holder include "#9999" in dialogue without their
// whole submission failing.
export function extractTokenTags(text: string): number[] {
  if (!text) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  const matches = Array.from(text.matchAll(TOKEN_TAG_RE));
  for (const match of matches) {
    const num = Number.parseInt(match[1], 10);
    if (!Number.isInteger(num)) continue;
    if (num < 0 || num > TOKEN_ID_MAX) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    out.push(num);
    if (out.length >= MAX_TOKEN_TAGS_PER_SUBMISSION) break;
  }
  return out;
}

export interface ValidatedSubmission {
  caption: string;
  description: string;
  prompt: string;
  tokenIds: number[];
}

export function validateSubmissionInput(raw: unknown): ValidatedSubmission {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid request body.');
  }
  const r = raw as Record<string, unknown>;

  const captionRaw = typeof r.caption === 'string' ? r.caption : '';
  const descriptionRaw = typeof r.description === 'string' ? r.description : '';
  const promptRaw = typeof r.prompt === 'string' ? r.prompt : '';

  const caption = clean(captionRaw, CAPTION_MAX);
  const description = clean(descriptionRaw, DESCRIPTION_MAX);
  const prompt = clean(promptRaw, PROMPT_MAX);

  if (caption.length === 0) throw new Error('Caption is required.');
  if (description.length === 0) throw new Error('Description is required.');
  if (prompt.length === 0) throw new Error('Prompt is required.');

  const tokenIds = extractTokenTags(description);

  return { caption, description, prompt, tokenIds };
}

export interface DaySeedInput {
  caption: string;
  description: string;
  tokenId: number | null;
  imageUrl: string | null;
}

export function validateDaySeedInput(raw: unknown): DaySeedInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid request body.');
  }
  const r = raw as Record<string, unknown>;

  const captionRaw = typeof r.caption === 'string' ? r.caption : '';
  const descriptionRaw = typeof r.description === 'string' ? r.description : '';
  const caption = clean(captionRaw, CAPTION_MAX);
  const description = clean(descriptionRaw, DESCRIPTION_MAX);

  if (caption.length === 0) throw new Error('Caption is required.');
  if (description.length === 0) throw new Error('Description is required.');

  const tokenId =
    r.tokenId === null || r.tokenId === undefined
      ? null
      : isValidTokenId(r.tokenId)
        ? (r.tokenId as number)
        : null;

  const imageUrlRaw = typeof r.imageUrl === 'string' ? r.imageUrl.trim() : '';
  const imageUrl =
    imageUrlRaw.length > 0 && imageUrlRaw.length <= 2048
      ? imageUrlRaw
      : null;

  return { caption, description, tokenId, imageUrl };
}
