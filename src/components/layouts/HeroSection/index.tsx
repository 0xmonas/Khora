import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/theme-provider';
import { useGalleryTokens } from '@/hooks/useGalleryTokens';
import { useReadContract, useChainId } from 'wagmi';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';

const font = { fontFamily: 'var(--font-departure-mono)' };

const STEPS = [
  {
    num: '01',
    title: 'Describe',
    desc: 'Name your character, pick a creature type, define its personality — or let AI generate everything from a short prompt.',
  },
  {
    num: '02',
    title: 'Generate',
    desc: 'AI creates a unique pixel art portrait and a complete character profile with skills, domains, and boundaries.',
  },
  {
    num: '03',
    title: 'Mint',
    desc: 'Commit-reveal minting writes your character\'s SVG and traits directly into the smart contract. No IPFS, no links that break.',
  },
  {
    num: '04',
    title: 'On-chain forever',
    desc: 'Your character lives entirely on Base. Anyone can read its traits and render its art — directly from the contract.',
  },
];

function LiveStats() {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  const { data: totalSupply } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'totalSupply',
    query: { enabled },
  });

  const { data: mintPrice } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'mintPrice',
    query: { enabled },
  });

  const count = totalSupply !== undefined ? Number(totalSupply) : null;
  const price = mintPrice !== undefined ? Number(mintPrice) / 1e18 : null;

  if (!enabled) return null;

  return (
    <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
      {count !== null && (
        <div className="text-center">
          <p className="text-2xl sm:text-3xl text-foreground" style={font}>{count}</p>
          <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>agents minted</p>
        </div>
      )}
      {price !== null && (
        <div className="text-center">
          <p className="text-2xl sm:text-3xl text-foreground" style={font}>
            {price === 0 ? 'FREE' : `${price} ETH`}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>mint price</p>
        </div>
      )}
      <div className="text-center">
        <p className="text-2xl sm:text-3xl text-foreground" style={font}>100%</p>
        <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>on-chain</p>
      </div>
    </div>
  );
}

function RecentMints() {
  const { tokens, isLoading } = useGalleryTokens();

  const recent = [...tokens]
    .sort((a, b) => Number(b.tokenId - a.tokenId))
    .slice(0, 8)
    .filter(t => t.svg);

  if (isLoading || recent.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground uppercase text-center" style={font}>
        recent mints
      </p>
      <div className="flex justify-center gap-3 flex-wrap">
        {recent.map((token) => (
          <Link
            key={token.tokenId.toString()}
            href="/mint"
            className="group"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 overflow-hidden transition-transform duration-200 group-hover:scale-110">
              <img
                src={`data:image/svg+xml,${encodeURIComponent(token.svg!)}`}
                alt={`Agent #${token.tokenId.toString()}`}
                className="w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground text-center mt-1" style={font}>
              #{token.tokenId.toString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function HeroSection() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 md:p-8 lg:p-12">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">
            {/* Hero Section */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[1200px] mx-auto aspect-[5/2] relative">
                <Image
                  src={theme === 'dark' ? '/khoradark.png' : '/khoralogo.png'}
                  alt="Khora Logo"
                  fill
                  loading="eager"
                  sizes="(max-width: 768px) 100vw, 1200px"
                  className="object-contain"
                  priority
                />
              </div>
              <p
                className="text-lg sm:text-xl text-muted-foreground max-w-2xl text-center mt-12"
                style={font}
              >
                We&apos;ve reimagined how AI characters come to life—so you can shape yours effortlessly.
              </p>
              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => router.replace('/mint')}
                  className="h-10 sm:h-12 px-6 border-2 border-primary bg-background text-foreground hover:bg-accent transition-colors w-fit"
                  style={font}
                >
                  Mint a BOOA
                </button>
                <Link
                  href="/about"
                  className="h-10 sm:h-12 px-6 border border-neutral-300 dark:border-neutral-600 bg-background text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center"
                  style={font}
                >
                  Learn more
                </Link>
              </div>
            </div>

            {/* Live Stats */}
            <div className="mt-20">
              <LiveStats />
            </div>

            {/* How it works */}
            <div className="mt-20">
              <p className="text-[10px] text-muted-foreground uppercase text-center mb-8" style={font}>
                how it works
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {STEPS.map((step) => (
                  <div
                    key={step.num}
                    className="border border-neutral-200 dark:border-neutral-700 p-4 space-y-2"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground" style={font}>{step.num}</span>
                      <span className="text-sm text-foreground" style={font}>{step.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
                      {step.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Mints */}
            <div className="mt-20">
              <RecentMints />
            </div>

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
