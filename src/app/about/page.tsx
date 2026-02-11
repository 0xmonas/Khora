// /src/app/about/page.tsx
'use client';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="max-w-2xl space-y-12">

                {/* Title */}
                <div className="space-y-4">
                  <h1
                    className="text-2xl sm:text-3xl text-foreground"
                    style={font}
                  >
                    About Khora
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Khora is an open-source platform for creating AI characters
                    that live entirely on-chain. Every character you generate is
                    minted as an NFT on Base — its pixel art, personality, skills,
                    and boundaries are all stored permanently in the smart contract.
                  </p>
                </div>

                {/* How it works */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    How it works
                  </h2>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>01</span>
                      <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                        Describe your character — name, creature type, vibe,
                        personality traits, skills, and boundaries. Or let AI
                        generate one from a simple prompt.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>02</span>
                      <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                        AI generates a unique pixel art portrait and a complete
                        character profile. The image is converted to a compact
                        on-chain SVG — no external hosting, no IPFS, no links
                        that can break.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>03</span>
                      <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                        Mint your character using a commit-reveal pattern.
                        First you commit (reserves your slot), then reveal
                        (writes the SVG and traits on-chain). This prevents
                        front-running.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>04</span>
                      <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                        Your character is now permanently on-chain. Anyone can
                        read its traits, render its art, and verify its
                        authenticity — directly from the contract, forever.
                      </p>
                    </div>
                  </div>
                </div>

                {/* On-chain */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Fully on-chain
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Most NFTs store a link to an image hosted somewhere else.
                    If that server goes down, your NFT is gone. Khora characters
                    are different — the SVG pixel art and the JSON traits are
                    written directly into the smart contract using SSTORE2.
                    No external dependencies. The contract validates every SVG
                    before storing it, blocking scripts, iframes, and other
                    unsafe elements.
                  </p>
                </div>

                {/* Stack */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Stack
                  </h2>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                    {[
                      ['Chain', 'Base (Ethereum L2)'],
                      ['Contract', 'ERC-721 + ERC-2981'],
                      ['Storage', 'SSTORE2 (on-chain)'],
                      ['Art', 'AI pixel art → SVG'],
                      ['Frontend', 'Next.js + wagmi'],
                      ['AI', 'Gemini + Replicate'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase" style={font}>
                          {label}
                        </span>
                        <span className="text-xs text-foreground" style={font}>
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Open source */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Open source
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Khora is fully open source. The smart contract, frontend,
                    and AI pipeline are all public. You can fork it, extend it,
                    or build on top of it.
                  </p>
                  <a
                    href="https://github.com/0xmonas/Khora"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
                    style={font}
                  >
                    github.com/0xmonas/Khora
                  </a>
                </div>

                {/* Token */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    $KHORA
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Community token on Solana.
                  </p>
                  <p
                    className="text-xs text-muted-foreground break-all"
                    style={font}
                  >
                    4hiBZfhcLPoLJXoptEoMZANaTdc6ygPqQMraFx6vmoon
                  </p>
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
