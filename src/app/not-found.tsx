'use client';

import Link from 'next/link';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { useEffect, useState } from 'react';

function GlitchText({ text, className }: { text: string; className?: string }) {
  const [display, setDisplay] = useState(text);
  const glitchChars = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`0123456789';

  useEffect(() => {
    let frame = 0;
    const maxFrames = text.length * 3;

    const interval = setInterval(() => {
      if (frame >= maxFrames) {
        setDisplay(text);
        clearInterval(interval);
        return;
      }

      const resolved = Math.floor(frame / 3);
      const result = text
        .split('')
        .map((char, i) => {
          if (i < resolved) return char;
          if (char === ' ') return ' ';
          return glitchChars[Math.floor(Math.random() * glitchChars.length)];
        })
        .join('');

      setDisplay(result);
      frame++;
    }, 30);

    return () => clearInterval(interval);
  }, [text]);

  return <span className={className}>{display}</span>;
}

export default function NotFound() {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-6 space-y-4">
            <div className="font-mono text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
              <GlitchText text="SIGNAL NOT FOUND" />
            </div>

            <h1 className="font-mono text-7xl sm:text-8xl font-bold text-neutral-900 dark:text-white tracking-tighter">
              404
            </h1>

            <div className="font-mono text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
              <p>The coordinates you entered lead to void space.</p>
              <p className="text-neutral-400 dark:text-neutral-500">
                {'> '}<span className="text-neutral-600 dark:text-neutral-300">route_not_found</span>
                <span className={cursorVisible ? 'opacity-100' : 'opacity-0'}>_</span>
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="h-10 px-5 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-xs flex items-center hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors"
            >
              RETURN HOME
            </Link>
            <Link
              href="/booa"
              className="h-10 px-5 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono text-xs flex items-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
            >
              EXPLORE BOOA
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
