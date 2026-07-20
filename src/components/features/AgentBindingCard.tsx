'use client';

import { shape } from 'wagmi/chains';

interface AgentBindingCardProps {
  agentId: bigint | number;
  bindingContract: string;
  chainId: number;
  className?: string;
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function AgentBindingCard({ agentId, bindingContract, chainId, className }: AgentBindingCardProps) {
  const isMainnet = chainId === shape.id;
  const explorerBase = isMainnet ? 'https://shapescan.xyz' : 'https://sepolia.shapescan.xyz';
  const eightScan = isMainnet
    ? `https://www.8004scan.io/agents/shape/${agentId.toString()}`
    : `https://testnet.8004scan.io/agents/shape-sepolia/${agentId.toString()}`;
  const adapterScan = `${explorerBase}/address/${bindingContract}`;

  return (
    <div className={`border border-neutral-300 dark:border-neutral-700 p-3 space-y-2 ${className ?? ''}`}>
      <p className="font-mono text-[10px] text-neutral-500 uppercase tracking-wider">
        Onchain agent binding
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center font-mono text-[11px]">
          <span className="text-neutral-500">Agent ID</span>
          <a
            href={eightScan}
            target="_blank"
            rel="noopener noreferrer"
            className="dark:text-white hover:underline"
            title="View on 8004scan"
          >
            #{agentId.toString()}
          </a>
        </div>
        <div className="flex justify-between items-center font-mono text-[11px]">
          <span className="text-neutral-500">Binding Contract</span>
          <a
            href={adapterScan}
            target="_blank"
            rel="noopener noreferrer"
            className="dark:text-white hover:underline"
            title={bindingContract}
          >
            {shortAddress(bindingContract)}
          </a>
        </div>
      </div>
    </div>
  );
}
