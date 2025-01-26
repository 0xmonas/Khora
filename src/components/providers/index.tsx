import { ThemeProvider } from './theme-provider';
import { GeneratorProvider } from '@/components/features/generator/GeneratorContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <GeneratorProvider>
        {children}
      </GeneratorProvider>
    </ThemeProvider>
  );
}