export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface GenerateCharacterResponse {
  character: {
    name: string;
    bio: string;
    lore: string;
    traits: string[];
  };
}

export interface GenerateImageResponse {
  imageUrl: string;
}

export interface GeneratePromptResponse {
  prompt: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}