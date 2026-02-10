import type { KhoraAgent } from '@/types/agent';
import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';

export async function embedJsonInPng(imageUrl: string, jsonData: KhoraAgent): Promise<Blob> {
  let uint8Array: Uint8Array;

  if (imageUrl.startsWith('data:')) {
    const base64 = imageUrl.split(',')[1];
    const binaryString = atob(base64);
    uint8Array = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      uint8Array[i] = binaryString.charCodeAt(i);
    }
  } else {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    uint8Array = new Uint8Array(arrayBuffer);
  }

  const chunks = extractChunks(uint8Array);
  const { image, ...dataWithoutImage } = jsonData;
  const textData = new TextEncoder().encode(`KhoraAgent\0${JSON.stringify(dataWithoutImage)}`);

  const textChunk = {
    name: 'tEXt',
    data: textData
  };

  chunks.splice(-1, 0, textChunk);
  const newPngBuffer = encodeChunks(chunks);

  return new Blob([newPngBuffer.buffer as ArrayBuffer], { type: 'image/png' });
}
