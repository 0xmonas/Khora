'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Send, Trash2, ChevronDown } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { getV2Address, getV2ChainId } from '@/lib/contracts/booa-v2';
import type { NFTItem } from '@/app/api/fetch-nfts/route';

const font = { fontFamily: 'var(--font-departure-mono)' };

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

interface AgentMeta {
  name: string;
  emoji?: string;
  creature?: string;
}

function getStorageKey(chainId: number, tokenId: string) {
  return `booa-chat:${chainId}:${tokenId}`;
}

function loadHistory(chainId: number, tokenId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(getStorageKey(chainId, tokenId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(chainId: number, tokenId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(getStorageKey(chainId, tokenId), JSON.stringify(messages.slice(-100)));
  } catch { /* quota exceeded */ }
}

// Map chainId to fetch-nfts chain slug
function getChainSlug(chainId: number): string {
  if (chainId === 360) return 'shape';
  return 'shape-sepolia';
}

export function AgentChat() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const targetChainId = getV2ChainId(chainId);

  const [ownedTokens, setOwnedTokens] = useState<NFTItem[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [agentMeta, setAgentMeta] = useState<AgentMeta | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch owned BOOA NFTs via getNFTsForOwner (same as import/bridge mode)
  useEffect(() => {
    if (!address || !isConnected) {
      setOwnedTokens([]);
      return;
    }

    const booaContract = getV2Address(targetChainId).toLowerCase();
    const slug = getChainSlug(targetChainId);

    setTokensLoading(true);
    fetch(`/api/fetch-nfts?address=${address}&chain=${slug}&contract=${booaContract}`)
      .then((res) => res.json())
      .then((data) => {
        const nfts: NFTItem[] = data.nfts || [];
        // Filter to only BOOA contract tokens
        const booa = nfts.filter((n) => n.contractAddress.toLowerCase() === booaContract);
        setOwnedTokens(booa);
        // Auto-select first if nothing selected
        if (booa.length > 0 && !selectedTokenId) {
          setSelectedTokenId(booa[0].tokenId);
        }
      })
      .catch(() => setOwnedTokens([]))
      .finally(() => setTokensLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, isConnected, targetChainId]);

  // Load chat history & resolve agent metadata when agent changes
  useEffect(() => {
    if (!selectedTokenId || !address) return;

    const history = loadHistory(targetChainId, selectedTokenId);
    setMessages(history);
    setError(null);

    // Try to get metadata from NFT attributes first (already fetched)
    const token = ownedTokens.find((t) => t.tokenId === selectedTokenId);
    const attrs = token?.raw?.attributes || [];
    const getAttr = (t: string) => attrs.find((a) => a.trait_type === t)?.value || '';

    const nameFromAttrs = getAttr('Name') || token?.name || '';
    const emojiFromAttrs = getAttr('Emoji');
    const creatureFromAttrs = getAttr('Creature');

    // If we have trait data from Alchemy, use it directly
    if (nameFromAttrs && nameFromAttrs !== `#${selectedTokenId}`) {
      setAgentMeta({
        name: nameFromAttrs,
        emoji: emojiFromAttrs || undefined,
        creature: creatureFromAttrs || undefined,
      });
      return;
    }

    // Fallback: fetch from Redis metadata API
    const url = `/api/agent-metadata?chainId=${targetChainId}&tokenId=${selectedTokenId}&address=${address}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.found && data.metadata) {
          setAgentMeta({
            name: data.metadata.name || `BOOA #${selectedTokenId}`,
            emoji: data.metadata.emoji,
            creature: data.metadata.creature,
          });
        } else {
          setAgentMeta({ name: `BOOA #${selectedTokenId}` });
        }
      })
      .catch(() => setAgentMeta({ name: `BOOA #${selectedTokenId}` }));
  }, [selectedTokenId, targetChainId, address, ownedTokens]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Re-focus input when loading finishes
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !selectedTokenId || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', text: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const historyForApi = newMessages.slice(-20).map((m) => ({ role: m.role, text: m.text }));
      // Remove last entry since it's the current message
      historyForApi.pop();

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userApiKey) {
        headers['x-gemini-key'] = userApiKey;
      }

      const res = await fetch('/api/agent-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tokenId: Number(selectedTokenId),
          chainId: targetChainId,
          message: userMsg.text,
          history: historyForApi,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.quotaExceeded) {
          setQuotaExceeded(true);
        }
        setError(data.error || 'Failed to get response');
        saveHistory(targetChainId, selectedTokenId, newMessages);
        return;
      }

      if (data.usingOwnKey) {
        setQuotaExceeded(true);
      }

      const agentMsg: ChatMessage = { role: 'model', text: data.reply, timestamp: Date.now() };
      const updatedMessages = [...newMessages, agentMsg];
      setMessages(updatedMessages);
      saveHistory(targetChainId, selectedTokenId, updatedMessages);

      if (typeof data.remaining === 'number') {
        setRemaining(data.remaining);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [input, selectedTokenId, messages, isLoading, targetChainId, userApiKey]);

  const clearChat = useCallback(() => {
    if (!selectedTokenId) return;
    setMessages([]);
    localStorage.removeItem(getStorageKey(targetChainId, selectedTokenId));
  }, [selectedTokenId, targetChainId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-muted-foreground" style={font}>
          Connect your wallet to chat with your agents.
        </p>
      </div>
    );
  }

  // Loading tokens
  if (tokensLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground" style={font}>Loading your agents...</p>
      </div>
    );
  }

  // No owned tokens
  if (ownedTokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-sm text-muted-foreground" style={font}>
          You don&apos;t have any BOOA agents yet.
        </p>
        <p className="text-xs text-muted-foreground" style={font}>
          Mint an agent first to start chatting.
        </p>
      </div>
    );
  }

  const selectedToken = ownedTokens.find((t) => t.tokenId === selectedTokenId);

  return (
    <div className="flex flex-col max-w-2xl mx-auto h-[min(520px,calc(100vh-280px))] min-h-[380px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            style={font}
          >
            {selectedToken?.image && (
              <Image
                src={selectedToken.image}
                alt=""
                width={22}
                height={22}
                className="rounded"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
            <span className="truncate max-w-[180px]">{agentMeta?.emoji || ''} {agentMeta?.name || `#${selectedTokenId}`}</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-60 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-background shadow-lg chat-scrollbar">
              {ownedTokens.map((token) => (
                <button
                  key={token.tokenId}
                  onClick={() => {
                    setSelectedTokenId(token.tokenId);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                    token.tokenId === selectedTokenId ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                  }`}
                  style={font}
                >
                  {token.image && (
                    <Image
                      src={token.image}
                      alt=""
                      width={18}
                      height={18}
                      className="rounded flex-shrink-0"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <span className="truncate">{token.name || `BOOA #${token.tokenId}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className="text-[10px] text-muted-foreground/70" style={font}>
              {remaining}/{CHAT_QUOTA_MAX_DISPLAY}
            </span>
          )}
          <button
            onClick={clearChat}
            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 chat-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-xs text-muted-foreground" style={font}>
              {agentMeta?.emoji || '>'} Start a conversation with {agentMeta?.name || 'your agent'}
            </p>
            <p className="text-[10px] text-muted-foreground/50" style={font}>
              Your agent will respond in character based on its personality and expertise.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-3 py-2 text-xs leading-relaxed rounded-lg ${
                msg.role === 'user'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black'
                  : 'bg-neutral-50 dark:bg-neutral-800/60 text-foreground'
              }`}
              style={font}
            >
              {msg.role === 'model' && agentMeta?.name && (
                <span className="block text-[10px] text-muted-foreground mb-0.5">
                  {agentMeta.emoji || '>'} {agentMeta.name}
                </span>
              )}
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{msg.text}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div
              className="bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-xs rounded-lg"
              style={font}
            >
              <span className="block text-[10px] text-muted-foreground mb-0.5">
                {agentMeta?.emoji || '>'} {agentMeta?.name || 'Agent'}
              </span>
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-center">
            <p className="text-[10px] text-red-500 dark:text-red-400" style={font}>{error}</p>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* API Key input — shown when quota exceeded */}
      {quotaExceeded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-2">
          <div className="flex gap-2 items-center">
            <input
              type="password"
              value={userApiKey}
              onChange={(e) => setUserApiKey(e.target.value.trim())}
              placeholder="Paste your Gemini API key to continue..."
              className="flex-1 px-3 py-1.5 text-[10px] bg-neutral-50 dark:bg-neutral-800/40 rounded text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
              style={font}
            />
            {userApiKey && (
              <span className="text-[10px] text-green-600 dark:text-green-500" style={font}>&#10003;</span>
            )}
          </div>
          <p className="text-[9px] text-muted-foreground/40 mt-1" style={font}>
            Your key is never stored on our servers. Get one free at ai.google.dev
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, 500))}
            onKeyDown={handleKeyDown}
            placeholder={quotaExceeded && !userApiKey ? 'Add your API key above to continue...' : 'Type a message...'}
            rows={1}
            className="flex-1 px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800/40 rounded-lg text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600 transition-shadow"
            style={font}
            disabled={isLoading || (quotaExceeded && !userApiKey)}
            autoFocus
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || (quotaExceeded && !userApiKey)}
            className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground/35" style={font}>
            {input.length}/500
          </span>
          <span className="text-[10px] text-muted-foreground/35" style={font}>
            {quotaExceeded && userApiKey ? 'Using your API key' : 'Enter to send'}
          </span>
        </div>
      </div>
    </div>
  );
}

const CHAT_QUOTA_MAX_DISPLAY = 10;
