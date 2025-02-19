'use client';
import { usePixelate } from '../../PixelateContext';
import { convertToSVG } from '@/utils/helpers/svgConverter';
import { useState, useEffect } from 'react';

export function InputForm() {
  const [svgSize, setSvgSize] = useState<string>('');
  const {
    loading,
    error,
    imageName,
    setImageName,
    uploadedImage,
    setUploadedImage,
    currentStep,
    resetPixelate,
    setPixelMode,
    selectedPalette,
    setSelectedPalette,
    settings,
    setSettings,
    resetSettings,
    applySettings,
    selectedSize,
    setSelectedSize,
    generatedImage
  } = usePixelate();

  useEffect(() => {
    const calculateSvgSize = async () => {
      if (generatedImage) {
        try {
          const svgData = await convertToSVG(generatedImage, parseInt(selectedSize));
          const bytes = new TextEncoder().encode(svgData).length;
          const size = bytes < 1024 
            ? `${bytes}B` 
            : bytes < 1024 * 1024 
              ? `${(bytes / 1024).toFixed(1)}KB` 
              : `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
          setSvgSize(size);
        } catch (error) {
          console.error('SVG size calculation error:', error);
          setSvgSize('');
        }
      }
    };

    calculateSvgSize();
  }, [generatedImage, selectedSize]);

  // Apply settings automatically when changed
  const handleSettingChange = async (key: keyof typeof settings, value: number) => {
    console.log(`Setting change starting - ${key}:`, value);
    
    // First update state
    const newSettings = { 
      ...settings, 
      [key]: value 
    };
    
    console.log('Applying new settings:', {
      key,
      oldValue: settings[key],
      newValue: value,
      allSettings: newSettings
    });
    
    setSettings(newSettings);

    // Wait for state update to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      await applySettings();
    } catch (error) {
      console.error(`Error applying ${key} setting:`, error);
    }
  };

  // Activate pixel mode automatically when image is uploaded
  const handleImageUpload = (file: File) => {
    setImageName(file.name);
    setPixelMode(true);
    setUploadedImage(file);
  };

  return (
    <form className="space-y-8">
      <div>
        <h3 className="text-sm font-mono mb-1 dark:text-white">Upload Image</h3>
        <div 
          className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
            currentStep === 'processing'
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (currentStep === 'processing') return;
              const file = e.target.files?.[0];
              if (file) {
                handleImageUpload(file);
              }
            }}
            className="w-full bg-transparent outline-none cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-sm file:font-mono
            file:bg-neutral-600 dark:file:bg-neutral-300 file:text-white dark:file:text-neutral-900
            hover:file:bg-neutral-500 dark:hover:file:bg-neutral-400 file:transition-colors"
            disabled={currentStep === 'processing'}
          />
        </div>
      </div>

      {uploadedImage && (
        <>
          <div>
            <h3 className="text-sm font-mono mb-1 dark:text-white">Color Style</h3>
            <div 
              className={`w-full p-3 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-sm ${
                currentStep === 'processing'
                  ? 'opacity-50 cursor-not-allowed'
                  : ''
              }`}
            >
              <select
                value={selectedPalette}
                onChange={(e) => setSelectedPalette(e.target.value as 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST' | 'SECAM' | 'C64')}
                disabled={currentStep === 'processing'}
                className="w-full bg-transparent outline-none cursor-pointer"
              >
                <option value="DEFAULT">Default Blue</option>
                <option value="MIDWEST">Midwest</option>
                <option value="MONOCHROME">Monochrome</option>
                <option value="EXPERIMENTAL">Experimental</option>
                <option value="SECAM">SECAM</option>
                <option value="C64">Commodore 64</option>
              </select>
            </div>
          </div>

          <div className="space-y-6 bg-neutral-700 dark:bg-neutral-200 p-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-mono text-white dark:text-neutral-900">
                  Pixel Size
                </h3>
                <span className="text-sm font-mono text-white dark:text-neutral-900">
                  {selectedSize === '64' ? '1x' : selectedSize === '124' ? '2x' : '3x'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                value={selectedSize === '64' ? '0' : selectedSize === '124' ? '1' : '2'}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '0') setSelectedSize('64');
                  else if (value === '1') setSelectedSize('124');
                  else setSelectedSize('192');
                }}
                className="w-full appearance-none h-1 bg-white dark:bg-neutral-900 rounded-full outline-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#30f] dark:[&::-webkit-slider-thumb]:bg-[#30f] [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#30f] dark:[&::-moz-range-thumb]:bg-[#30f] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                disabled={currentStep === 'processing'}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-mono text-white dark:text-neutral-900">Contrast</h3>
                <span className="text-sm font-mono text-white dark:text-neutral-900">{settings.contrast}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={settings.contrast}
                onChange={(e) => handleSettingChange('contrast', parseInt(e.target.value))}
                className="w-full appearance-none h-1 bg-white dark:bg-neutral-900 rounded-full outline-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#30f] dark:[&::-webkit-slider-thumb]:bg-[#30f] [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#30f] dark:[&::-moz-range-thumb]:bg-[#30f] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-mono text-white dark:text-neutral-900">Brightness</h3>
                <span className="text-sm font-mono text-white dark:text-neutral-900">{settings.brightness}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={settings.brightness}
                onChange={(e) => handleSettingChange('brightness', parseInt(e.target.value))}
                className="w-full appearance-none h-1 bg-white dark:bg-neutral-900 rounded-full outline-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#30f] dark:[&::-webkit-slider-thumb]:bg-[#30f] [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#30f] dark:[&::-moz-range-thumb]:bg-[#30f] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-mono text-white dark:text-neutral-900">Dithering</h3>
                <span className="text-sm font-mono text-white dark:text-neutral-900">{settings.dithering}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.dithering}
                onChange={(e) => handleSettingChange('dithering', parseInt(e.target.value))}
                className="w-full appearance-none h-1 bg-white dark:bg-neutral-900 rounded-full outline-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#30f] dark:[&::-webkit-slider-thumb]:bg-[#30f] [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#30f] dark:[&::-moz-range-thumb]:bg-[#30f] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={resetSettings}
                className="w-full p-3 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                Reset Settings
              </button>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="text-sm text-red-500">{error}</div>
      )}
    </form>
  );
} 