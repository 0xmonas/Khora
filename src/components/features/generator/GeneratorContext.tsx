'use client';

import { pixelateImage } from '@/utils/pixelator';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { createPortraitPrompt } from '@/utils/helpers/createPortraitPrompt';
import { Framework, FRAMEWORKS, CLIENTS_BY_FRAMEWORK, ElizaTemplate, ZerePyTemplate, CharacterTemplate, createElizaTemplate, createZerePyTemplate, createFleekTemplate } from '@/types/templates';

export type Step = 'initial' | 'framework_selection' | 'client_selection' | 'generating' | 'complete';

type GeneratorContextType = {
 character: CharacterTemplate | null;
 loading: boolean;
 progress: number;
 error: string | null;
 characterName: string;
 setCharacterName: (name: string) => void;
 generateCharacter: () => Promise<void>;
 downloadCharacter: (format: 'json' | 'png' | 'svg') => Promise<void>; // 'svg' eklendi
 generatedImage: string | null;
 imageLoading: boolean;
 selectedClients: string[];
 setSelectedClients: (clients: string[]) => void;
 selectedFramework: Framework | null;
 setSelectedFramework: (framework: Framework | null) => void;
 currentStep: Step;
 goToStep: (step: Step) => void;
 FRAMEWORKS: readonly Framework[];
 CLIENTS_BY_FRAMEWORK: Record<Framework, string[]>;
 resetGenerator: () => void;
 pixelMode: boolean;
  setPixelMode: (mode: boolean) => void;
  pixelatedImage: string | null;
  initialPixelMode: boolean | null;
};

export const GeneratorContext = createContext<GeneratorContextType | undefined>(undefined);

