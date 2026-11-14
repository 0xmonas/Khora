import { describe, it, expect } from 'vitest';
import { buildGallery, selectGallery } from '@/hooks/useGalleryTokens';

const names = Array.from({ length: 3333 }, (_, i) => (i === 3000 ? 'Ink-Sync' : `Agent ${i}`));

describe('gallery list', () => {
  it('newest starts at the last BOOA and covers the whole collection', () => {
    const list = selectGallery(buildGallery(names, null, 'newest'), 'newest', '');
    expect(list).toHaveLength(3333);
    expect(list[0].tokenId).toBe(BigInt(3332));
    expect(list[list.length - 1].tokenId).toBe(BigInt(0));
  });

  it('oldest starts at #0', () => {
    expect(selectGallery(buildGallery(names, null, 'oldest'), 'oldest', '')[0].tokenId).toBe(BigInt(0));
  });

  it('search finds a BOOA by name anywhere in the collection', () => {
    const hits = selectGallery(buildGallery(names, null, 'newest'), 'newest', 'ink-sync');
    expect(hits.map((t) => t.tokenId)).toEqual([BigInt(3000)]);
  });

  it('mine lists only the wallet BOOAs, newest first, and the collection marks them as owned', () => {
    const owned = new Set(['5', '1496', '3200']);
    expect(selectGallery(buildGallery(names, owned, 'mine'), 'mine', '').map((t) => Number(t.tokenId))).toEqual([3200, 1496, 5]);
    expect(buildGallery(names, owned, 'newest').filter((t) => t.isOwned)).toHaveLength(3);
  });

  it('shows the token number until names load', () => {
    expect(buildGallery(null, null, 'newest')[7].name).toBe('#7');
  });
});
