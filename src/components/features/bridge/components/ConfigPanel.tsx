'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Plus, X as XIcon } from 'lucide-react';
import { useBridge } from '../BridgeContext';
import { OASF_SKILLS, OASF_DOMAINS, ALL_OASF_SKILLS, ALL_OASF_DOMAINS, type OASFCategory } from '@/lib/oasf-taxonomy';
import type { AgentService } from '@/types/agent';

const SERVICE_TYPES = ['web', 'A2A', 'MCP', 'OASF', 'ENS', 'DID', 'email'] as const;

const SERVICE_PLACEHOLDERS: Record<string, string> = {
  web: 'https://myagent.com/',
  A2A: 'https://agent.example/.well-known/agent-card.json',
  MCP: 'https://mcp.myagent.com/',
  OASF: 'ipfs://{cid}',
  ENS: 'myagent.eth',
  DID: 'did:method:identifier',
  email: 'agent@example.com',
};

function isValidEndpoint(type: string, endpoint: string): boolean {
  if (!endpoint.trim()) return false;
  if (type === 'ENS') return /^[a-zA-Z0-9-]+\.eth$/.test(endpoint.trim());
  if (type === 'DID') return endpoint.trim().startsWith('did:');
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endpoint.trim());
  try { new URL(endpoint.trim()); return true; } catch { return false; }
}

