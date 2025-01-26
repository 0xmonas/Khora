export interface GenerateCharacterRequest {
  name: string;
  prompt?: string;
  clients: string[];
}

export interface GenerateImageRequest {
  prompt: string;
}

export interface GeneratePromptRequest {
  character: {
    name: string;
    description: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}