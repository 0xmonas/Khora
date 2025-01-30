import { ThemeProvider } from './theme-provider';
import { GeneratorProvider } from '@/components/features/generator/GeneratorContext';
import Privy from '@/providers/PrivyProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <GeneratorProvider>
        <Privy>{children}</Privy>
      </GeneratorProvider>
    </ThemeProvider>
  );
}
