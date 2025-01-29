import { NextResponse } from 'next/server';
import Replicate from "replicate";

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();
    
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'Replicate API token is not configured' },
        { status: 500 }
      );
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // 1. Create prediction
    const prediction = await replicate.predictions.create({
      version: "7498c642f7eebd7be9dd2af5dff40f11e8a59c501625bcd5b157a65ff7b70b08",
      input: {
        prompt: prompt,
        model: "dev",
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "png",
        guidance_scale: 3,
        prompt_strength: 0.8,
        num_inference_steps: 28,
        output_quality: 80
      }
    });

    console.log('Prediction created:', prediction);

    // 2. Wait for prediction result
    let result = await replicate.predictions.get(prediction.id);

    // Wait until result is ready
    while (result.status !== 'succeeded' && result.status !== 'failed') {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      result = await replicate.predictions.get(prediction.id);
      console.log('Prediction status:', result.status);
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