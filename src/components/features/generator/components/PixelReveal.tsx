'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PixelRevealProps {
  src: string;
  alt: string;
  className?: string;
  stepDuration?: number;
}

const STEPS = [8, 16, 32, 64];

export function PixelReveal({
  src,
  alt,
  className = '',
  stepDuration = 150,
}: PixelRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  const [animDone, setAnimDone] = useState(false);

  // Reset animation when src changes
  if (src !== prevSrc) {
    setPrevSrc(src);
    setImageLoaded(false);
    setAnimDone(false);
  }

  const renderStep = useCallback((stepIndex: number) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Use the image's natural dimensions for canvas
    // Since pixel art is 1024x1024 (64x64 scaled 16x), keep canvas square
    const size = img.naturalWidth || 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixelSize = STEPS[stepIndex];
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    // Draw image at low resolution then scale up — blocky pixel effect
    ctx.drawImage(img, 0, 0, pixelSize, pixelSize);
    ctx.drawImage(canvas, 0, 0, pixelSize, pixelSize, 0, 0, size, size);
  }, []);

  useEffect(() => {
    if (!imageLoaded) return;

    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Start: show canvas, hide img
    canvas.style.opacity = '1';
    img.style.opacity = '0';

    let stepIndex = 0;
    renderStep(0);

    const interval = setInterval(() => {
      stepIndex++;
      if (stepIndex < STEPS.length) {
        renderStep(stepIndex);
      } else {
        clearInterval(interval);
        // Crossfade: hide canvas, show real image
        canvas.style.opacity = '0';
        img.style.opacity = '1';
        setAnimDone(true);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [imageLoaded, stepDuration, renderStep]);

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Canvas and img share the same sizing via max-w/max-h + object-contain */}
      <canvas
        ref={canvasRef}
        className={`absolute max-w-full max-h-full object-contain transition-opacity duration-200 ${animDone ? 'pointer-events-none' : ''}`}
        style={{ opacity: 0, imageRendering: 'pixelated' }}
      />
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain transition-opacity duration-200"
        style={{ opacity: 0, imageRendering: 'pixelated' }}
        onLoad={() => setImageLoaded(true)}
      />
    </div>
  );
}
