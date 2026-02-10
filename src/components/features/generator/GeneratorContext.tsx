'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { pixelateImage } from '@/utils/pixelator';
import { createPortraitPrompt } from '@/utils/helpers/createPortraitPrompt';
import type { KhoraAgent, SupportedChain } from '@/types/agent';

export type Mode = 'create' | 'import';
export type Step = 'input' | 'generating' | 'complete';

type GeneratorContextType = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  agentName: string;
  setAgentName: (name: string) => void;
  agentDescription: string;
  setAgentDescription: (desc: string) => void;
  selectedChain: SupportedChain;
  setSelectedChain: (chain: SupportedChain) => void;
  agentId: string;
  setAgentId: (id: string) => void;
  agent: KhoraAgent | null;
  loading: boolean;
  progress: number;
  error: string | null;
  currentStep: Step;
  generatedImage: string | null;
  pixelatedImage: string | null;
  imageLoading: boolean;
  mintedTokenId: bigint | null;
  setMintedTokenId: (id: bigint | null) => void;
  generate: () => Promise<void>;
  downloadAgent: (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => Promise<void>;
  reset: () => void;
};

export const GeneratorContext = createContext<GeneratorContextType | undefined>(undefined);

export function GeneratorProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('create');
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [selectedChain, setSelectedChain] = useState<SupportedChain>('ethereum');
  const [agentId, setAgentId] = useState('');
  const [agent, setAgent] = useState<KhoraAgent | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [pixelatedImage, setPixelatedImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);

  // Restore from localStorage (mount-only — intentionally no deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const savedData = localStorage.getItem('khoraGeneratorData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.agent) setAgent(parsed.agent);
        if (parsed.generatedImage) setGeneratedImage(parsed.generatedImage);
        if (parsed.pixelatedImage) setPixelatedImage(parsed.pixelatedImage);
        if (parsed.currentStep) setCurrentStep(parsed.currentStep as Step);
        if (parsed.agentName) setAgentName(parsed.agentName);
        if (parsed.agentDescription) setAgentDescription(parsed.agentDescription);
        if (parsed.mode) setMode(parsed.mode);
      } catch {
        localStorage.removeItem('khoraGeneratorData');
      }
    }
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (agent || generatedImage) {
      localStorage.setItem('khoraGeneratorData', JSON.stringify({
        agent, generatedImage, pixelatedImage, currentStep,
        agentName, agentDescription, mode,
      }));
    }
  }, [agent, generatedImage, pixelatedImage, currentStep, agentName, agentDescription, mode]);

  // Pixelate when image changes (pixel mode always on)
  useEffect(() => {
    const processImage = async () => {
      if (!generatedImage) {
        setPixelatedImage(null);
        return;
      }
      setImageLoading(true);
      try {
        const img = new Image();
        img.src = generatedImage;
        await new Promise<void>((resolve) => { img.onload = () => resolve(); });
        const processed = await pixelateImage(generatedImage);
        setPixelatedImage(processed);
      } catch {
        setPixelatedImage(generatedImage);
      } finally {
        setImageLoading(false);
      }
    };
    processImage();
  }, [generatedImage]);

  const reset = () => {
    localStorage.removeItem('khoraGeneratorData');
    setAgent(null);
    setLoading(false);
    setProgress(0);
    setError(null);
    setAgentName('');
    setAgentDescription('');
    setAgentId('');
    setSelectedChain('ethereum');
    setGeneratedImage(null);
    setPixelatedImage(null);
    setImageLoading(false);
    setCurrentStep('input');
    setMode('create');
    setMintedTokenId(null);
  };

  const generateImageFromAgent = async (agentData: Omit<KhoraAgent, 'image'>) => {
    setImageLoading(true);
    try {
      const prompt = await createPortraitPrompt(agentData);
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch { throw new Error('Invalid response format from image API'); }

      if (!response.ok || data.error) {
        throw new Error(data.error || `Image generation failed: ${response.status}`);
      }
      if (!data.image) throw new Error('No image in response');
      setGeneratedImage(data.image);
      return data.image;
    } finally {
      setImageLoading(false);
    }
  };

  const generate = async () => {
    if (mode === 'create') {
      if (!agentName.trim()) { setError('Agent name is required'); return; }
      if (!agentDescription.trim()) { setError('Agent description is required'); return; }
    } else {
      if (!agentId.trim()) { setError('Agent ID is required'); return; }
      const parsed = parseInt(agentId);
      if (isNaN(parsed) || parsed <= 0) { setError('Agent ID must be a positive number'); return; }
    }

    setLoading(true);
    setError(null);
    setProgress(0);
    setCurrentStep('generating');

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) { clearInterval(progressInterval); return 90; }
        return prev + 10;
      });
    }, 500);

    try {
      let agentData: Omit<KhoraAgent, 'image'>;

      if (mode === 'create') {
        const agentResponse = await fetch('/api/generate-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: agentName.trim(), description: agentDescription.trim() }),
        });
        const agentResult = await agentResponse.json();
        if (!agentResponse.ok || agentResult.error) throw new Error(agentResult.error || 'Failed to generate agent');
        agentData = agentResult.agent;
      } else {
        // Fetch from ERC-8004 registry
        const fetchResponse = await fetch('/api/fetch-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chain: selectedChain, agentId: parseInt(agentId) }),
        });
        const fetchResult = await fetchResponse.json();
        if (!fetchResponse.ok || fetchResult.error) throw new Error(fetchResult.error || 'Failed to fetch agent');

        const registration = fetchResult.registration;
        const allSkills: string[] = [];
        const allDomains: string[] = [];
        // ERC-8004 spec uses "endpoints", but our internal model uses "services"
        const services = registration.services || registration.endpoints || [];
        for (const svc of services) {
          if (svc.skills) allSkills.push(...svc.skills);
          if (svc.domains) allDomains.push(...svc.domains);
        }

        // Enrich with OpenClaw personality fields
        const enrichResponse = await fetch('/api/enrich-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: registration.name,
            description: registration.description || '',
            skills: Array.from(new Set(allSkills)),
            domains: Array.from(new Set(allDomains)),
          }),
        });
        const enrichResult = await enrichResponse.json();
        if (!enrichResponse.ok || enrichResult.error) throw new Error(enrichResult.error || 'Failed to enrich agent');
        agentData = enrichResult.agent;
        agentData.services = registration.services || registration.endpoints || [];
      }

      // Generate PFP
      const imageUrl = await generateImageFromAgent(agentData);
      const finalAgent: KhoraAgent = { ...agentData, image: imageUrl };
      setAgent(finalAgent);
      setProgress(100);
      setCurrentStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setCurrentStep('input');
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  const downloadAgent = async (format: 'png' | 'svg' | 'erc8004' | 'openclaw' | 'json') => {
    if (!agent) return;
    const imageToUse = pixelatedImage || generatedImage;
    const fileName = agent.name.toLowerCase().replace(/\s+/g, '-');

    try {
      if (format === 'json') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { image: _img, ...dataWithoutImage } = agent;
        const blob = new Blob([JSON.stringify(dataWithoutImage, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${fileName}.json`);
      } else if (format === 'png') {
        if (!imageToUse) return;
        const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
        const agentWithPixelImage = { ...agent, image: imageToUse };
        const pngBlob = await embedJsonInPng(imageToUse, agentWithPixelImage);
        downloadBlob(pngBlob, `${fileName}.png`);
      } else if (format === 'svg') {
        if (!imageToUse) return;
        const { createSVGBlob } = await import('@/utils/helpers/svgConverter');
        const svgBlob = await createSVGBlob(imageToUse);
        downloadBlob(svgBlob, `${fileName}.svg`);
      } else if (format === 'erc8004') {
        const { toERC8004 } = await import('@/utils/helpers/exportFormats');
        const agentWithPixelImage = { ...agent, image: imageToUse || agent.image };
        let onChainImage: string | undefined;
        if (mintedTokenId !== null) {
          const contractAddr = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
          if (contractAddr) {
            onChainImage = `eip155:8453/erc721:${contractAddr}/${mintedTokenId.toString()}`;
          }
        }
        const registration = toERC8004(agentWithPixelImage, onChainImage);
        const blob = new Blob([JSON.stringify(registration, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `${fileName}-erc8004.json`);
      } else if (format === 'openclaw') {
        const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
        const zipBlob = await toOpenClawZip(agent);
        downloadBlob(zipBlob, `${fileName}-openclaw.zip`);
      }
    } catch {
      setError('Failed to download');
    }
  };

  const value: GeneratorContextType = {
    mode, setMode, agentName, setAgentName, agentDescription, setAgentDescription,
    selectedChain, setSelectedChain, agentId, setAgentId,
    agent, loading, progress, error, currentStep, generatedImage, pixelatedImage, imageLoading,
    mintedTokenId, setMintedTokenId,
    generate, downloadAgent, reset,
  };

  return (
    <GeneratorContext.Provider value={value}>
      {children}
    </GeneratorContext.Provider>
  );
}

export function useGenerator() {
  const context = useContext(GeneratorContext);
  if (context === undefined) throw new Error('useGenerator must be used within a GeneratorProvider');
  return context;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
