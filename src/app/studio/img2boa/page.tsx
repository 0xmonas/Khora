'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, Download, X } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function Img2BooaPage() {
  const [original, setOriginal] = useState<string | null>(null);
  const [originalRatio, setOriginalRatio] = useState<[number, number]>([1, 1]);
  const [result, setResult] = useState<string | null>(null);
  const [resultRatio, setResultRatio] = useState<[number, number]>([1, 1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, or WebP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10MB');
      return;
    }

    setError('');
    setResult(null);
    setLoading(true);

    // Show original preview and detect aspect ratio
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setOriginal(dataUrl);
      const img = new window.Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ratios: [number, number][] = [[1,1],[2,3],[3,2],[3,4],[4,3],[16,9],[9,16],[2,1],[1,2]];
        const aspect = w / h;
        let best: [number, number] = [1, 1];
        let bestDiff = Infinity;
        for (const [rw, rh] of ratios) {
          const diff = Math.abs(aspect - rw / rh);
          if (diff < bestDiff) { bestDiff = diff; best = [rw, rh]; }
        }
        setOriginalRatio(best);
        setResultRatio(best); // match skeleton aspect ratio while loading
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/img2boa', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to process image');

      setResult(data.image);
      if (data.ratio) setResultRatio(data.ratio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImage(file);
  }, [processImage]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const link = document.createElement('a');
    link.download = 'img2booa.png';
    link.href = result;
    link.click();
  }, [result]);

  const reset = useCallback(() => {
    setOriginal(null);
    setOriginalRatio([1, 1]);
    setResult(null);
    setResultRatio([1, 1]);
    setError('');
    setLoading(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="max-w-2xl space-y-8">

                {/* Back */}
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Studio
                </Link>

                {/* Title */}
                <div className="space-y-3">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                    BOOA Studio
                  </p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                    Img2Booa
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Turn any image into BOOA-style pixel art. C64 palette, 64x64 grid, Bayer dithering.
                  </p>
                </div>

                {/* Upload / Result */}
                {!original ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`w-full aspect-square max-w-sm border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-3 transition-colors ${
                      dragOver
                        ? 'border-neutral-900 dark:border-white bg-neutral-50 dark:bg-white/[0.02]'
                        : 'border-neutral-400 dark:border-neutral-600 hover:border-neutral-700 dark:hover:border-neutral-300'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-neutral-400" />
                    <p className="text-xs text-muted-foreground" style={font}>
                      Drop an image or click to upload
                    </p>
                    <p className="text-[10px] text-muted-foreground/60" style={font}>
                      PNG, JPG, WebP — max 10MB
                    </p>
                    <input
                      ref={inputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Side by side comparison */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Original */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>
                          Original
                        </span>
                        <div
                          className="w-full border-2 border-neutral-300 dark:border-neutral-600 overflow-hidden bg-neutral-100 dark:bg-neutral-800"
                          style={{ aspectRatio: `${originalRatio[0]}/${originalRatio[1]}` }}
                        >
                          <img
                            src={original}
                            alt="Original"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>

                      {/* Result */}
                      <div className="space-y-2">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>
                          BOOA
                        </span>
                        <div
                          className="w-full border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center"
                          style={{ aspectRatio: `${resultRatio[0]}/${resultRatio[1]}` }}
                        >
                          {loading ? (
                            <div className="w-full h-full p-2">
                              <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
                            </div>
                          ) : result ? (
                            <img
                              src={result}
                              alt="BOOA pixel art"
                              className="w-full h-full object-contain"
                              style={{ imageRendering: 'pixelated' }}
                            />
                          ) : error ? (
                            <span className="text-[10px] text-red-500 px-4 text-center" style={font}>{error}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={reset}
                        className="h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-xs dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors flex items-center gap-2"
                        style={font}
                      >
                        <X className="w-3.5 h-3.5" />
                        Reset
                      </button>
                      {result && (
                        <button
                          onClick={handleDownload}
                          className="h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors flex items-center gap-2"
                          style={font}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download PNG
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Error outside of result */}
                {error && !original && (
                  <p className="text-xs text-red-500" style={font}>{error}</p>
                )}

                {/* Info */}
                <div className="space-y-3 pt-4 border-t border-border">
                  <h2 className="text-sm text-foreground" style={font}>How it works</h2>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      ['64x64', 'Your image is downscaled to a 64x64 pixel grid'],
                      ['C64 Palette', 'Colors are quantized to the 16-color Commodore 64 palette'],
                      ['Bayer Dither', 'Ordered dithering adds texture and depth to the result'],
                    ].map(([title, desc]) => (
                      <div key={title}>
                        <span className="text-xs text-foreground" style={font}>{title}</span>
                        <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5" style={font}>{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
