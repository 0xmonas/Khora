'use client';

import { usePixelate } from '../../PixelateContext';
import { OutputBox } from '../OutputBox';
import { useEffect, useState } from 'react';
import { convertToSVG } from '@/utils/helpers/svgConverter';

export function OutputSection() {
  const {
    generatedImage,
    uploadedImage,
    downloadImage,
    currentStep,
    goToStep,
    pixelMode,
    loading,
    imageLoading,
    selectedSize
  } = usePixelate();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    name: '',
    created_by: '',
    description: '',
    attributes: [
      {
        trait_type: '',
        value: ''
      },
      {
        trait_type: '',
        value: ''
      }
    ]
  });
  const [tokenURI, setTokenURI] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (uploadedImage) {
      const url = URL.createObjectURL(uploadedImage);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [uploadedImage]);

  useEffect(() => {
    const generateTokenURI = async () => {
      if (generatedImage) {
        try {
          console.log('TokenURI oluşturuluyor...');
          const svgData = await convertToSVG(generatedImage, parseInt(selectedSize));
          console.log('SVG dönüşümü tamamlandı:', svgData.substring(0, 50) + '...');
          
          const fullMetadata = {
            ...metadata,
            image: `data:image/svg+xml;base64,${btoa(svgData)}`
          };

          const jsonString = JSON.stringify(fullMetadata);
          const base64 = btoa(jsonString);
          setTokenURI(`data:application/json;base64,${base64}`);
          
          console.log('TokenURI oluşturuldu');
        } catch (error) {
          console.error('TokenURI oluşturulurken hata:', error);
        }
      }
    };

    generateTokenURI();
  }, [generatedImage, metadata, selectedSize]);

  const handleMetadataChange = (key: string, value: string) => {
    setMetadata(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleAttributeChange = (index: number, key: 'trait_type' | 'value', value: string) => {
    setMetadata(prev => ({
      ...prev,
      attributes: prev.attributes.map((attr, i) => 
        i === index ? { ...attr, [key]: value } : attr
      )
    }));
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tokenURI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-6">
      <div className="flex flex-col w-full">
        <OutputBox 
          title={pixelMode ? "pixelated_image" : "original_image"}
          downloadType="png"
          onDownload={downloadImage}
          isDownloadDisabled={!generatedImage || loading || imageLoading}
          type="image"
          onClose={() => goToStep('initial')}
        >
          {generatedImage && (
            <div className="relative w-full h-[600px]">
              <img
                src={generatedImage}
                alt={pixelMode ? "Pixelated" : "Original"}
                className="w-full h-full object-contain"
              />
            </div>
          )}
        </OutputBox>
      </div>

      {generatedImage && (
        <div className="flex flex-col w-full">
          <OutputBox
            title="token_uri"
            downloadType="none"
            onDownload={() => {}}
            isDownloadDisabled={true}
            type="text"
            onClose={() => {}}
          >
            <div className="w-full font-mono text-sm space-y-4">
              <div className="border-2 border-primary p-3">
                <label className="block text-sm text-muted-foreground mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={metadata.name}
                  onChange={(e) => handleMetadataChange('name', e.target.value)}
                  className="w-full bg-transparent outline-none text-foreground"
                  placeholder="Enter artwork name..."
                />
              </div>
              <div className="border-2 border-primary p-3">
                <label className="block text-sm text-muted-foreground mb-1">Created By <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={metadata.created_by}
                  onChange={(e) => handleMetadataChange('created_by', e.target.value)}
                  className="w-full bg-transparent outline-none text-foreground"
                  placeholder="Created by..."
                />
              </div>
              <div className="border-2 border-primary p-3">
                <label className="block text-sm text-muted-foreground mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => handleMetadataChange('description', e.target.value)}
                  className="w-full h-20 bg-transparent outline-none resize-none text-foreground"
                  placeholder="fully on-chain art by khora"
                />
              </div>
              <div className="border-2 border-primary p-3">
                <label className="block text-sm text-muted-foreground mb-2">Attributes <span className="text-red-500">*</span></label>
                <div className="space-y-2">
                  {metadata.attributes.map((attr, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="w-1/2">
                        <input
                          type="text"
                          value={attr.trait_type}
                          onChange={(e) => handleAttributeChange(index, 'trait_type', e.target.value)}
                          className="w-full p-2 bg-transparent border border-primary outline-none text-foreground"
                          placeholder={`Trait type ${index + 1} *`}
                        />
                      </div>
                      <div className="w-1/2">
                        <input
                          type="text"
                          value={attr.value}
                          onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                          className="w-full p-2 bg-transparent border border-primary outline-none text-foreground"
                          placeholder={`Value ${index + 1} *`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-2 border-primary p-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm text-muted-foreground">Token URI</label>
                  <button
                    onClick={handleCopy}
                    className="text-sm font-mono text-primary hover:text-primary/80 transition-colors"
                  >
                    {copied ? 'copied!' : 'copy'}
                  </button>
                </div>
                <textarea
                  value={tokenURI}
                  readOnly
                  className="w-full h-32 bg-transparent outline-none resize-none text-foreground"
                />
              </div>
            </div>
          </OutputBox>
        </div>
      )}
    </div>
  );
} 