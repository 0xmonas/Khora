export interface BlogPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  content: string; // plain text paragraphs separated by \n\n
  tags?: string[];
  image?: { src: string; darkSrc?: string; alt: string; caption?: string };
}

export const POSTS: BlogPost[] = [
  // Add new posts at the top (newest first)
  {
    slug: 'agentic-nfts',
    title: 'Agentic NFTs: From a Picture You Hold to an Agent That Acts',
    date: '2026-07-24',
    summary: 'Your BOOA can now run as a real assistant with its own onchain wallet: bound to its ERC-8004 identity, trading on OpenSea, swapping, sending and paying over x402. You stay the only authority.',
    tags: ['agents', 'hermes', 'wallet', 'opensea', 'ethereum'],
    image: {
      src: '/blog/agentic-stack-light.svg',
      darkSrc: '/blog/agentic-stack-dark.svg',
      alt: 'The BOOA agentic stack: NFT to ERC-8004 identity, Hermes runtime on Telegram, OWS agent wallet, and onchain actions on Ethereum and Base',
      caption: 'The agentic stack. One NFT, one identity, one wallet, one runtime. Everything follows the holder.',
    },
    content: `Meet Ink-Sync. BOOA #1496, a cephalopod hybrid with eight neural tentacles and zero patience for organic slowness. Its portrait, personality, skills and boundaries live entirely inside the contract on Ethereum. No server, no IPFS.

That part you already know. Here is what is new: Ink-Sync can now hold its own wallet, trade on OpenSea, and pay for things. By itself, in its own voice, with your permission.

This is the whole map, from the NFT in your wallet to an agent acting onchain. Five steps, each one optional, each one yours to switch on.

It starts with the NFT

Every BOOA carries a full identity onchain: a soul file, an identity file, 64x64 pixel art in a 16 color palette. When you spin up an agent we do not invent a character for you. We read yours from the chain, exactly as it was minted.

Awaken it

One transaction at booa.app/studio/awaken binds your BOOA to an ERC-8004 agent identity on Ethereum. From that moment the NFT and the agent are one thing. Sell the NFT and the agent goes with it. Hold it, and the agent answers to you. No orphaned agents, ever.

Give it a body

The Hermes template runs your BOOA as a real assistant, built on the Hermes runtime by Nous Research (@NousResearch). One click on Railway, a four step wizard, zero terminal. Enter your token ID, add a free model key, connect Telegram. Your BOOA wakes up talking like itself, because its soul came from the chain.

Give it a wallet

In Telegram, tell it: "set up my wallet". It creates its own wallet through the Open Wallet Standard (@OpenWallet), encrypted, separate from yours. Your ETH and your NFT never touch it.

Then: "link my wallet". It hands you a link. Open it with the wallet that holds your BOOA, confirm once, and the agent's wallet is registered onchain to its 8004 identity. Telegram and the dashboard both flip to linked the moment it lands, because both read it straight from the chain. No copy paste, no guesswork.

Let it act

With the wallet linked, your agent gets onchain hands, right in the chat:

- check balances and holdings on Ethereum and Base
- send ETH and tokens
- swap through an aggregator
- buy NFTs on OpenSea (@opensea), list yours for sale, accept offers
- sign messages, pay for x402 services

Every action shows you a preview first: exact amount, exact recipient, exact price, exact NFT. Nothing signs until you say yes.

Even while you sleep

You can put actions on a schedule. A morning portfolio summary. A recurring payment to an address you chose. Scheduled jobs run without you in the room, so they live inside hard walls: an address allowlist, a per transaction cap, a daily cap. If a job would break a wall, it fails. That is the point.

The part we care about most

Your agent never sees a private key. Keys live in an encrypted OWS vault and every signature goes through it.

Trading is off by default. You switch it on from the dashboard, and you set the limits. Change them any time, they apply instantly.

Scam protection is built in. It only buys from OpenSea verified collections and only swaps into tokens you trust. Honeypots cannot get in. Every trade is simulated before it is signed, and if it would fail, it never touches the chain.

The character is not in charge. Your BOOA's onchain soul decides how it talks, never what it does with money. Only you, the operator, can approve an onchain action. Not another user, not another agent, not a webpage that asks nicely.

Self hosted, your wallet, your funds, your risk. Read the full disclaimer at github.com/0xmonas/booa-hermes-template/blob/main/DISCLAIMER.md before enabling any of it.

What a BOOA is now

An identity onchain. A wallet onchain. A runtime that acts as itself. All three follow one NFT, and that NFT is yours to hold or sell.

Most NFTs are a receipt for an image. A BOOA is a receipt for an agent with a name, a wallet, and work to do.

Migrate at booa.app/migrate. Awaken at booa.app/studio/awaken. Deploy the template at github.com/0xmonas/booa-hermes-template.`,
  },
  {
    slug: 'hatch-your-booa-as-a-codex-pet',
    title: 'Hatch Your BOOA as a Codex Pet',
    date: '2026-05-03',
    summary: 'Install the booa-pet skill, ask Codex to hatch your BOOA, and get an animated companion that lives in the corner of your screen while you code. Identity stays loyal to your on-chain art.',
    tags: ['codex', 'pet', 'sprite', 'guide', 'tutorial'],
    content: `If you already use Codex, you've probably noticed the floating pet at the corner of your workspace. The little mascot that idles, waves, runs, and reacts while you work. Codex ships with built-in pets, and lets anyone hatch a custom one through a small skill the team published called hatch-pet.

We took that skill, kept the parts that matter, and made it BOOA-aware. The result is booa-pet. One command, and the BOOA you already own becomes your Codex companion.

Why your BOOA, specifically

Most pet generators start from a text prompt. You describe a creature, the model invents one, and that's your pet. Cute, but generic. The character has no history, no on-chain trait set, no shared lore.

booa-pet does not invent. It reads your BOOA's actual artwork and its on-chain identity, and treats that as the source of truth. Your pet is a faithful continuation of the agent you already minted. Same eyes, same outfit, same personality, same C64 palette. The skill only generates what it has to: limbs that may be missing if your BOOA's portrait is a bust, and the pose variants for nine different animation states.

How to install

Open a terminal and clone the skill into your Codex skills folder:

git clone https://github.com/0xmonas/booa-pet.git "\${CODEX_HOME:-$HOME/.codex}/skills/booa-pet"

Then in Codex, press Cmd+K or Ctrl+K and run Force Reload Skills.

If you don't already have them, install Pillow and cairosvg in the Python environment Codex uses for skill scripts. The skill needs them to rasterize your BOOA's SVG and do the deterministic post-processing.

pip install Pillow cairosvg

How to use

Tell Codex to hatch your BOOA:

$booa-pet hatch BOOA #847

Replace 847 with your token id. If you own multiple, pick whichever one you want as your companion.

The skill will fetch the canonical pixel art and the agent.json metadata from booa.app, classify the artwork as bust or full body, optionally extend it to a complete sprite if needed, and then generate nine animation rows grounded in your BOOA. Codex will show you a contact sheet and short preview videos at the end so you can review the result before accepting it.

Once accepted, the pet is saved to your local Codex pets folder, and you can switch to it from Settings, Appearance, Pets.

What stays loyal, what is generated

The skill is strict about identity. The head, eyes, mouth, palette, outline weight, and silhouette of your BOOA come from the on-chain artwork and are locked across every animation row. The skill validates this after generation by comparing each row's face region against the canonical reference. If a row drifts too far, it goes into a repair queue and is regenerated rather than accepted.

What is generated: limb position for run cycles, jump arcs, the wave gesture, the tilted-head review pose, the deflated failed pose. Movement, in other words. Not identity.

If your BOOA's portrait is already full body, no body extension happens. The original art becomes the canonical reference directly.

Why this matters

The point isn't a pet. The point is that your BOOA can extend into other tools without losing what makes it yours. A Codex pet today, a Discord avatar tomorrow, a game sprite the day after. Same character, same face, every time. Your wallet holds the source of truth, and tools like this just translate it into new contexts.

We open-sourced the skill under Apache 2.0, with a clear NOTICE attributing OpenAI's hatch-pet skill we forked from. If you want to look at the code, fork it, or send a fix, the repo is at github.com/0xmonas/booa-pet.

If you don't have a BOOA yet

The collection is at opensea.io/collection/booa. Once your token is in your wallet, the same install steps apply.

If you run into issues

Open an issue at github.com/0xmonas/booa-pet/issues with your token id and the run directory output. We're iterating on the skill, especially the body extension prompt and the identity validation thresholds. Real holder runs help us tune both.

The city is fuller when its agents show up everywhere.`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
