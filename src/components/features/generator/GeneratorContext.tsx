'use client';

import React, { createContext, useContext, useState } from 'react';
import { createPortraitPrompt } from '@/utils/helpers/createPortraitPrompt';
import { Framework, FRAMEWORKS, CLIENTS_BY_FRAMEWORK, ElizaTemplate, ZerePyTemplate, CharacterTemplate, createElizaTemplate, createZerePyTemplate } from '@/types/templates';

export type Step = 'initial' | 'framework_selection' | 'client_selection' | 'generating' | 'complete';

type GeneratorContextType = {
 character: CharacterTemplate | null;
 loading: boolean;
 progress: number;
 error: string | null;
 characterName: string;
 setCharacterName: (name: string) => void;
 generateCharacter: () => Promise<void>;
 downloadCharacter: (format: 'json' | 'png') => Promise<void>;
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
 const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
 const [currentStep, setCurrentStep] = useState<Step>('initial');

 const resetGenerator = () => {
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

 const downloadCharacter = async (format: 'json' | 'png') => {
   if (!character || (format === 'png' && !generatedImage)) return;
       
   try {
     if (format === 'json') {
       const blob = new Blob([JSON.stringify(character, null, 2)], { type: 'application/json' });
       const url = window.URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.style.display = 'none';
       a.href = url;
       a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}.json`;
       document.body.appendChild(a);
       a.click();
       window.URL.revokeObjectURL(url);
       document.body.removeChild(a);
     } else if (format === 'png' && generatedImage) {
       const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
       const pngBlob = await embedJsonInPng(generatedImage, character);
       const url = window.URL.createObjectURL(pngBlob);
       const a = document.createElement('a');
       a.style.display = 'none';
       a.href = url;
       a.download = `${character.name.toLowerCase().replace(/\s+/g, '-')}.png`;
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

     if (selectedFramework === 'eliza') {
       template = createElizaTemplate(characterName, selectedClients);
       prompt = `Create an AI character named "${characterName}" for the Eliza framework. The character should have a strong, consistent personality across all their attributes.

Return ONLY valid JSON matching this exact template:
${JSON.stringify(template, null, 2)}

Requirements:
1. Name: "${characterName}"
2. Bio: At least 280 chars in third person about their personality
3. Lore: At least 280 chars of their backstory and notable facts
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
     if (selectedFramework === 'eliza') {
       const elizaChar = generatedCharacter as ElizaTemplate;
       if (!elizaChar.bio || elizaChar.bio.length < 280) {
         throw new Error("Generated bio is too short (minimum 280 characters)");
       }
       if (!elizaChar.lore || elizaChar.lore.length < 280) {
         throw new Error("Generated lore is too short (minimum 280 characters)");
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