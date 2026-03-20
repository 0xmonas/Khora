'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Script from 'next/script';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };
const SHAPE_CHAIN_ID = 360;

const TWEET_TEXT = `I just joined the BOOA NFTs by @khorafun waitlist 👨‍🎤

https://www.khora.fun/waitlist`;
const TWEET_INTENT_URL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(TWEET_TEXT)}`;
const TWEET_URL_REGEX = /^https?:\/\/(x\.com|twitter\.com)\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)\/?(\?.*)?$/;
const RESERVED_HANDLES = new Set(['i', 'intent', 'search', 'explore', 'home', 'notifications', 'messages', 'settings', 'compose']);

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface WaitlistStatus {
  isOpen: boolean;
  isPaused: boolean;
  isFull: boolean;
  count: number;
  maxCapacity: number;
  registered: boolean;
  closesAt: number | null;
  remainingMs: number | null;
  balanceOk: boolean;
  balances: Record<string, string>;
}

export default function WaitlistPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const siweStatus = useSiweStatus();
  const isAuthenticated = siweStatus === 'authenticated';

  const [status, setStatus] = useState<WaitlistStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tweetUrl, setTweetUrl] = useState('');
  const [urlError, setUrlError] = useState<'mobile' | 'invalid' | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [parsedHandle, setParsedHandle] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const [addingChain, setAddingChain] = useState(false);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  const hasShape = chainId === SHAPE_CHAIN_ID;

  // Fetch waitlist status
  const fetchStatus = useCallback(async () => {
    const params = address ? `?address=${address}` : '';
    const res = await fetch(`/api/waitlist${params}`);
    const data: WaitlistStatus = await res.json();
    setStatus(data);
    if (data.registered) setSuccess(true);
  }, [address]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Render Turnstile widget
  useEffect(() => {
    if (!turnstileReady || !turnstileContainerRef.current || !window.turnstile) return;
    if (turnstileWidgetId.current) return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey) return;

    turnstileWidgetId.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      theme: 'dark',
    });
  }, [turnstileReady, isAuthenticated, status?.balanceOk]);

  useEffect(() => {
    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, []);

  const handleAddShape = async () => {
    setAddingChain(true);
    try {
      switchChain({ chainId: SHAPE_CHAIN_ID });
    } catch {
      // User rejected or chain not configured
    } finally {
      setAddingChain(false);
    }
  };

  const handleRegister = async () => {
    if (!turnstileToken || !parsedHandle) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnstileToken, tweetUrl: tweetUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        if (turnstileWidgetId.current && window.turnstile) {
          window.turnstile.reset(turnstileWidgetId.current);
          setTurnstileToken(null);
        }
        return;
      }

      setSuccess(true);
      setStatus((prev) =>
        prev ? { ...prev, registered: true, count: data.count } : prev
      );
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  };

  // Live countdown — updates every second (stops when paused)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!status?.closesAt || status?.isPaused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.closesAt, status?.isPaused]);

  // When paused, show frozen remaining time; when active, live countdown
  const timeLeft = status?.isPaused
    ? (status.remainingMs ?? 0)
    : (status?.closesAt ? Math.max(0, status.closesAt - now) : 0);
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const secondsLeft = Math.floor((timeLeft % (1000 * 60)) / 1000);

  const canSubmit = turnstileToken && parsedHandle && hasShared && status?.balanceOk && !loading && !status?.isPaused;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad"
        strategy="afterInteractive"
        onReady={() => {
          window.onTurnstileLoad = () => setTurnstileReady(true);
          if (window.turnstile) setTurnstileReady(true);
        }}
      />

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Title */}
          <div className="space-y-2 text-center">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
              BOOA
            </p>
            <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
              Waitlist
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
              {status?.isFull
                ? 'Waitlist is full'
                : status?.isPaused
                ? `Paused — ${hoursLeft}h ${minutesLeft}m remaining`
                : status?.isOpen
                ? `${hoursLeft}h ${minutesLeft}m ${secondsLeft}s remaining`
                : 'Waitlist is currently closed'}
            </p>
          </div>


          {/* Main Card */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-6 space-y-4">

            {/* Step 1: Connect wallet */}
            {!isConnected ? (
              <div className="space-y-3 text-center">
                <StepLabel n={1} text="Connect your wallet" />
                <div className="flex justify-center">
                  <ConnectButton />
                </div>
              </div>

            /* Step 2: Add Shape Network */
            ) : !hasShape ? (
              <div className="space-y-3 text-center">
                <StepLabel n={1} text="Add Shape Network" />
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  Shape Network (Chain ID: 360) is required to participate.
                </p>
                <button
                  onClick={handleAddShape}
                  disabled={addingChain}
                  className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 text-sm text-foreground hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors disabled:opacity-40"
                  style={font}
                >
                  {addingChain ? 'Confirm in wallet...' : 'Add Shape to Wallet'}
                </button>
              </div>

            /* Step 3: Sign in (SIWE) */
            ) : !isAuthenticated ? (
              <div className="space-y-3 text-center">
                <StepLabel n={2} text="Sign in with your wallet" />
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="text-[10px] text-muted-foreground/40" style={font}>
                  A signature request will appear — no gas required.
                </p>
              </div>

            /* Already registered */
            ) : success ? (
              <div className="space-y-3 text-center">
                <div className="text-3xl">&#10003;</div>
                <p className="text-sm text-green-600 dark:text-green-500" style={font}>
                  You&apos;re on the waitlist!
                </p>
                <p className="text-[10px] text-muted-foreground" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>

            /* Waitlist full */
            ) : status?.isFull ? (
              <div className="space-y-3 text-center">
                <div className="text-3xl">&#9632;</div>
                <p className="text-sm text-muted-foreground" style={font}>
                  Waitlist is now full
                </p>
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  Follow us on X for future announcements.
                </p>
              </div>

            /* Waitlist closed */
            ) : !status?.isOpen ? (
              <div className="text-center">
                <p className="text-xs text-muted-foreground" style={font}>
                  Registration is currently closed. Follow us for announcements.
                </p>
              </div>

            /* Step 4: Registration form */
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground text-center" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>

                {/* Balance check */}
                <div className={`border px-3 py-2 text-[10px] ${
                  status?.balanceOk
                    ? 'border-green-600/30 text-green-600 dark:text-green-500'
                    : 'border-red-500/30 text-red-500'
                }`} style={font}>
                  {status?.balanceOk ? (
                    <span>&#10003; Balance verified (min 0.005 ETH)</span>
                  ) : (
                    <span>&#10007; Minimum 0.005 ETH required on Ethereum, Base, or Shape</span>
                  )}
                  {status?.balances && (
                    <div className="mt-1.5 space-y-0.5 text-muted-foreground/60">
                      {Object.entries(status.balances).map(([chain, bal]) => (
                        <div key={chain}>{chain}: {Number(bal).toFixed(4)} ETH</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Share on X */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider" style={font}>
                    Share on X *
                  </label>
                  <button
                    onClick={() => {
                      window.open(TWEET_INTENT_URL, '_blank', 'noopener,noreferrer');
                      setHasShared(true);
                    }}
                    disabled={!status?.balanceOk}
                    className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 text-sm text-foreground hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={font}
                  >
                    {hasShared ? '\u2713 Shared \u2014 open again?' : 'Share on X'}
                  </button>
                </div>

                {/* Paste tweet URL */}
                {hasShared && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wider" style={font}>
                      Paste your tweet URL *
                    </label>
                    <input
                      type="url"
                      value={tweetUrl}
                      onChange={(e) => {
                        const url = e.target.value.trim();
                        setTweetUrl(url);
                        const match = url.match(TWEET_URL_REGEX);
                        const h = match ? match[2] : null;
                        if (h && RESERVED_HANDLES.has(h.toLowerCase())) {
                          setParsedHandle(null);
                          setUrlError('mobile');
                        } else if (h) {
                          setParsedHandle(h);
                          setUrlError(null);
                        } else {
                          setParsedHandle(null);
                          setUrlError(url ? 'invalid' : null);
                        }
                      }}
                      placeholder="https://x.com/yourhandle/status/..."
                      className="w-full h-10 px-3 border-2 border-neutral-700 dark:border-neutral-200 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/30"
                      style={font}
                    />
                    {parsedHandle && (
                      <p className="text-[10px] text-green-600 dark:text-green-500" style={font}>
                        &#10003; Detected: @{parsedHandle}
                      </p>
                    )}
                    {tweetUrl && !parsedHandle && urlError && (
                      <p className="text-[10px] text-red-500" style={font}>
                        {urlError === 'mobile' ? 'Mobile tweet links are not supported. Please try from desktop.' : 'Invalid URL. Expected: https://x.com/handle/status/...'}
                      </p>
                    )}
                  </div>
                )}

                {/* Turnstile */}
                {status?.balanceOk && (
                  <div className="flex justify-center">
                    <div ref={turnstileContainerRef} />
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleRegister}
                  disabled={!canSubmit}
                  className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 text-sm text-foreground hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={font}
                >
                  {loading ? 'Registering...' : 'Join Waitlist'}
                </button>

                {error && (
                  <p className="text-xs text-red-500 text-center" style={font}>
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="space-y-1 text-center">
            <p className="text-[10px] text-muted-foreground/40" style={font}>
              One wallet per registration. No gas required. Min 0.005 ETH balance.
              <br />
              Tweets will be reviewed within 48 hours. Do not delete your tweet.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span
        className="w-5 h-5 flex items-center justify-center border border-muted-foreground/30 text-[9px] text-muted-foreground"
        style={font}
      >
        {n}
      </span>
      <p className="text-xs text-muted-foreground" style={font}>
        {text}
      </p>
    </div>
  );
}
