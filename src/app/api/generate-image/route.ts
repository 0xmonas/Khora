import { NextResponse } from 'next/server';
import Replicate from "replicate";

const AI_MODELS = {
  KHORA: {
    version: "7498c642f7eebd7be9dd2af5dff40f11e8a59c501625bcd5b157a65ff7b70b08",
  },
  ZEREBRO: {
    version: "a7ef5162f8ddc5832d4b2ecde760933031cdd46d30aacc381af0473fffd7cd49",
  },
  BAYC: {
    version: "d111b63dd1444d142fe8a0c0812ce6796e270f05b791d48d2a5c6296627da82a",
  }
} as const;

export async function POST(request: Request) {
  try {
    const { prompt, selectedModel = 'KHORA' } = await request.json();
    
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Replicate API token is not configured' },
        { status: 500 }
      );
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400 }
      );
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // 1. Create prediction
    const prediction = await replicate.predictions.create({
      version: AI_MODELS[selectedModel as keyof typeof AI_MODELS].version,
      input: {
        model: "dev",
        prompt: prompt,
        go_fast: false,
        lora_scale: 1,
        megapixels: "1",
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "png",
        guidance_scale: 3,
        output_quality: 80,
        prompt_strength: 0.8,
        extra_lora_scale: 1,
        num_inference_steps: 28
      }
    });

    console.log('Prediction created:', prediction);

    // 2. Wait for prediction result with timeout
    let result = await replicate.predictions.get(prediction.id);
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds maximum

    while (result.status !== 'succeeded' && result.status !== 'failed') {
      if (attempts >= maxAttempts) {
        throw new Error('Image generation timed out');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = await replicate.predictions.get(prediction.id);
      console.log('Prediction status:', result.status);
      attempts++;
    }

    if (result.status === 'failed') {
      throw new Error('Prediction failed');
    }

    if (!result.output || !Array.isArray(result.output) || result.output.length === 0) {
      throw new Error('No output in prediction result');
    }

    const imageUrl = result.output[0];
    console.log('Final image URL:', imageUrl);

    return NextResponse.json({ imageUrl });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    );
  }
}