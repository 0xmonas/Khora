'use client';

import { useBridge } from '../BridgeContext';

export function SelectedNFTPreview() {
  const {
    selectedNFT, agentImage, agentName, agentDescription,
    isExistingAgent, configLoading,
    erc8004Services, selectedSkills, selectedDomains, x402Support,
  } = useBridge();

  if (!selectedNFT) return null;

  const attributes = selectedNFT.raw.attributes || [];

  return (
    <div className="space-y-6">
      {/* Large Image */}
      <div className="border-2 border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 aspect-square max-w-md overflow-hidden">
        {agentImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agentImage}
            alt={agentName}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 font-mono text-sm">
            No Image
          </div>
        )}
      </div>

      {/* Info */}
      <div className="space-y-2">
        <p className="font-mono text-xs text-neutral-500">{selectedNFT.collection}</p>
        <h3 className="font-mono text-lg dark:text-white">{agentName}</h3>
        {agentDescription && (
          <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {agentDescription}
          </p>
        )}
      </div>

      {/* Token Info */}
      <div className="space-y-1">
        {isExistingAgent ? (
          <p className="font-mono text-[10px] text-neutral-400">
            Agent ID: {selectedNFT.tokenId} &middot; {selectedNFT.chain}
          </p>
        ) : (
          <>
            <p className="font-mono text-[10px] text-neutral-400">
              Contract: {selectedNFT.contractAddress.slice(0, 6)}...{selectedNFT.contractAddress.slice(-4)}
            </p>
            <p className="font-mono text-[10px] text-neutral-400">
              Token ID: {selectedNFT.tokenId}
            </p>
            <p className="font-mono text-[10px] text-neutral-400">
              Chain: {selectedNFT.chain} &middot; {selectedNFT.tokenType}
            </p>
          </>
        )}
      </div>

      {/* Loading state for agent metadata */}
      {configLoading && (
        <p className="font-mono text-xs text-neutral-500 animate-pulse">Loading metadata...</p>
      )}

      {/* Agent / NFT Attributes — same grid card style for both */}
      {isExistingAgent && !configLoading ? (
        (() => {
          // Build unified attributes array from agent data
          const agentAttrs: { trait_type: string; value: string }[] = [];
          for (const svc of erc8004Services) {
            agentAttrs.push({ trait_type: `Service (${svc.name})`, value: svc.endpoint || 'N/A' });
            if (svc.version) agentAttrs.push({ trait_type: `${svc.name} Version`, value: `v${svc.version}` });
          }
          for (const skill of selectedSkills) {
            agentAttrs.push({ trait_type: 'Skill', value: skill });
          }
          for (const domain of selectedDomains) {
            agentAttrs.push({ trait_type: 'Domain', value: domain });
          }
          agentAttrs.push({ trait_type: 'x402 Payment', value: x402Support ? 'enabled' : 'disabled' });

          return agentAttrs.length > 0 ? (
            <div>
              <h4 className="font-mono text-xs text-neutral-500 mb-2">Agent Metadata</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {agentAttrs.map((attr, i) => (
                  <div
                    key={i}
                    className="p-2 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
                  >
                    <p className="font-mono text-[10px] text-neutral-400 uppercase">
                      {attr.trait_type}
                    </p>
                    <p className="font-mono text-xs dark:text-neutral-200 truncate">
                      {attr.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()
      ) : !isExistingAgent && attributes.length > 0 ? (
        <div>
          <h4 className="font-mono text-xs text-neutral-500 mb-2">Attributes</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {attributes.map((attr, i) => (
              <div
                key={i}
                className="p-2 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
              >
                <p className="font-mono text-[10px] text-neutral-400 uppercase">
                  {attr.trait_type}
                </p>
                <p className="font-mono text-xs dark:text-neutral-200 truncate">
                  {attr.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
