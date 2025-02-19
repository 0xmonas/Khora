'use client';

import { usePixelate } from '../../PixelateContext';
import { OutputBox } from '../OutputBox';
import { useEffect, useState } from 'react';
import { convertToSVG } from '@/utils/helpers/svgConverter';
import 'img-comparison-slider';

// Add styles for img-comparison-slider
const sliderStyles = `
  img-comparison-slider {
    --divider-width: 0px;
    --divider-color: transparent;
    --default-handle-width: 40px;
    border: none !important;
    box-shadow: none !important;
    outline: none !important;
  }
  
  img-comparison-slider img {
    object-fit: contain !important;
    width: 100%;
    height: 100%;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }

  img-comparison-slider::part(divider) {
    display: none !important;
  }

  img-comparison-slider::part(first), img-comparison-slider::part(second) {
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
  }

  img-comparison-slider::part(handle) {
    font-family: var(--font-departure-mono);
    color: #fff;
    display: flex;
    align-items: center;
    justify-center: center;
    gap: 8px;
    font-size: 20px;
  }

  img-comparison-slider::part(handle)::before {
    content: "←";
  }

  img-comparison-slider::part(handle)::after {
    content: "→";
  }
`;

// TypeScript için web component tanımlaması
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'img-comparison-slider': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        value?: number;
        onSlide?: (position: number) => void;
      };
    }
  }
}

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
  const [svgSize, setSvgSize] = useState<string>('');
  const [pngSize, setPngSize] = useState<string>('');

  // PNG ve SVG boyutlarını hesapla
  useEffect(() => {
    const calculateSizes = async () => {
      if (generatedImage) {
        try {
          // PNG boyutunu hesapla
          const response = await fetch(generatedImage);
          const blob = await response.blob();
          const pngBytes = blob.size;
          const pngSizeStr = pngBytes < 1024 
            ? `${pngBytes}B` 
            : pngBytes < 1024 * 1024 
              ? `${(pngBytes / 1024).toFixed(1)}KB` 
              : `${(pngBytes / (1024 * 1024)).toFixed(1)}MB`;
          setPngSize(pngSizeStr);

          // SVG boyutunu hesapla (sadece pixel mode aktifse)
          if (pixelMode) {
            const svgData = await convertToSVG(generatedImage, parseInt(selectedSize));
            const svgBytes = new TextEncoder().encode(svgData).length;
            const svgSizeStr = svgBytes < 1024 
              ? `${svgBytes}B` 
              : svgBytes < 1024 * 1024 
                ? `${(svgBytes / 1024).toFixed(1)}KB` 
                : `${(svgBytes / (1024 * 1024)).toFixed(1)}MB`;
            setSvgSize(svgSizeStr);
          }
        } catch (error) {
          console.error('Dosya boyutu hesaplama hatası:', error);
          setPngSize('');
          setSvgSize('');
        }
      }
    };

    calculateSizes();
  }, [generatedImage, selectedSize, pixelMode]);

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
          
          // SVG'yi encode et
          const encodedSvg = `data:image/svg+xml,${encodeURIComponent(svgData)}`;
          
          // Metadata'yı oluştur
          const metadataObj = {
            name: metadata.name,
            description: metadata.description,
            image: encodedSvg
          };

          // Metadata'yı JSON'a çevir ve encode et
          const jsonString = JSON.stringify(metadataObj);
          setTokenURI(`data:application/json;utf8,${encodeURIComponent(jsonString)}`);
          
          // Base64'ten geri çözüp kontrol et
          console.log('Decoded JSON kontrolü:', decodeURIComponent(encodeURIComponent(jsonString)));
          
          console.log('TokenURI oluşturuldu');
        } catch (error) {
          console.error('TokenURI oluşturulurken hata:', error);
        }
      }
    };

    generateTokenURI();
  }, [generatedImage, metadata, selectedSize]);

  // Style elementini head'e ekle
  useEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = sliderStyles;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

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

  const addNewTrait = () => {
    setMetadata(prev => ({
      ...prev,
      attributes: [
        ...prev.attributes,
        { trait_type: '', value: '' }
      ]
    }));
  };

  const removeTrait = (index: number) => {
    setMetadata(prev => ({
      ...prev,
      attributes: prev.attributes.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OutputBox 
          title="compare_images"
          downloadType="png"
          onDownload={downloadImage}
          isDownloadDisabled={!generatedImage || loading || imageLoading}
          type="image"
          onClose={() => goToStep('initial')}
          svgSize={svgSize}
          pngSize={pngSize}
        >
          {generatedImage ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <div className="relative w-[600px] h-[600px]">
                <img-comparison-slider className="absolute inset-0">
                  {previewUrl && (
                    <img
                      slot="first"
                      src={previewUrl}
                      alt="Original"
                      className="w-[600px] h-[600px] object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  )}
                  <img
                    slot="second"
                    src={generatedImage}
                    alt="Pixelated"
                    className="w-[600px] h-[600px] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </img-comparison-slider>
              </div>
            </div>
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <div className="font-mono text-[14px] text-neutral-400 dark:text-neutral-500">
                Image comparison will appear here...
              </div>
            </div>
          )}
        </OutputBox>

        <OutputBox
          title="token_uri"
          downloadType="copy"
          onDownload={handleCopy}
          isDownloadDisabled={!tokenURI}
          type="text"
          onClose={() => {}}
        >
          {tokenURI ? (
            <div className="w-full font-mono text-sm space-y-4">
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <label className="block text-sm text-muted-foreground mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={metadata.name}
                  onChange={(e) => handleMetadataChange('name', e.target.value)}
                  className="w-full bg-transparent outline-none text-foreground"
                  placeholder="Enter artwork name..."
                />
              </div>
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <label className="block text-sm text-muted-foreground mb-1">Created By <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={metadata.created_by}
                  onChange={(e) => handleMetadataChange('created_by', e.target.value)}
                  className="w-full bg-transparent outline-none text-foreground"
                  placeholder="Created by..."
                />
              </div>
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <label className="block text-sm text-muted-foreground mb-1">Description <span className="text-red-500">*</span></label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => handleMetadataChange('description', e.target.value)}
                  className="w-full h-20 bg-transparent outline-none resize-none text-foreground"
                  placeholder="fully on-chain art by khora"
                />
              </div>
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm text-muted-foreground">Traits</label>
                  <button
                    onClick={addNewTrait}
                    className="w-6 h-6 flex items-center justify-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 rounded border-2 border-neutral-700 dark:border-neutral-200"
                  >
                    <span className="text-sm font-mono dark:text-white">+</span>
                  </button>
                </div>
                <div className="space-y-3">
                  {metadata.attributes.map((attr, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input
                        type="text"
                        value={attr.trait_type}
                        onChange={(e) => handleAttributeChange(index, 'trait_type', e.target.value)}
                        className="w-full bg-transparent outline-none text-foreground border-2 border-neutral-700 dark:border-neutral-200 p-2"
                        placeholder="Trait Type"
                      />
                      <input
                        type="text"
                        value={attr.value}
                        onChange={(e) => handleAttributeChange(index, 'value', e.target.value)}
                        className="w-full bg-transparent outline-none text-foreground border-2 border-neutral-700 dark:border-neutral-200 p-2"
                        placeholder="Value"
                      />
                      <button
                        onClick={() => removeTrait(index)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 rounded border-2 border-neutral-700 dark:border-neutral-200"
                      >
                        <span className="text-sm font-mono dark:text-white">-</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <label className="block text-sm text-muted-foreground mb-1">Token URI</label>
                <textarea
                  value={tokenURI}
                  readOnly
                  className="w-full h-32 bg-transparent outline-none resize-none text-foreground"
                />
              </div>
            </div>
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <div className="font-mono text-[14px] text-neutral-400 dark:text-neutral-500">
                Token URI will appear here...
              </div>
            </div>
          )}
        </OutputBox>
      </div>
    </div>
  );
} 