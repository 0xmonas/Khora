import { describe, it, expect, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
  Type: { STRING: 'STRING', INTEGER: 'INTEGER', NUMBER: 'NUMBER', BOOLEAN: 'BOOLEAN', OBJECT: 'OBJECT', ARRAY: 'ARRAY' },
}));

describe('runBooask', () => {
  it('stops running tools once a question has used its tool budget', async () => {
    process.env.GEMINI_API_KEY = 'test';
    generateContent.mockResolvedValue({
      candidates: [{ content: { parts: Array.from({ length: 5 }, () => ({ functionCall: { name: 'getCollectionStats', args: {} } })) } }],
    });
    const exec = vi.fn(async () => ({ ok: true }));
    const { runBooask } = await import('@/lib/booask/llm');
    await runBooask({ message: 'q', history: [], toolDefs: [], executors: { getCollectionStats: exec } });
    expect(exec).toHaveBeenCalledTimes(8);
  });
});
