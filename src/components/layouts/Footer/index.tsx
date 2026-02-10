'use client';

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="p-4 md:p-8 lg:p-12">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">
              <div className="flex flex-row items-center justify-between">
                <p 
                  className="text-sm text-neutral-500"
                  style={{ fontFamily: 'var(--font-departure-mono)' }}
                >
                  © 2025 KHORA.FUN
                </p>

                <div className="flex flex-row items-center gap-6">
                  <a 
                    href="https://x.com/khorafun" 
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-departure-mono)' }}
                  >
                    X
                  </a>
                  <a 
                    href="https://github.com/0xmonas/Khora" 
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-departure-mono)' }}
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </footer>
  );
}
