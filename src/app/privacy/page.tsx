'use client';

import Link from 'next/link';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-3xl mx-auto">
          {/* Title */}
          <div className="mb-12 text-center">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2" style={font}>
              legal
            </p>
            <h1 className="text-2xl sm:text-3xl text-foreground mb-2" style={font}>
              Privacy Policy
            </h1>
            <p className="text-[10px] text-muted-foreground/60" style={font}>
              Last updated: March 21, 2026
            </p>
          </div>

          <div className="space-y-6">
            {/* Introduction */}
            <Section title="Introduction">
              <p>
                Kh&ocirc;ra (&quot;we,&quot; &quot;our,&quot; or &quot;the Project&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our AI agent identity platform and Web3 services.
              </p>
            </Section>

            {/* Information We Collect */}
            <Section title="Information We Collect">
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Blockchain Data</h3>
                <p>
                  When you connect your wallet, we access your public wallet address. This information is publicly available on the blockchain and is necessary to provide our services (minting, ownership verification, agent chat).
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">SIWE Authentication</h3>
                <p>
                  We use Sign-In with Ethereum (SIWE) for authentication. Your session is stored in an encrypted iron-session cookie. No passwords or private keys are ever collected.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Rate Limiting Data</h3>
                <p>
                  We store per-wallet usage counters (daily generation quota, chat quota, injection attempt counts) in Upstash Redis with automatic TTL expiration (24 hours for quotas, 1 hour for security locks). IP addresses are used for rate limiting only and are not permanently stored.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Agent Metadata</h3>
                <p>
                  Generated agent data (name, traits, personality) is cached in Redis for performance. This data is also stored immutably on-chain — the Redis cache is a performance optimization only.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Analytics</h3>
                <p>
                  We use Vercel Analytics for anonymized usage data including page views and general navigation patterns. No personally identifiable information is collected through analytics.
                </p>
              </div>
            </Section>

            {/* What We Do NOT Collect */}
            <Section title="What We Do NOT Collect">
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Private keys or seed phrases — never, under any circumstance</li>
                <li>Chat history — stored only in your browser (localStorage), never on our servers</li>
                <li>User-provided Gemini API keys — sent via HTTPS header per-request only, never stored, logged, or cached</li>
                <li>Email addresses, phone numbers, or real names</li>
                <li>Location data beyond what IP-based rate limiting infers</li>
              </ul>
            </Section>

            {/* How We Use Information */}
            <Section title="How We Use Your Information">
              <ul className="space-y-1.5 list-disc list-inside">
                <li>To verify NFT ownership for agent chat and holder features</li>
                <li>To enforce rate limits and prevent abuse (generation quotas, chat quotas)</li>
                <li>To detect and block prompt injection attacks</li>
                <li>To cache agent metadata for faster page loads</li>
                <li>To process waitlist registrations (wallet address + Twitter handle)</li>
                <li>To verify Merkle proofs for allowlist minting</li>
              </ul>
            </Section>

            {/* Third-Party Services */}
            <Section title="Third-Party Services">
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Google Gemini AI</h3>
                <p>
                  Used for agent text generation and chat. Your chat messages are sent to Google&apos;s API for processing. See <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Google&apos;s Gemini API Terms</a>.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Replicate</h3>
                <p>
                  Used for AI pixel art generation (FLUX model). Agent trait data is sent to Replicate for image generation. See <a href="https://replicate.com/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Replicate&apos;s Privacy Policy</a>.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Upstash Redis</h3>
                <p>
                  Used for rate limiting, quota tracking, and metadata caching. Data is stored with automatic TTL expiration. See <a href="https://upstash.com/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Upstash Privacy Policy</a>.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Cloudflare Turnstile</h3>
                <p>
                  Used for bot protection on waitlist registration. See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Cloudflare&apos;s Privacy Policy</a>.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Alchemy</h3>
                <p>
                  Used for blockchain RPC calls and NFT data fetching. See <a href="https://www.alchemy.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Alchemy&apos;s Privacy Policy</a>.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Wallet Providers</h3>
                <p>
                  MetaMask, Rainbow, WalletConnect, and other wallet providers have their own privacy policies. We do not control or have access to your private keys.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Blockchain Networks</h3>
                <p>
                  Transactions on Shape Network, Ethereum, Base, and other supported EVM chains are permanent and publicly visible. We do not control blockchain data.
                </p>
              </div>
            </Section>

            {/* Cookies */}
            <Section title="Cookies & Storage">
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Essential Cookies</h3>
                <p>
                  iron-session cookie for SIWE authentication. Required for wallet sign-in. Cannot be disabled.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Local Storage</h3>
                <p>
                  Chat history, wallet connection state, and user preferences are stored locally in your browser. We do not have access to this data. You can clear it at any time.
                </p>
              </div>
            </Section>

            {/* Third-Party Links */}
            <Section title="Third-Party Links">
              <p>
                This website contains links to third-party services (8004scan.io, OpenSea, OnchainChecker, wallet providers, etc.). These services have their own privacy policies. We do not control how they collect or use your data. Clicking external links is at your own risk.
              </p>
            </Section>

            {/* ERC-8004 */}
            <Section title="ERC-8004 Registry Data">
              <p>
                Agent registrations on the ERC-8004 Identity Registry are processed through third-party smart contracts we do not own or control. Data written to the registry (agent metadata, identity records) is permanent and publicly visible on the blockchain. We facilitate the registration process but are not responsible for the registry&apos;s data handling.
              </p>
            </Section>

            {/* Data Retention */}
            <Section title="Data Retention">
              <ul className="space-y-1.5">
                <li><strong className="text-foreground">Rate limit counters:</strong> 24 hours (auto-expire)</li>
                <li><strong className="text-foreground">Security locks:</strong> 1 hour (auto-expire)</li>
                <li><strong className="text-foreground">Metadata cache:</strong> Variable TTL, refreshed from on-chain data</li>
                <li><strong className="text-foreground">Local storage:</strong> Until you clear it manually</li>
                <li><strong className="text-foreground">Blockchain data:</strong> Permanent and immutable</li>
              </ul>
            </Section>

            {/* Your Rights */}
            <Section title="Your Privacy Rights">
              <p>Depending on your location, you may have the right to:</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Access your personal data</li>
                <li>Request data deletion (where technically feasible)</li>
                <li>Opt-out of analytics</li>
                <li>Data portability</li>
              </ul>
              <p>
                Note: Blockchain data cannot be deleted or modified once recorded, as it is a permanent, decentralized public ledger.
              </p>
            </Section>

            {/* Children */}
            <Section title="Children&apos;s Privacy">
              <p>
                Our platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children.
              </p>
            </Section>

            {/* Changes */}
            <Section title="Changes to Privacy Policy">
              <p>
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date. Continued use of the platform constitutes acceptance of the updated policy.
              </p>
            </Section>

            {/* Contact */}
            <Section title="Contact">
              <p>
                For privacy questions, reach out through <a href="https://x.com/booanft" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">X (@booanft)</a>.
              </p>
            </Section>
          </div>

          <div className="mt-12 text-center">
            <Link href="/" className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors" style={font}>
              &larr; back to home
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-neutral-700 dark:border-neutral-200 p-5 space-y-3">
      <h2 className="text-xs text-foreground uppercase tracking-wider" style={{ fontFamily: 'var(--font-departure-mono)' }}>
        {title}
      </h2>
      <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2" style={{ fontFamily: 'var(--font-departure-mono)' }}>
        {children}
      </div>
    </div>
  );
}
