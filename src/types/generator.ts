export interface CharacterAppearance {
    gender?: string;
    age?: number | string;
    hair?: string;
    eyes?: string;
    skin?: string;
    distinguishingFeatures?: string;
    clothing?: string;
}

export interface CharacterPersonality {
    mood?: string;
    attitude?: string;
}

export interface CharacterTemplate {
    name: string;
    plugins: string[];
    clients: string[];
    modelProvider: string;
    settings: {
        voice: {
            model: string;
        };
    };
    bio: string;
    lore: string;
    knowledge: string[];
    messageExamples: {
        user: string;
        content: {
            text: string;
        };
    }[][];
    postExamples: string[];
    topics: string[];
    style: {
        all: string[];
        chat: string[];
        post: string[];
    };
    adjectives: string[];
}

export interface Character extends CharacterTemplate {
    appearance?: CharacterAppearance;
    personality?: CharacterPersonality;
}

export interface GeneratorContextType {
    character: Character | null;
    loading: boolean;
    progress: number;
    error: string | null;
    characterName: string;
    setCharacterName: (name: string) => void;
    generateCharacter: () => Promise<void>;
    downloadCharacter: (format: 'json' | 'svg' | 'png') => Promise<void>;
    generatedImage: string | null;
    imageLoading: boolean;
    selectedClients: string[];
    setSelectedClients: (clients: string[]) => void;
    showClientSelector: boolean;
    setShowClientSelector: (show: boolean) => void;
    AVAILABLE_CLIENTS: string[];
}