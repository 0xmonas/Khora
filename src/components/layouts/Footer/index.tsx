'use client';

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="flex-1 flex flex-col">
        <div className="p-4 sm:p-8 lg:p-8">
          <div className="grid grid-cols-12">
            <div className="col-span-0 sm:col-span-1" />
            <div className="col-span-12 sm:col-span-10">
              <div className="flex flex-row items-center justify-between">
                <p 
                  className="text-sm text-neutral-500"
                  style={{ fontFamily: 'var(--font-departure-mono)' }}
                >
                  © 2025 KHORA.FUN
                </p>

                <div className="flex flex-row items-center gap-6">
                  <a 
                    href="https://twitter.com" 
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                    style={{ fontFamily: 'var(--font-departure-mono)' }}
                  >
                    X
                  </a>
                  <a 
                    href="https://github.com" 
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
            <div className="col-span-0 sm:col-span-1" />
          </div>
        </div>
      </div>
    </footer>
  );
}