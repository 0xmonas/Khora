export interface ApiErrorResponse {
  error: string;
  field?: string;
}

export interface GeneratePromptApiResponse {
  prompt: string;
}

export interface GenerateImageApiResponse {
  image: string; // base64 data URI
}
