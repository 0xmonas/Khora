'use client';

import { useState, useEffect, useCallback } from 'react';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { useMintAgent } from '@/hooks/useMintAgent';
import { convertToSVG } from '@/utils/helpers/svgConverter';
import { minifySVG, svgToBytes, svgByteSize, SSTORE2_MAX_BYTES } from '@/utils/helpers/svgMinifier';
import { formatEther } from 'viem';
import { base } from 'wagmi/chains';

export function MintButton() {
  const { agent, pixelatedImage, generatedImage, setMintedTokenId, mode, selectedChain, agentId } = useGenerator();
  const {
    mint, status, txHash, tokenId, mintPrice,
    error, reset, isConnected, address, chainId,
  } = useMintAgent();
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);

  // Owner check for import mode
  const [ownerCheckPassed, setOwnerCheckPassed] = useState<boolean | null>(null);
  const [ownerCheckLoading, setOwnerCheckLoading] = useState(false);

  useEffect(() => {
    if (mode !== 'import' || !agentId || !isConnected || !address) {
      setOwnerCheckPassed(null);
      return;
    }

    setOwnerCheckLoading(true);
    fetch('/api/check-owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: selectedChain, agentId: parseInt(agentId) }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.owner && address) {
          setOwnerCheckPassed(data.owner.toLowerCase() === address.toLowerCase());
        } else {
          setOwnerCheckPassed(false);
        }
      })
      .catch(() => setOwnerCheckPassed(false))
      .finally(() => setOwnerCheckLoading(false));
  }, [mode, agentId, selectedChain, isConnected, address]);

  // After successful mint, store tokenId in context
  useEffect(() => {
    if (tokenId !== null && tokenId !== undefined) {
      setMintedTokenId(tokenId);
    }
  }, [tokenId, setMintedTokenId]);

  const imageToUse = pixelatedImage || generatedImage;
  const importBlocked = mode === 'import' && isConnected && ownerCheckPassed === false;

  const handleMint = useCallback(async () => {
    if (!isConnected) {
      // User needs to connect via the Header button first
      return;
    }

    if (!agent || !imageToUse) return;

    try {
      setPreparing(true);
      setPrepError(null);

      const svgString = await convertToSVG(imageToUse);
      const minified = minifySVG(svgString);
      const byteSize = svgByteSize(minified);

      if (byteSize > SSTORE2_MAX_BYTES) {
        setPrepError(`SVG too large: ${(byteSize / 1024).toFixed(1)}KB (max 24KB)`);
        return;
      }

      // Defense-in-depth: validate SVG before sending to contract
      const svgLower = minified.toLowerCase();
      const dangerousPatterns = ['<script', '<iframe', '<foreignobject', '<object', '<embed', 'javascript:', 'data:text/html'];
      for (const pattern of dangerousPatterns) {
        if (svgLower.includes(pattern)) {
          setPrepError(`SVG contains unsafe content: ${pattern}`);
          return;
        }
      }
      // Check for event handler attributes (onload=, onerror=, etc.)
      if (/\son[a-z]+=/.test(svgLower)) {
        setPrepError('SVG contains unsafe event handler attributes');
        return;
      }

      const svgBytes = svgToBytes(minified);

      // Build OpenSea-compatible attributes array
      const attributes: Array<{ trait_type: string; value: string }> = [];
      if (agent.creature) attributes.push({ trait_type: 'Creature', value: agent.creature });
      if (agent.vibe) attributes.push({ trait_type: 'Vibe', value: agent.vibe });
      if (agent.emoji) attributes.push({ trait_type: 'Emoji', value: agent.emoji });
      for (const s of agent.skills || []) attributes.push({ trait_type: 'Skill', value: s });
      for (const d of agent.domains || []) attributes.push({ trait_type: 'Domain', value: d });
      for (const p of agent.personality || []) attributes.push({ trait_type: 'Personality', value: p });
      for (const b of agent.boundaries || []) attributes.push({ trait_type: 'Boundary', value: b });

      const traitsBytes = new TextEncoder().encode(JSON.stringify(attributes));
      mint(svgBytes, traitsBytes, agent.name, agent.description);
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : 'Failed to prepare mint');
    } finally {
      setPreparing(false);
    }
  }, [isConnected, agent, imageToUse, mint]);

  const label = preparing
    ? 'Preparing...'
    : ownerCheckLoading
    ? 'Checking ownership...'
    : importBlocked
    ? 'Not owner'
    : status === 'confirming'
    ? 'Confirm in wallet...'
    : status === 'pending'
    ? 'Minting...'
    : status === 'success'
    ? `Minted #${tokenId?.toString()}`
    : status === 'error'
    ? 'Retry'
    : !isConnected
    ? 'Connect wallet to mint'
    : mintPrice
    ? `Mint (${formatEther(mintPrice)} ETH)`
    : 'Mint';

  const isDisabled =
    !isConnected ||
    preparing ||
    ownerCheckLoading ||
    importBlocked ||
    status === 'confirming' ||
    status === 'pending' ||
    status === 'success' ||
    !imageToUse;

  const baseScanBase = chainId === base.id
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org';

  return (
    <div className="space-y-2">
      <button
        onClick={status === 'error' ? () => { reset(); handleMint(); } : handleMint}
        disabled={isDisabled}
        className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {label}
      </button>

      {status === 'pending' && txHash && (
        <a
          href={`${baseScanBase}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs font-mono text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
        >
          View on BaseScan
        </a>
      )}

      {status === 'success' && tokenId !== null && (
        <p className="text-xs font-mono text-green-600 dark:text-green-400">
          Token #{tokenId.toString()} minted on-chain
        </p>
      )}

      {importBlocked && (
        <p className="text-xs font-mono text-red-500">
          Only the owner of ERC-8004 Agent #{agentId} can mint this NFT
        </p>
      )}

      {(error || prepError) && !importBlocked && (
        <p className="text-xs font-mono text-red-500">
          {prepError || (error as Error)?.message?.slice(0, 120) || 'Transaction failed'}
        </p>
      )}
    </div>
  );
}
