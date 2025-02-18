import { Sun, Moon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

const Header = () => {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={() => router.replace('/pixelate')}
        className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit text-base sm:text-lg"
        style={{ fontFamily: 'var(--font-departure-mono)' }}
      >
        Pixelator
      </button>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  );
};

export default Header; 