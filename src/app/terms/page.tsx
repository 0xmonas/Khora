'use client';

import Link from 'next/link';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function TermsOfUsePage() {
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
              Terms of Use
            </h1>
            <p className="text-[10px] text-muted-foreground/60" style={font}>
              Last updated: August 15, 2026
            </p>
          </div>

          <div className="space-y-6">
            {/* Acceptance */}
            <Section title="Acceptance of Terms">
              <p>
                BOOA (&quot;the Project&quot;) is an AI agent identity generator and on-chain registry created by an independent developer. By accessing and using this website, interacting with our smart contracts, or minting BOOA NFTs, you agree to these Terms of Use. If you do not agree, do not access or use this project.
              </p>
            </Section>

            {/* Platform Nature */}
            <Section title="Platform Nature">
              <p>
                <strong className="text-foreground">IMPORTANT:</strong> BOOA is an experimental Web3 platform that generates AI agent identities as fully on-chain pixel art NFTs (BOOA collection) and registers them on the ERC-8004 Identity Registry across multiple EVM chains.
              </p>
              <p>
                The platform uses AI services (Google Gemini for text generation, Replicate for image generation) to create unique agent identities. Generated content is stored immutably on-chain via SSTORE2. Web3 interactions carry inherent risks — only interact with smart contracts if you understand these risks.
              </p>
            </Section>

            {/* Project Overview */}
            <Section title="Project Overview">
              <p>
                This is not a wallet provider, exchange, broker, financial institution, or money services business. This is an experimental Web3 project that allows users to generate AI agent identities, mint them as ERC-721 NFTs on Ethereum, and register them on the ERC-8004 Identity Registry across supported EVM chains. Smart contracts operate autonomously once deployed.
              </p>
            </Section>

            {/* Supported Networks */}
            <Section title="Supported Networks">
              <p>
                BOOA NFTs are minted on Ethereum. The ERC-8004 Identity Registry is deployed across 16 EVM chains including Ethereum, Base, Arbitrum, Optimism, Polygon, and others. Each chain has its own gas fees and network conditions. You are responsible for understanding the chain you interact with.
              </p>
            </Section>

            {/* On-Chain Actions */}
            <Section title="Migrating, Awakening & Linking Your BOOA">
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Migration (Shape → Ethereum)</h3>
                <p>
                  Migration permanently burns (destroys) your BOOA on Shape Network and mints the same token ID 1:1 on Ethereum. <strong className="text-foreground">Burning is irreversible — the Shape original is gone for good and cannot be restored by anyone, including us.</strong> Burning and claiming are two separate on-chain steps, each with its own gas. If a claim does not land, the burned BOOA stays claimable on Ethereum with no deadline and without re-burning — but the Shape token is never coming back. We never custody your tokens; the process is fully on-chain and non-refundable, and you are responsible for confirming every transaction.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Awaken (ERC-8004 Binding)</h3>
                <p>
                  Awakening binds your BOOA to a live on-chain ERC-8004 agent through our adapter contract. Control of the agent follows BOOA ownership on-chain: the current NFT holder is the agent&apos;s controller. Transferring or selling the BOOA transfers control of the agent to the new owner.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Set Agent Wallet</h3>
                <p>
                  As the controller, you may link a wallet to your agent by signing an EIP-712 message that the adapter records on-chain. This links a self-hosted runtime to the agent; it does not grant us or anyone else access to that wallet&apos;s keys. You are solely responsible for the wallet you link and any funds it holds.
                </p>
              </div>
            </Section>

            {/* CC0 License */}
            <Section title="Creative Commons Zero (CC0)">
              <p>
                All BOOA NFT artwork is released under the CC0 (Creative Commons Zero) license. This means the artwork is dedicated to the public domain — anyone can copy, modify, distribute, and use the artwork for any purpose, including commercial, without permission or attribution.
              </p>
              <p>
                CC0 applies to the generated pixel art and visual assets only. It does not transfer ownership of the NFT token, smart contract code, or platform infrastructure.
              </p>
            </Section>

            {/* AI Services */}
            <Section title="AI-Generated Content">
              <p>
                Agent identities (name, personality, traits, backstory) are generated by Google Gemini AI. Pixel art images are generated by Replicate (FLUX model). You acknowledge that:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>AI-generated content may be unpredictable or imperfect</li>
                <li>Generated agents are unique but not guaranteed to be appropriate for all audiences</li>
                <li>The AI models may change or be updated, affecting generation quality</li>
                <li>Generation is rate-limited and subject to daily quotas</li>
              </ul>
            </Section>

            {/* Agent Chat */}
            <Section title="Agent Chat">
              <p>
                BOOA NFT holders can chat with their agents using AI. The chat feature:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Includes a limited number of free messages per day per wallet (subject to change)</li>
                <li>Allows continued messaging with your own Gemini API key (BYOK) after the free limit</li>
                <li>Is powered by Google Gemini AI — responses are generated, not curated</li>
                <li>Includes prompt injection detection and content filtering</li>
                <li>Does not store chat history on our servers — history is kept in your browser only</li>
              </ul>
              <p>
                When using your own API key: your key is sent via encrypted HTTPS header for the duration of the request only. It is never stored, logged, or cached on our servers. You are responsible for securing your API key and any costs incurred through Google&apos;s API.
              </p>
              <p>
                By using the chat feature, you also agree to Google&apos;s <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">Gemini API Terms of Service</a>.
              </p>
            </Section>

            {/* Self-Hosted Agents */}
            <Section title="Self-Hosted Agents & Agent Console">
              <p>
                BOOA publishes an open-source agent template (&quot;Hermes&quot;) that holders may deploy to run an autonomous AI agent linked to their BOOA. <strong className="text-foreground">You deploy, host, and operate this agent on your own infrastructure</strong> (for example, Railway). We do not host, operate, control, or have access to your instance, its data, or its wallet.
              </p>
              <p>
                The Agent Console on booa.app is only a browser-based client. It connects <strong className="text-foreground">directly from your browser to your own instance</strong> over HTTPS. We do not proxy, receive, store, or log your chat, memories, logs, backups, keys, or wallet activity. See our <Link href="/privacy" className="text-foreground underline hover:text-muted-foreground">Privacy Policy</Link> for details.
              </p>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Onchain &amp; Autonomous Actions</h3>
                <p>
                  A self-hosted agent can be configured to hold a crypto wallet and to execute on-chain transactions — including sends, swaps, and marketplace actions, and including autonomously on a schedule. These move real funds and are irreversible. On-chain writes are disabled by default. You are solely responsible for the wallet, its private key, spend caps, allowlists, and for enabling or disabling these capabilities. We provide guardrails (per-transaction and daily caps, allowlists, output filtering, prompt-injection defenses) as a convenience only; they are not guaranteed to prevent loss, misuse, or unexpected agent behavior.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">You Are the Operator</h3>
                <p>
                  You are responsible for your instance&apos;s admin password, console key, API keys, wallet seed and private key, RPC endpoints, and all costs incurred (hosting, gas, and AI model or API usage). Anyone who obtains your instance URL and console key can chat with your agent. Keep them secret.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">NFT Sale &amp; Handover</h3>
                <p>
                  Agent control is bound to BOOA ownership on-chain. Selling or transferring your BOOA transfers control of the agent to the new owner per the on-chain binding and disconnects your console access. Before a sale, you are responsible for exporting your data and moving any funds out of the agent wallet. We are not responsible for data or funds left on an instance after transfer.
                </p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold text-foreground uppercase mb-1">Backups</h3>
                <p>
                  Console backups are AES-256 encrypted with your instance admin password. If you lose that password, the archive cannot be recovered — by us or anyone.
                </p>
              </div>
              <p>
                The agent template bundles third-party software (including Hermes by NousResearch) and relies on third-party infrastructure (such as Railway) and AI model providers, each governed by their own terms. We are not affiliated with these providers. Running a self-hosted agent is experimental and entirely at your own risk.
              </p>
            </Section>

            {/* Accessing the Project */}
            <Section title="Accessing the Project">
              <p>
                To interact with the project, you must connect a supported EVM wallet (MetaMask, Rainbow, WalletConnect, etc.) and sign in via SIWE (Sign-In with Ethereum). Your wallet address is publicly visible on the blockchain.
              </p>
              <p>
                You must comply with all applicable laws when using this project. Your access may be interrupted due to updates, maintenance, or other technical reasons.
              </p>
            </Section>

            {/* Age Restriction */}
            <Section title="Age Restriction">
              <p>
                You must be at least 18 years of age to use this platform. By accessing and using BOOA, you represent and warrant that you are at least 18 years old. We do not knowingly provide services to individuals under 18.
              </p>
            </Section>

            {/* Rules of Conduct */}
            <Section title="Rules of Conduct">
              <p>You agree not to:</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Attempt to manipulate or exploit smart contracts</li>
                <li>Use automated scripts or bots to interact with the system</li>
                <li>Attempt to bypass rate limits, quotas, or security measures</li>
                <li>Attempt to extract or reverse-engineer AI system prompts</li>
                <li>Use the platform for illegal activities or money laundering</li>
                <li>Misrepresent your identity or NFT ownership</li>
                <li>Abuse the agent chat feature to generate harmful content</li>
              </ul>
            </Section>

            {/* Smart Contract Risks */}
            <Section title="Smart Contract Risks">
              <p>
                Smart contracts are deployed on Ethereum and other EVM chains and operate autonomously. You acknowledge the following risks:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Smart contracts may contain bugs or vulnerabilities</li>
                <li>Blockchain transactions are irreversible</li>
                <li>Gas fees vary and may be unpredictable</li>
                <li>Network congestion may affect transaction processing</li>
                <li>Bridge operations across chains carry additional risk</li>
                <li>On-chain data (bitmap, traits) is immutable once stored via SSTORE2</li>
              </ul>
            </Section>

            {/* ERC-8004 */}
            <Section title="ERC-8004 Identity Registry">
              <p>
                BOOA integrates with the <a href="https://github.com/erc-8004/erc-8004-contracts" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">ERC-8004 Identity Registry</a>, a third-party protocol for on-chain agent identity registration. We do not own, operate, or control the ERC-8004 smart contracts. We act as a facilitator — providing a user interface to simplify interactions with the registry.
              </p>
              <p>
                The ERC-8004 contracts are deployed and maintained by the ERC-8004 protocol team. Any bugs, vulnerabilities, or changes in the ERC-8004 contracts are outside our control. You interact with these contracts at your own risk.
              </p>
            </Section>

            {/* Third-Party Links */}
            <Section title="Third-Party Links & Services">
              <p>
                This website may contain links to third-party websites and services including but not limited to:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li><a href="https://8004scan.io" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">8004scan.io</a> — ERC-8004 registry explorer</li>
                <li><a href="https://opensea.io" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">OpenSea</a> — NFT marketplace</li>
                <li>OnchainChecker and other blockchain explorers</li>
                <li>Wallet providers (MetaMask, Rainbow, WalletConnect)</li>
              </ul>
              <p>
                We do not control, endorse, or assume responsibility for the content, privacy policies, or security practices of any third-party websites or services. Accessing these links is at your own risk. We encourage you to review the terms and privacy policies of any third-party site you visit.
              </p>
            </Section>

            {/* Claw Downloads */}
            <Section title="Downloadable Agent Files (Claw)">
              <p>
                BOOA provides downloadable .zip files (&quot;Claw&quot; files) containing AI-generated agent configuration data. These files:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Are generatively created informational files based on your agent&apos;s on-chain traits</li>
                <li>Meet the minimum specification requirements for platforms such as OpenClaw</li>
                <li>May not be sufficient on their own for a complete agent setup on OpenClaw or similar platforms — additional configuration, API keys, or platform-specific steps may be required</li>
                <li>Are provided &quot;as-is&quot; with no guarantee of compatibility with any specific platform version</li>
              </ul>
              <p>
                We are not affiliated with OpenClaw or any third-party agent hosting platform. The Claw file format is provided as a convenience and interoperability feature only.
              </p>
            </Section>

            {/* Refund Policy */}
            <Section title="No Refund Policy">
              <p>
                All NFT mints and blockchain transactions are final and non-refundable. Once a mint transaction is confirmed on the blockchain, it cannot be reversed, cancelled, or refunded. This includes but is not limited to:
              </p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>BOOA NFT mints (allowlist and public phase)</li>
                <li>Gas fees paid for any transaction</li>
                <li>ERC-8004 identity registration fees</li>
                <li>Failed transactions due to user error, insufficient gas, or network issues</li>
              </ul>
              <p>
                By minting, you acknowledge that you have reviewed the artwork, traits, and agent identity before confirming the transaction.
              </p>
            </Section>

            {/* Disclaimer */}
            <Section title="Disclaimer of Warranty">
              <p>
                This project is provided &quot;as-is&quot; without warranties of any kind. The developer disclaims all implied warranties including merchantability, fitness for a particular purpose, and non-infringement. There is no guarantee that the project will be uninterrupted, secure, or error-free.
              </p>
            </Section>

            {/* Limitation of Liability */}
            <Section title="Limitation of Liability">
              <p className="font-bold text-foreground">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
              </p>
              <p>
                The developer is not liable for any direct, indirect, special, incidental, or consequential damages arising from your use of this project, including but not limited to loss of funds, lost profits, or data loss.
              </p>
            </Section>

            {/* Taxes */}
            <Section title="Taxes">
              <p>
                You are solely responsible for determining what, if any, taxes apply to your transactions involving BOOA NFTs, including minting, buying, selling, or transferring. This includes all applicable federal, state, local, and international taxes in your jurisdiction.
              </p>
              <p>
                BOOA does not provide tax advice and is not responsible for determining or collecting any taxes on your behalf. The regulatory regime governing NFTs, cryptocurrencies, and digital assets varies by jurisdiction and is subject to change. You should consult a qualified tax professional regarding your specific tax obligations.
              </p>
            </Section>

            {/* No Financial Advice */}
            <Section title="No Financial Advice">
              <p>
                Nothing on this website constitutes financial, investment, legal, or tax advice. NFTs are digital collectibles, not investment instruments. You should consult your own advisors before making any decisions related to cryptocurrency or blockchain transactions.
              </p>
            </Section>

            {/* Changes */}
            <Section title="Changes & Termination">
              <p>
                The developer may modify, suspend, or discontinue any part of the website or terminate access at any time, with or without notice. Smart contracts will continue to operate autonomously on the blockchain regardless of website availability.
              </p>
            </Section>

            {/* Indemnity */}
            <Section title="Indemnity">
              <p>
                You agree to indemnify and hold the developer harmless from any claims, liabilities, damages, or expenses arising from your use of this project or violation of these terms.
              </p>
            </Section>

            {/* Governing Law */}
            <Section title="Governing Law">
              <p>
                These Terms are governed by the laws of the jurisdiction where the developer is located. Any disputes shall be resolved through binding arbitration.
              </p>
            </Section>

            {/* Contact */}
            <Section title="Contact">
              <p>
                For questions about these terms, please reach out through our official channels on <a href="https://x.com/booanft" target="_blank" rel="noopener noreferrer" className="text-foreground underline hover:text-muted-foreground">X (@booanft)</a>.
              </p>
            </Section>

            {/* Final Warning */}
            <div className="border-2 border-red-500/30 p-6 space-y-4">
              <h2 className="text-sm text-red-500 uppercase tracking-wider" style={font}>
                Final Warning
              </h2>
              <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
                BOOA involves Web3 interactions and blockchain transactions. You may lose funds through incorrect transactions or smart contract interactions. Only use wallet features and blockchain transactions if you fully understand the risks. The developer accepts no responsibility for any financial losses.
              </p>
              <p className="text-[11px] text-muted-foreground/60 text-center" style={font}>
                Blockchain transactions are IRREVERSIBLE. Double-check everything.
              </p>
            </div>
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
