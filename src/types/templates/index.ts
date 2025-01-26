// Constants for models and providers
const ELIZA_PROVIDERS = ["openai", "eternalai", "anthropic", "grok", "groq", "llama_cloud", "together", "llama_local", "google", "claude_vertex"];
const VOICE_MODELS = ["en_US-ryan-medium", "en_US-amy-medium", "en_GB-jenny_dioco-medium"];
const ZEREPY_LLM_OPTIONS = [
 {
   name: "openai",
   model: "gpt-3.5-turbo"
 },
 {
   name: "anthropic",
   model: "claude-3-5-sonnet-20241022"
 }
];

// Types
export type ElizaTemplate = {
 type: 'eliza';
 name: string;
 plugins: string[];
 clients: string[];
 modelProvider: string;
 settings: {
   voice: { model: string; }
 };
 bio: string;
 lore: string;
 knowledge: string[];
 messageExamples: Array<{
   user: string;
   content: { text: string; }
 }>[];
 postExamples: string[];
 topics: string[];
 style: {
   all: string[];
   chat: string[];
   post: string[];
 };
 adjectives: string[];
}

export type ZerePyTemplate = {
 type: 'zerepy';
 name: string;
 bio: string[];
 traits: string[];
 examples: string[];
 example_accounts: string[];
 loop_delay: number;
 config: Array<{
   name: string;
   [key: string]: any;
 }>;
 tasks: Array<{
   name: string;
   weight: number;
 }>;
 use_time_based_weights: boolean;
 time_based_multipliers: {
   tweet_night_multiplier: number;
   engagement_day_multiplier: number;
 };
}

export type CharacterTemplate = ElizaTemplate | ZerePyTemplate;

export const FRAMEWORKS = ['eliza', 'zerepy'] as const;
export type Framework = typeof FRAMEWORKS[number];

export const CLIENTS_BY_FRAMEWORK: Record<Framework, string[]> = {
 eliza: ["discord", "direct", "twitter", "telegram", "farcaster", "lens", "auto", "slack"],
 zerepy: ["twitter", "farcaster"]
};

export const createElizaTemplate = (name: string, clients: string[]): ElizaTemplate => ({
 type: 'eliza',
 name,
 plugins: [],
 clients,
 modelProvider: ELIZA_PROVIDERS[Math.floor(Math.random() * ELIZA_PROVIDERS.length)],
 settings: { 
   voice: { 
     model: VOICE_MODELS[Math.floor(Math.random() * VOICE_MODELS.length)]
   } 
 },
 bio: "",
 lore: "",
 knowledge: Array(5).fill(""),
 messageExamples: Array(3).fill([
   { user: "{{user1}}", content: { text: "" } },
   { user: name, content: { text: "" } }
 ]),
 postExamples: Array(5).fill(""),
 topics: Array(10).fill(""),
 style: {
   all: Array(5).fill(""),
   chat: Array(5).fill(""),
   post: Array(5).fill("")
 },
 adjectives: Array(5).fill("")
});

export const createZerePyTemplate = (name: string, clients: string[]): ZerePyTemplate => ({
 type: 'zerepy',
 name,
 bio: Array(3).fill(""),
 traits: Array(4).fill(""),
 examples: Array(2).fill(""),
 example_accounts: [],
 loop_delay: 900,
 config: [
   ...clients.map(client => ({
     name: client,
     ...(client === "twitter" && {
       timeline_read_count: 10,
       own_tweet_replies_count: 2,
       tweet_interval: 5400
     }),
     ...(client === "farcaster" && {
       timeline_read_count: 10,
       cast_interval: 60
     })
   })),
   ZEREPY_LLM_OPTIONS[Math.floor(Math.random() * ZEREPY_LLM_OPTIONS.length)]
 ],
 tasks: [
   { name: "post-tweet", weight: 1 },
   { name: "reply-to-tweet", weight: 1 },
   { name: "like-tweet", weight: 1 }
 ],
 use_time_based_weights: false,
 time_based_multipliers: {
   tweet_night_multiplier: 0.4,
   engagement_day_multiplier: 1.5
 }
});