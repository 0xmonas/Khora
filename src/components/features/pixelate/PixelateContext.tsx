'use client';

import { pixalteImage } from '@/utils/pixalte';
import { convertToSVG } from '@/utils/helpers/svgConverter';
import React, { createContext, useContext, useState, useEffect } from 'react';

type Step = 'initial' | 'processing' | 'complete';

interface ImageSettings {
  threshold: number;
  contrast: number;
  brightness: number;
  dithering: number;
}

type PixelateContextType = {
  loading: boolean;
  progress: number;
  error: string | null;
  imageName: string;
  setImageName: (name: string) => void;
  uploadedImage: File | null;
  setUploadedImage: (file: File | null) => void;
  processImage: () => Promise<void>;
  downloadImage: (format: 'png' | 'svg') => Promise<void>;
  generatedImage: string | null;
  imageLoading: boolean;
  currentStep: Step;
  goToStep: (step: Step) => void;
  resetPixelate: () => void;
  pixelMode: boolean;
  setPixelMode: (mode: boolean) => void;
  selectedPalette: 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST';
  setSelectedPalette: (palette: 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST') => void;
  settings: ImageSettings;
  setSettings: (settings: ImageSettings) => void;
  defaultSettings: ImageSettings;
  resetSettings: () => void;
  applySettings: () => Promise<void>;
};

const defaultSettings: ImageSettings = {
  threshold: 0,
  contrast: 100,
  brightness: 100,
  dithering: 10
};

const PixelateContext = createContext<PixelateContextType | null>(null);

export function PixelateProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>('initial');
  const [pixelMode, setPixelMode] = useState(false);
  const [selectedPalette, setSelectedPalette] = useState<'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST'>('MIDWEST');
  const [settings, setSettings] = useState<ImageSettings>(defaultSettings);

  const resetSettings = () => {
    setSettings(defaultSettings);
    if (uploadedImage) {
      processImage();
    }
  };

  const applySettings = async () => {
    if (!uploadedImage) return;
    
    setImageLoading(true);
    try {
      const imageUrl = URL.createObjectURL(uploadedImage);
      if (pixelMode) {
        const pixelated = await pixalteImage(imageUrl, selectedPalette, settings);
        setGeneratedImage(pixelated);
      } else {
        setGeneratedImage(imageUrl);
      }
    } catch (err: any) {
      console.error("Error processing image:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setImageLoading(false);
    }
  };

  // Process image when uploaded or pixel mode changes
  useEffect(() => {
    const processUploadedImage = async () => {
      if (!uploadedImage) return;

      setImageLoading(true);
      try {
        const imageUrl = URL.createObjectURL(uploadedImage);
        
        if (pixelMode) {
          const pixelated = await pixalteImage(imageUrl, selectedPalette, settings);
          setGeneratedImage(pixelated);
        } else {
          setGeneratedImage(imageUrl);
        }
      } catch (err: any) {
        console.error("Error processing image:", err);
        setError(err.message || "An unexpected error occurred");
      } finally {
        setImageLoading(false);
      }
    };

    processUploadedImage();
  }, [uploadedImage, pixelMode, selectedPalette]);

  const goToStep = (step: Step) => {
    setCurrentStep(step);
  };

  const resetPixelate = () => {
    setLoading(false);
    setProgress(0);
    setError(null);
    setImageName('');
    setUploadedImage(null);
    setGeneratedImage(null);
    setImageLoading(false);
    setCurrentStep('initial');
    setPixelMode(false);
    setSelectedPalette('DEFAULT');
    setSettings(defaultSettings);
  };

  const processImage = async () => {
    if (!uploadedImage) {
      setError("Please upload an image");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);
    setCurrentStep('processing');

    try {
      const imageUrl = URL.createObjectURL(uploadedImage);
      if (pixelMode) {
        const pixelated = await pixalteImage(imageUrl, selectedPalette, settings);
        setGeneratedImage(pixelated);
      } else {
        setGeneratedImage(imageUrl);
      }
      setProgress(100);
      setCurrentStep('complete');
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "An unexpected error occurred");
      setCurrentStep('initial');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = async (format: 'png' | 'svg') => {
    if (!generatedImage) return;
    
    try {
      if (format === 'svg' && pixelMode) {
        const svgData = await convertToSVG(generatedImage);
        const link = document.createElement('a');
        link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgData)}`;
        link.download = `${imageName.split('.')[0]}_pixelated.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `${imageName.split('.')[0]}_${pixelMode ? 'pixelated' : 'original'}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Download error:', error);
      setError('Failed to download image');
    }
  };

  const value = {
    loading,
    progress,
    error,
    imageName,
    setImageName,
    uploadedImage,
    setUploadedImage,
    processImage,
    downloadImage,
    generatedImage,
    imageLoading,
    currentStep,
    goToStep,
    resetPixelate,
    pixelMode,
    setPixelMode,
    selectedPalette,
    setSelectedPalette,
    settings,
    setSettings,
    defaultSettings,
    resetSettings,
    applySettings
  };

  return (
    <PixelateContext.Provider value={value}>
      {children}
    </PixelateContext.Provider>
  );
}

export function usePixelate() {
  const context = useContext(PixelateContext);
  if (!context) {
    throw new Error('usePixelate must be used within a PixelateProvider');
  }
  return context;
} 