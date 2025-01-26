// pngEncoder.ts
import { CharacterTemplate } from '@/types/templates';
import extractChunks from 'png-chunks-extract';
import encodeChunks from 'png-chunks-encode';

export async function embedJsonInPng(imageUrl: string, jsonData: CharacterTemplate): Promise<Blob> {
  try {
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const chunks = extractChunks(uint8Array);
    const { type, ...dataWithoutType } = jsonData;
    const textData = new TextEncoder().encode(`CharacterData\0${JSON.stringify(dataWithoutType)}`);
    
    const textChunk = {
      name: 'tEXt',
      data: textData
    };

    chunks.splice(-1, 0, textChunk);
    const newPngBuffer = encodeChunks(chunks);

    return new Blob([newPngBuffer], { type: 'image/png' });
  } catch (error) {
    console.error('Error embedding JSON in PNG:', error);
    throw error;
  }
}