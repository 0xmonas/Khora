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

  it('does not point anyone at Cobbee or a retired blog post', async () => {
    process.env.GEMINI_API_KEY = 'test';
    generateContent.mockReset();
    generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    const { runBooask } = await import('@/lib/booask/llm');
    await runBooask({ message: 'q', history: [], toolDefs: [], executors: {} });
    const prompt: string = generateContent.mock.calls[0][0].config.systemInstruction;
    expect(prompt).not.toMatch(/cobbee|your-agent-your-rules|activate-your-agent|blog\/booa-api|Retrospective/i);
  });
});