export function GeneratorProvider({ children }: { children: React.ReactNode }) {
 const [character, setCharacter] = useState<CharacterTemplate | null>(null);
 const [loading, setLoading] = useState(false);
 const [progress, setProgress] = useState(0);
 const [error, setError] = useState<string | null>(null);
 const [characterName, setCharacterName] = useState('');
 const [generatedImage, setGeneratedImage] = useState<string | null>(null);
 const [imageLoading, setImageLoading] = useState(false);
 const [selectedClients, setSelectedClients] = useState<string[]>([]);
 const [selectedFramework, _setSelectedFramework] = useState<Framework | null>(null);
 const [currentStep, setCurrentStep] = useState<Step>('initial');
 const [pixelMode, setPixelMode] = useState(false);
const [pixelatedImage, setPixelatedImage] = useState<string | null>(null);
const [isProcessing, setIsProcessing] = useState(false);
const [initialPixelMode, setInitialPixelMode] = useState<boolean | null>(null);


const setSelectedFramework = (framework: Framework | null) => {
  if (framework === 'fleek' && characterName.length < 3) {
    setError("name: Name is required, minimum of 3 characters");
    return;
  }
  _setSelectedFramework(framework);
  setError(null);
};

useEffect(() => {
  const savedData = localStorage.getItem('generatorData');
  if (savedData && currentStep !== 'complete') {
    try {
      const { 
        character: savedCharacter, 
        generatedImage: savedImage,
        pixelatedImage: savedPixelated,
        currentStep: savedStep,
        initialPixelMode: savedPixelMode,
        characterName: savedName,
        selectedFramework: savedFramework,
        selectedClients: savedClients
      } = JSON.parse(savedData);

      if (savedCharacter) setCharacter(savedCharacter);
      if (savedImage) setGeneratedImage(savedImage);
      if (savedPixelated) setPixelatedImage(savedPixelated);
      if (savedStep) setCurrentStep(savedStep as Step);
      if (savedPixelMode !== null) {
        setInitialPixelMode(savedPixelMode);
        setPixelMode(savedPixelMode);
      }
      if (savedName) setCharacterName(savedName);
      if (savedFramework) _setSelectedFramework(savedFramework);
      if (savedClients) setSelectedClients(savedClients);
    } catch (error) {
      console.error('Error loading saved data:', error);
      localStorage.removeItem('generatorData');
    }
  }
}, [currentStep]);

useEffect(() => {
  if (character || generatedImage) {
    localStorage.setItem('generatorData', JSON.stringify({
      character,
      generatedImage,
      pixelatedImage,
      currentStep,
      initialPixelMode,
      characterName,
      selectedFramework,
      selectedClients
    }));
  }
}, [character, generatedImage, pixelatedImage, currentStep, initialPixelMode, characterName, selectedFramework, selectedClients]);

const resetGenerator = () => {
  localStorage.removeItem('generatorData');
  setCharacter(null);
  setLoading(false);
  setProgress(0);
  setError(null);
  setCharacterName('');
  setGeneratedImage(null);
  setImageLoading(false);
  setSelectedClients([]);
  setSelectedFramework(null);
  setCurrentStep('initial');
  setPixelMode(false);
  setPixelatedImage(null);
  setInitialPixelMode(null);
};

 const goToStep = (step: Step) => {
   setCurrentStep(step);
 };

 const generateImage = async (char: CharacterTemplate) => {
   try {
     setImageLoading(true);
     const prompt = await createPortraitPrompt(char);
     
     const response = await fetch('/api/generate-image', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
       },
       body: JSON.stringify({ prompt }),
     });

     const data = await response.json();

     if (!response.ok || data.error) {
       throw new Error(data.error || 'Failed to generate image');
     }

     if (!data.imageUrl) {
       throw new Error('No image URL in response');
     }

     setGeneratedImage(data.imageUrl);
   } catch (error) {
     console.error('Error generating image:', error);
   } finally {
     setImageLoading(false);
   }
 };

 useEffect(() => {
  const processImage = async () => {
    console.log('ProcessImage Triggered:', {
      hasGeneratedImage: !!generatedImage,
      pixelMode,
      isProcessing
    });

    if (!generatedImage) return;

    setIsProcessing(true);
    try {
      if (pixelMode) {
        console.log('Starting pixel processing...');
        const img = new Image();
        img.src = generatedImage;
        await new Promise<void>((resolve) => {
          img.onload = () => {
            console.log('Image loaded successfully');
            resolve();
          };
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('Starting pixelation...');
        const processed = await pixelateImage(generatedImage);
        console.log('Pixelation completed');
        setPixelatedImage(processed);
      } else {
        console.log('Pixel mode off, using original image');
        setPixelatedImage(generatedImage);
      }
    } catch (error) {
      console.error('Detailed error in processImage:', error);
      setPixelatedImage(generatedImage);
    } finally {
      setIsProcessing(false);
    }
  };

  processImage();
}, [generatedImage, pixelMode]);

function componentToHex(c: number): string {
  const hex = parseInt(c.toString()).toString(16);
  return hex.length == 1 ? "0" + hex : hex;
}

function getColor(r: number, g: number, b: number, a: number): string | false {
  if (a === 0) return false;
  if (a === undefined || a === 255) return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
  return `rgba(${r},${g},${b},${a/255})`;
}

function makePathData(x: number, y: number, w: number): string {
  return `M${x} ${y}h${w}`;
}

function makePath(color: string, data: string): string {
  return `<path stroke="${color}" d="${data}" />\n`;
}

function getColors(img: ImageData) {
  const colors: Record<string, [number, number][]> = {};
  const data = img.data;
  const w = img.width;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) {
      const color = `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
      colors[color] = colors[color] || [];
      const x = (i / 4) % w;
      const y = Math.floor((i / 4) / w);
      colors[color].push([x, y]);
    }
  }
  return colors;
}

function colorsToPaths(colors: Record<string, [number, number][]>): string {
  let output = "";
  for (const [colorKey, pixels] of Object.entries(colors)) {
    const [r, g, b, a] = colorKey.split(',').map(Number);
    const color = getColor(r, g, b, a);
    if (!color) continue;

    let paths: string[] = [];
    let curPath: [number, number] | null = null;
    let w = 1;

    for (const pixel of pixels) {
      if (curPath && pixel[1] === curPath[1] && pixel[0] === (curPath[0] + w)) {
        w++;
      } else {
        if (curPath) {
          paths.push(makePathData(curPath[0], curPath[1], w));
          w = 1;
        }
        curPath = pixel;
      }
    }
    if (curPath) {
      paths.push(makePathData(curPath[0], curPath[1], w));
    }
    output += makePath(color, paths.join(''));
  }
  return output;
}

const downloadCharacter = async (format: 'json' | 'png' | 'svg') => {
  if (!character || (format === 'png' && !generatedImage)) return;
       
  try {
    if (format === 'json') {
      const { type, ...characterWithoutType } = character;
      const blob = new Blob([JSON.stringify(characterWithoutType, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else if (format === 'png') {
      const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
      const imageToUse = pixelMode ? pixelatedImage : generatedImage;
      if (!imageToUse) return;
      
      const pngBlob = await embedJsonInPng(imageToUse, character);
      const url = window.URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else if (format === 'svg') {
      const smallCanvas = document.createElement('canvas');
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCanvas.width = 64;
      smallCanvas.height = 64;
            const image = pixelMode ? pixelatedImage : generatedImage;
      if (!image) return;
      
      const img = new Image();
      img.src = image;
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
      });
      
      smallCtx.drawImage(img, 0, 0, 64, 64);
      const imageData = smallCtx.getImageData(0, 0, 64, 64);
      
      const colors = getColors(imageData);
      const paths = colorsToPaths(colors);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">\n${paths}</svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  } catch (error) {
    console.error('Download error:', error);
    setError('Failed to download character');
  }
};
 
 const generateCharacter = async () => {
  if (!characterName.trim() || !selectedFramework || !selectedClients.length) {
    setError("Please fill in all required fields");
    return;
  }
 
   setLoading(true);
   setError(null);
   setProgress(0);
   setCurrentStep('generating');
   setInitialPixelMode(pixelMode);
     
   const progressInterval = setInterval(() => {
     setProgress(prev => {
       if (prev >= 90) {
         clearInterval(progressInterval);
         return 90;
       }
       return prev + 10;
     });
   }, 500);

   try {
    let template: CharacterTemplate;
    let prompt: string;

    if (selectedFramework === 'eliza' || selectedFramework === 'fleek') {
      template = selectedFramework === 'eliza' ? 
        createElizaTemplate(characterName, selectedClients) : 
        createFleekTemplate(characterName, selectedClients);
      prompt = `Create an AI character named "${characterName}" for the ${selectedFramework} framework. The character should have a strong, consistent personality across all their attributes.

Return ONLY valid JSON matching this exact template:
${JSON.stringify(template, null, 2)}

Requirements:
1. Name: "${characterName}"
2. Bio: Array of at least 10 unique personality descriptions
3. Lore: Array of at least 10 unique backstory elements and notable facts
4. Knowledge: At least 5 areas of expertise
5. Messages: Very brief, characteristic dialogue examples
6. Posts: Social media content in their voice
7. Topics: Their areas of interest
8. Style: Consistent behavior patterns
9. Adjectives: Key personality traits`;
    } else {
      template = createZerePyTemplate(characterName, selectedClients);
      prompt = `Create an AI agent named "${characterName}" for the ZerePy framework. The agent should have a strong, consistent personality.

Return ONLY valid JSON matching this exact template:
${JSON.stringify(template, null, 2)}

Requirements:
1. Name: "${characterName}"
2. Bio: Array of strings describing personality and purpose
3. Traits: At least 4 defining characteristics
4. Examples: Sample social media posts
5. Config: Required integration settings
6. Tasks: Weighted task definitions`;
    }

     const response = await fetch('/api/generate', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         model: "claude-3-sonnet-20240229",
         max_tokens: 4096,
         messages: [{
           role: "user",
           content: prompt
         }],
         system: "You are a character generation AI with an exceptional ability to capture unique personas and their authentic communication styles. Your key focus is AUTHENTICITY in how characters express themselves..."
       })
     });

     if (!response.ok) {
       const error = await response.text();
       try {
         const errorData = JSON.parse(error);
         throw new Error(errorData.error || `API request failed: ${response.status}`);
       } catch {
         throw new Error(`API request failed: ${response.status}`);
       }
     }

     const responseText = await response.text();
     let data;
     try {
       data = JSON.parse(responseText);
     } catch (e) {
       console.error("Failed to parse response:", responseText);
       throw new Error("Invalid JSON response from API");
     }
     
     if (!data.content || data.content.length === 0) {
       throw new Error("Invalid response from API");
     }

     let generatedCharacter: CharacterTemplate;
     try {
       generatedCharacter = JSON.parse(data.content[0].text);
     } catch (e) {
       console.error('JSON Parse Error:', e);
       throw new Error("Failed to parse generated character data");
     }
     
// Validate based on framework
if (selectedFramework === 'eliza' || selectedFramework === 'fleek') {
  const char = generatedCharacter as ElizaTemplate;
  if (!Array.isArray(char.bio) || char.bio.length < (selectedFramework === 'fleek' ? 3 : 10)) {
    throw new Error(`Bio must contain at least ${selectedFramework === 'fleek' ? 3 : 10} examples`);
  }
  if (!Array.isArray(char.lore) || char.lore.length < 10) {
    throw new Error("Lore must contain at least 10 examples"); 
  }
} else {
  const zerePyChar = generatedCharacter as ZerePyTemplate;
  if (!zerePyChar.bio || zerePyChar.bio.length < 3) {
    throw new Error("Bio must contain at least 3 descriptions");
  }
  if (!zerePyChar.traits || zerePyChar.traits.length < 4) {
    throw new Error("At least 4 traits are required");
  }
}

     setCharacter(generatedCharacter);
     setProgress(100);
     console.log('Character generated successfully');
     setCurrentStep('complete');
     await generateImage(generatedCharacter);

   } catch (err: any) {
     console.error("Error:", err);
     setError(err.message || "An unexpected error occurred");
     setCurrentStep('initial');
   } finally {
     clearInterval(progressInterval);
     setLoading(false);
   }
 };

 const value = {
  character,
  loading,
  progress,
  error,
  characterName,
  setCharacterName,
  generateCharacter,
  downloadCharacter,
  generatedImage,
  imageLoading,
  selectedClients,
  setSelectedClients,
  selectedFramework,
  setSelectedFramework,
  currentStep,
  goToStep,
  FRAMEWORKS,
  CLIENTS_BY_FRAMEWORK,
  resetGenerator,
  pixelMode,
  setPixelMode,
  pixelatedImage,
  initialPixelMode
};

 return (
   <GeneratorContext.Provider value={value}>
     {children}
   </GeneratorContext.Provider>
 );
}

export function useGenerator() {
 const context = useContext(GeneratorContext);
 if (context === undefined) {
   throw new Error('useGenerator must be used within a GeneratorProvider');
 }
 return context;
}