export function ConfigPanel() {
  const {
    selectedNFT, clearSelection, isExistingAgent, configLoading,
    agentName, setAgentName,
    agentDescription, setAgentDescription,
    agentImage,
    erc8004Services, setErc8004Services,
    selectedSkills, setSelectedSkills,
    selectedDomains, setSelectedDomains,
    x402Support, setX402Support,
    register, updateAgent, error, step,
  } = useBridge();

  const [showErc8004, setShowErc8004] = useState(isExistingAgent);
  // Sync showErc8004 when isExistingAgent changes (initial useState captures stale false)
  useEffect(() => {
    if (isExistingAgent) setShowErc8004(true);
  }, [isExistingAgent]);
  const [skillSearch, setSkillSearch] = useState('');
  const [domainSearch, setDomainSearch] = useState('');
  const [openSkillCats, setOpenSkillCats] = useState<Set<string>>(new Set());
  const [openDomainCats, setOpenDomainCats] = useState<Set<string>>(new Set());
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customDomains, setCustomDomains] = useState<string[]>([]);

  if (!selectedNFT) return null;

  const isBusy = step === 'registering';

  // Service management
  const addService = () => {
    setErc8004Services([...erc8004Services, { name: 'web', endpoint: '', version: '1' }]);
  };
  const removeService = (idx: number) => {
    setErc8004Services(erc8004Services.filter((_, i) => i !== idx));
  };
  const updateService = (idx: number, patch: Partial<AgentService>) => {
    setErc8004Services(erc8004Services.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  // Taxonomy toggles
  const toggleSkill = (s: string) => {
    setSelectedSkills(
      selectedSkills.includes(s)
        ? selectedSkills.filter(v => v !== s)
        : [...selectedSkills, s]
    );
  };
  const toggleDomain = (d: string) => {
    setSelectedDomains(
      selectedDomains.includes(d)
        ? selectedDomains.filter(v => v !== d)
        : [...selectedDomains, d]
    );
  };
  const toggleCat = (cat: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Custom tags
  const addCustomSkill = (s: string) => {
    if (!selectedSkills.includes(s)) {
      setSelectedSkills([...selectedSkills, s]);
      setCustomSkills([...customSkills, s]);
    }
  };
  const removeCustomSkill = (s: string) => {
    setSelectedSkills(selectedSkills.filter(v => v !== s));
    setCustomSkills(customSkills.filter(v => v !== s));
  };
  const addCustomDomain = (d: string) => {
    if (!selectedDomains.includes(d)) {
      setSelectedDomains([...selectedDomains, d]);
      setCustomDomains([...customDomains, d]);
    }
  };
  const removeCustomDomain = (d: string) => {
    setSelectedDomains(selectedDomains.filter(v => v !== d));
    setCustomDomains(customDomains.filter(v => v !== d));
  };

  return (
    <div className="w-full lg:w-[300px] flex-shrink-0">
      <div className={`space-y-6 ${isBusy || configLoading ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Back button */}
        <button
          onClick={clearSelection}
          disabled={isBusy}
          className="font-mono text-xs text-neutral-500 hover:text-black dark:hover:text-white transition-colors disabled:opacity-50"
        >
          &larr; Back
        </button>

        {/* Selected NFT mini preview */}
        <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 flex items-center gap-3">
          {agentImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agentImage}
              alt={agentName}
              className="w-12 h-12 object-cover border border-neutral-300 dark:border-neutral-600"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] text-neutral-500 truncate">{selectedNFT.collection}</p>
            <p className="font-mono text-sm dark:text-white truncate">#{selectedNFT.tokenId}</p>
          </div>
        </div>

        {/* Agent Name */}
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">Agent name</h3>
          <div className="w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className="w-full bg-transparent outline-none"
              placeholder="Agent name..."
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-sm font-mono mb-1 dark:text-white">Description</h3>
          <div className="w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm">
            <textarea
              value={agentDescription}
              onChange={(e) => setAgentDescription(e.target.value)}
              className="w-full bg-transparent outline-none resize-none min-h-[80px]"
              placeholder="Agent description..."
              rows={3}
            />
          </div>
        </div>

        {/* ERC-8004 Config (collapsible) */}
        <div>
          <button
            type="button"
            onClick={() => setShowErc8004(!showErc8004)}
            className="w-full flex items-center justify-between py-2 text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
          >
            <span>ERC-8004 Config</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showErc8004 ? 'rotate-180' : ''}`} />
          </button>

          {showErc8004 && (
            <div className="space-y-4 pb-2">
              {/* Services */}
              <div>
                <h3 className="text-xs font-mono mb-2 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Services</h3>
                <div className="space-y-2">
                  {erc8004Services.map((svc, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1">
                        <div className="w-[70px] flex-shrink-0 bg-neutral-700 dark:bg-neutral-200 font-mono text-xs">
                          <select
                            value={svc.name}
                            onChange={(e) => updateService(idx, { name: e.target.value })}
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1.5 cursor-pointer"
                          >
                            {SERVICE_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div className={`flex-1 min-w-0 bg-neutral-700 dark:bg-neutral-200 font-mono text-xs ${
                          svc.endpoint && !isValidEndpoint(svc.name, svc.endpoint) ? 'ring-1 ring-red-500/50' : ''
                        }`}>
                          <input
                            type="text"
                            value={svc.endpoint}
                            onChange={(e) => updateService(idx, { endpoint: e.target.value })}
                            placeholder={SERVICE_PLACEHOLDERS[svc.name] || 'endpoint...'}
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1.5"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeService(idx)}
                          className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-500 transition-colors"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 ml-[74px]">
                        <span className="text-[10px] font-mono text-neutral-400 flex-shrink-0">ver</span>
                        <div className="flex-1 bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px]">
                          <input
                            type="text"
                            value={svc.version || ''}
                            onChange={(e) => updateService(idx, { version: e.target.value || undefined })}
                            placeholder="e.g. 0.3.0"
                            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addService}
                  className="mt-2 flex items-center gap-1 text-xs font-mono text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add service
                </button>
              </div>

              {/* Agent Skills (OASF) */}
              <TaxonomyPicker
                title="Agent Skills (OASF)"
                categories={OASF_SKILLS}
                allTaxonomy={ALL_OASF_SKILLS}
                selected={selectedSkills}
                onToggle={toggleSkill}
                onAdd={addCustomSkill}
                onRemoveCustom={removeCustomSkill}
                search={skillSearch}
                onSearchChange={setSkillSearch}
                openCats={openSkillCats}
                onToggleCat={(cat) => toggleCat(cat, setOpenSkillCats)}
                customTags={customSkills}
              />

              {/* Application Domains (OASF) */}
              <TaxonomyPicker
                title="Domains (OASF)"
                categories={OASF_DOMAINS}
                allTaxonomy={ALL_OASF_DOMAINS}
                selected={selectedDomains}
                onToggle={toggleDomain}
                onAdd={addCustomDomain}
                onRemoveCustom={removeCustomDomain}
                search={domainSearch}
                onSearchChange={setDomainSearch}
                openCats={openDomainCats}
                onToggleCat={(cat) => toggleCat(cat, setOpenDomainCats)}
                customTags={customDomains}
              />

              {/* x402 Payment */}
              <div>
                <h3 className="text-xs font-mono mb-1.5 text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">x402 Payment</h3>
                <div className="flex gap-1">
                  {[false, true].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => setX402Support(val)}
                      className={`px-3 py-1 font-mono text-[10px] border transition-colors ${
                        x402Support === val
                          ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border-neutral-700 dark:border-neutral-200'
                          : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                      }`}
                    >
                      {val ? 'on' : 'off'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 mt-4">{error}</div>
      )}

      {/* Config loading */}
      {configLoading && (
        <p className="font-mono text-xs text-neutral-500 animate-pulse mt-4">Loading agent data...</p>
      )}

      {/* Action Button */}
      <div className="mt-6">
        <button
          type="button"
          onClick={isExistingAgent ? updateAgent : register}
          disabled={!agentName.trim() || isBusy || configLoading}
          className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-sm hover:bg-neutral-600 dark:hover:bg-neutral-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isBusy
            ? (isExistingAgent ? 'UPDATING...' : 'REGISTERING...')
            : (isExistingAgent ? 'UPDATE AGENT' : 'REGISTER AS AGENT')
          }
        </button>
        <p className="font-mono text-[10px] text-neutral-400 text-center mt-1">
          gas only, no fee
        </p>
      </div>
    </div>
  );
}

/* ─── TaxonomyPicker ─── same component as InputForm */
function TaxonomyPicker({
  title,
  categories,
  allTaxonomy,
  selected,
  onToggle,
  onAdd,
  onRemoveCustom,
  search,
  onSearchChange,
  openCats,
  onToggleCat,
  customTags,
}: {
  title: string;
  categories: OASFCategory[];
  allTaxonomy: Set<string>;
  selected: string[];
  onToggle: (item: string) => void;
  onAdd: (item: string) => void;
  onRemoveCustom: (item: string) => void;
  search: string;
  onSearchChange: (s: string) => void;
  openCats: Set<string>;
  onToggleCat: (cat: string) => void;
  customTags: string[];
}) {
  const [customInput, setCustomInput] = useState('');
  const lowerSearch = search.toLowerCase();
  const filteredCats = categories
    .map(cat => ({
      ...cat,
      items: lowerSearch
        ? cat.items.filter(item => item.toLowerCase().includes(lowerSearch))
        : cat.items,
    }))
    .filter(cat => cat.items.length > 0);

  const totalSelected = selected.length;

  const handleAddCustom = () => {
    const val = customInput.trim();
    if (val && !selected.includes(val) && !allTaxonomy.has(val)) {
      onAdd(val);
      setCustomInput('');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-xs font-mono text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{title}</h3>
        {totalSelected > 0 && (
          <span className="text-[10px] font-mono text-neutral-400">{totalSelected} selected</span>
        )}
      </div>

      {/* Selected items (shown at top of picker) */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5 p-1.5 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
          {selected.map(item => (
            <button
              key={`sel-${item}`}
              type="button"
              onClick={() => onToggle(item)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[9px] bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border border-neutral-700 dark:border-neutral-200 hover:opacity-80 transition-opacity"
            >
              {item}
              <XIcon className="w-2 h-2 ml-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px] mb-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
        />
      </div>

      {/* Categories accordion */}
      <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
        {filteredCats.map(cat => {
          const isOpen = openCats.has(cat.label) || !!lowerSearch;
          const catSelected = cat.items.filter(i => selected.includes(i)).length;

          return (
            <div key={cat.label}>
              <button
                type="button"
                onClick={() => onToggleCat(cat.label)}
                className="w-full flex items-center justify-between py-1 text-[10px] font-mono text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                <span className="flex items-center gap-1">
                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : '-rotate-90'}`} />
                  {cat.label}
                </span>
                {catSelected > 0 && (
                  <span className="text-neutral-500">{catSelected}/{cat.items.length}</span>
                )}
              </button>

              {isOpen && (
                <div className="flex flex-wrap gap-1 pb-1.5 pl-3.5">
                  {cat.items.map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onToggle(item)}
                      className={`px-1.5 py-0.5 font-mono text-[9px] border transition-colors ${
                        selected.includes(item)
                          ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 border-neutral-700 dark:border-neutral-200'
                          : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom add */}
      <div className="mt-1.5 flex items-center gap-1">
        <div className="flex-1 bg-neutral-700 dark:bg-neutral-200 font-mono text-[10px]">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
            placeholder="Add custom..."
            className="w-full bg-transparent text-white dark:text-neutral-900 outline-none px-1.5 py-1"
          />
        </div>
        <button
          type="button"
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
          className="flex-shrink-0 p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Custom tags */}
      {customTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {customTags.map(tag => (
            <span
              key={`custom-${tag}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 font-mono text-[9px] text-neutral-400 dark:text-neutral-500 border border-neutral-400 dark:border-neutral-500"
            >
              {tag}
              <button type="button" onClick={() => onRemoveCustom(tag)} className="hover:text-red-500 transition-colors">
                <XIcon className="w-2 h-2" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
