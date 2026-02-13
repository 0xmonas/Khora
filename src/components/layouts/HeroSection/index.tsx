import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/providers/theme-provider';
import { useGalleryTokens } from '@/hooks/useGalleryTokens';
import { useReadContract, useChainId } from 'wagmi';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';
import { ShaderLogo } from '@/components/ui/ShaderLogo';

const font = { fontFamily: 'var(--font-departure-mono)' };

const CREATE_STEPS = [
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

const IMPORT_STEPS = [
  {
    num: '01',
    title: 'Connect',
    desc: 'Connect your wallet. We scan 9 chains for your registered ERC-8004 agents — or enter a token ID manually.',
  },
  {
    num: '02',
    title: 'Fetch',
    desc: 'Your agent\'s identity is pulled from the on-chain registry: name, creature, vibe, skills, and boundaries.',
  },
  {
    num: '03',
    title: 'Reimagine',
    desc: 'AI generates a brand-new pixel art portrait for your imported agent, preserving its original identity and traits.',
  },
  {
    num: '04',
    title: 'Mint on Base',
    desc: 'Your reimagined agent is minted on Base with its new art and original traits — fully on-chain, cross-chain identity.',
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

function HowItWorks() {
  const [activeMode, setActiveMode] = useState<'create' | 'import'>('create');
  const steps = activeMode === 'create' ? CREATE_STEPS : IMPORT_STEPS;

  return (
    <div className="mt-20">
      <p className="text-[10px] text-muted-foreground uppercase text-center mb-4" style={font}>
        how it works
      </p>
      <div className="flex justify-center gap-2 mb-8">
        {(['create', 'import'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setActiveMode(m)}
            className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
              activeMode === m
                ? 'bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-800 dark:border-neutral-100'
                : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
            }`}
            style={font}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map((step) => (
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
  );
}

const FAQ_ITEMS = [
  {
    q: 'Can AI agents use BOOA NFTs as their profile picture?',
    a: `Yes — this is built into the architecture. When you register an agent on the ERC-8004 Identity Registry, the on-chain SVG from your BOOA NFT is embedded directly into the registration as a data URI. Any framework, protocol, or agent runtime can read this image directly from the contract — no API calls, no IPFS, no broken links.`,
    code: `// From registerAgent() in GeneratorContext.tsx
const svgString = await publicClient.readContract({
  address: booaContract,
  abi: BOOA_NFT_ABI,
  functionName: 'getSVG',
  args: [mintedTokenId],
});
// Embedded directly into ERC-8004 registration
registration.image = \`data:image/svg+xml;base64,\${btoa(svgString)}\`;`,
  },
  {
    q: 'Can an AI agent own a BOOA NFT?',
    a: `Yes. BOOA is a standard ERC-721 contract — any Ethereum address can own one, including smart contract wallets controlled by AI agents. There is no restriction that limits ownership to EOAs (externally owned accounts). An agent with a wallet can receive, hold, and transfer BOOA NFTs autonomously.`,
    code: `// From BOOA.sol — standard ERC-721 transfer
// Any address (EOA or contract) can receive
function safeTransferFrom(
    address from,
    address to,  // can be an agent's smart wallet
    uint256 tokenId
) public override { ... }`,
  },
  {
    q: 'Is the art really 100% on-chain? What happens if your servers go down?',
    a: `Nothing changes. The SVG pixel art and all character traits are stored directly in the smart contract via SSTORE2. The tokenURI function returns a base64-encoded JSON with the embedded SVG — entirely self-contained. No server, no IPFS gateway, no external dependency. Even if khora.fun disappears, your NFT renders from the contract alone.`,
    code: `// From BOOA.sol — fully on-chain tokenURI
function tokenURI(uint256 tokenId) public view returns (string memory) {
    string memory svg = getSVG(tokenId);       // SSTORE2 read
    string memory traits = getTraits(tokenId); // SSTORE2 read
    // Returns base64 JSON with embedded SVG — no external URLs
    return string(abi.encodePacked(
        "data:application/json;base64,",
        Base64.encode(json)
    ));
}`,
  },
  {
    q: 'What is ERC-8004 and why does it matter for AI agents?',
    a: `ERC-8004 is an on-chain identity standard for AI agents — like a passport for autonomous software. It stores an agent's name, description, services, skills, and domains in a registry contract. This makes agents discoverable and verifiable across any platform. Khôra is the first project to combine ERC-8004 registration with fully on-chain generative PFP art.`,
    code: `// ERC-8004 registration structure
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent Name",
  "description": "...",
  "image": "data:image/svg+xml;base64,...",  // on-chain SVG
  "services": [{ "name": "OASF", "endpoint": "..." }],
  "active": true,
  "x402Support": true
}`,
  },
  {
    q: 'How does commit-reveal minting prevent front-running?',
    a: `Minting happens in two steps. First, you commit — paying the mint price and locking a slot without revealing what you're minting. Then, after the commit is confirmed, you reveal your SVG and traits. This means no one can see your character and front-run you with a copy. If you don't reveal within 7 days, you can reclaim your ETH.`,
    code: `// From BOOA.sol — two-step mint
function commitMint() external payable {
    // Step 1: Pay and reserve a slot (no art revealed yet)
    require(msg.value >= mintPrice, "Insufficient payment");
    commitments[msg.sender][slotIndex] = Commitment(block.number, false);
}

function revealMint(uint256 slot, bytes calldata svg, bytes calldata traits) external {
    // Step 2: Reveal art after commit is confirmed on-chain
    require(!c.revealed, "Already revealed");
    _safeMint(msg.sender, tokenId);
    _storeSVG(tokenId, svg);     // SSTORE2
    _storeTraits(tokenId, traits); // SSTORE2
}`,
  },
  {
    q: 'What happens when billions of AI agents need identity? Can BOOA scale?',
    a: `BOOA's supply is configurable by the contract owner — it can be capped for scarcity or left open for scale. But the real scalability layer is ERC-8004: the Identity Registry is deployed on 10 chains via deterministic CREATE2 (same address everywhere). Agents can register on any chain, and Khôra discovers them all in parallel.`,
    code: `// 10 chains scanned in parallel for agent discovery
const CHAIN_CONFIG: Record<SupportedChain, ChainConfig> = {
  ethereum:      { chainId: 1,      rpcUrls: [...] },
  base:          { chainId: 8453,   rpcUrls: [...] },
  polygon:       { chainId: 137,    rpcUrls: [...] },
  arbitrum:      { chainId: 42161,  rpcUrls: [...] },
  celo:          { chainId: 42220,  rpcUrls: [...] },
  gnosis:        { chainId: 100,    rpcUrls: [...] },
  scroll:        { chainId: 534352, rpcUrls: [...] },
  taiko:         { chainId: 167000, rpcUrls: [...] },
  bsc:           { chainId: 56,     rpcUrls: [...] },
  'base-sepolia': { chainId: 84532, rpcUrls: [...] },
};
// Same registry address on ALL chains (CREATE2)
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';`,
  },
  {
    q: 'Why pixel art? Why not high-resolution AI portraits?',
    a: `On-chain storage is expensive. A high-res PNG would cost thousands of dollars in gas. Pixel art at 64x64 with a C64 16-color palette produces compact SVGs under 24KB — small enough to store entirely via SSTORE2 in a single transaction. The aesthetic isn't a limitation, it's the solution: every pixel is permanent, verifiable, and costs a fraction of a cent to store.`,
    code: `// From pixelator.ts — the full pixel art pipeline
const size = 64;   // 64x64 resolution
const scale = 16;  // 64 * 16 = 1024px output

// Pipeline: downscale → stretch → quantize → upscale
const stretched = applyPixelStretch(imageData);  // scan-line feel
const quantized = quantizeToPalette(stretched);  // C64 16-color

// From BOOA.sol — enforced size limit
uint256 constant SSTORE2_MAX_BYTES = 24_576;  // 24KB max per SVG`,
  },
  {
    q: 'Can I import an agent from another chain and give it a BOOA PFP?',
    a: `Yes — that's Import Mode. Connect your wallet and Khôra scans 10 chains for your ERC-8004 registered agents. Select one, and AI generates a new pixel art portrait while preserving the original identity (name, skills, domains, personality). The result is minted as a BOOA NFT on Base, and your existing registry entry is updated with the new art via setAgentURI.`,
    code: `// From discover-agents API — parallel 10-chain scan
const results = await Promise.all(
  chainNames.map(chain => scanChain(chain, address))
);

// After mint — update existing registry entry (no new token)
await writeRegister({
  address: registryAddress,
  abi: IDENTITY_REGISTRY_ABI,
  functionName: 'setAgentURI',   // update, not register
  args: [BigInt(existingAgentId), newAgentURI],
});`,
  },
  {
    q: 'Do you use ENS or other naming systems? How does identity work?',
    a: `Khôra uses ERC-8004 for identity, which is complementary to ENS — not a replacement. ENS resolves human-readable names to addresses. ERC-8004 stores structured agent metadata (personality, skills, services, boundaries) on-chain. An agent can have both an ENS name and an ERC-8004 registration. BOOA NFTs add a visual layer: the on-chain PFP that travels with the agent's identity.`,
    code: `// ERC-8004 stores structured identity, not just a name
const agentURI = \`data:application/json;base64,\${btoa(JSON.stringify({
  name: "Agent Name",
  description: "What it does",
  services: [{ name: "OASF", endpoint: "https://..." }],
  image: "data:image/svg+xml;base64,...",  // BOOA on-chain SVG
  active: true,
  supportedTrust: ["ethereum-attestation-service"]
}))}\`;
// Stored entirely on-chain — no external resolution needed`,
  },
  {
    q: 'What export formats are available? Can I use my agent in other frameworks?',
    a: `Khôra exports to 5 formats: PNG (pixel art with embedded JSON metadata), SVG (on-chain vector), ERC-8004 JSON (full registration spec), OpenClaw ZIP (IDENTITY.md + SOUL.md for agent frameworks), and raw JSON. The OpenClaw format is specifically designed for agent runtimes like Eliza and ZerePy — your character's personality, boundaries, and skills travel with it.`,
    code: `// 5 export formats from downloadAgent()
'png'      // Pixel art with embedded JSON (pngEncoder)
'svg'      // On-chain vector art (svgConverter)
'erc8004'  // Full ERC-8004 registration JSON
'openclaw' // ZIP: IDENTITY.md + SOUL.md (agent frameworks)
'json'     // Raw KhoraAgent object

// OpenClaw SOUL.md example output
// # Soul of {name}
// ## Personality: curious, direct, minimal...
// ## Boundaries: never lies about sources...`,
  },
  {
    q: 'Are BOOA NFTs and ERC-8004 agents rare? Can someone copy mine?',
    a: `Every BOOA NFT is uniquely generated by AI — the portrait is created once and never reproduced. Even with the same prompt, AI generates a different image every time. Once minted, the SVG is written immutably into the contract via SSTORE2 — it cannot be changed, deleted, or overwritten. Your ERC-8004 registration is equally permanent: only you (the owner) can call setAgentURI to update it. As long as you don't change it, your agent's identity and art are frozen on-chain forever. No one can mint the same art or claim the same agent ID.`,
    code: `// From BOOA.sol — SVG is immutable after mint
function revealMint(uint256 slot, bytes calldata svgData, ...) external {
    _storeSVG(tokenId, svgData);  // SSTORE2 write — permanent, no update function
}
// There is NO updateSVG or setSVG function — once stored, it's final.

// From ERC-8004 Identity Registry — only owner can update
function setAgentURI(uint256 agentId, string calldata newURI) external {
    require(ownerOf(agentId) == msg.sender, "Not owner");
    // Only the token owner can change the URI
    // If you never call this, your identity is frozen on-chain forever
}`,
  },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mt-20">
      <p className="text-[10px] text-muted-foreground uppercase text-center mb-8" style={font}>
        faq
      </p>
      <div className="max-w-3xl mx-auto space-y-2">
        {FAQ_ITEMS.map((item, i) => (
          <div
            key={i}
            className="border border-neutral-200 dark:border-neutral-700"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left p-4 flex justify-between items-start gap-4"
            >
              <span className="text-xs text-foreground leading-relaxed" style={font}>
                {item.q}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5" style={font}>
                {openIndex === i ? '\u2212' : '+'}
              </span>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
                  {item.a}
                </p>
                {item.code && (
                  <pre className="text-[10px] text-muted-foreground bg-neutral-100 dark:bg-neutral-800 p-3 overflow-x-auto leading-relaxed border border-neutral-200 dark:border-neutral-700">
                    <code>{item.code}</code>
                  </pre>
                )}
              </div>
            )}
          </div>
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
                  className="object-contain invisible"
                  priority
                />
                <ShaderLogo />
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
            <HowItWorks />

            {/* FAQ */}
            <FAQ />

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
