'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

export function PixelateHeader() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-4 md:p-8 lg:p-12 bg-background">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          <div className="flex items-center justify-between">
            <div
              style={{ width: '48px', height: '48px', position: 'relative' }}
              onClick={() => router.replace('/')}
              className="cursor-pointer"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                sizes="48px"
                loading="eager"
                className="object-contain bg-[#30f] dark:bg-background"
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.replace('/generator')}
                className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit text-base sm:text-lg"
                style={{ fontFamily: 'var(--font-departure-mono)' }}
              >
                AI generate
              </button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
} 