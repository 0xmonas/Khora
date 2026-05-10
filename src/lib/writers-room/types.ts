// Writers Room — collaborative 30-day comic
// Day 1 op-seeded text intro; Day 2..30 holder submissions with 24h voting.

export const WRITERS_ROOM_TOTAL_DAYS = 30;
export const WRITERS_ROOM_VOTING_WINDOW_MS = 24 * 60 * 60 * 1000;

export const CAPTION_MAX = 200;
export const DESCRIPTION_MAX = 800;
export const PROMPT_MAX = 800;
export const TOKEN_ID_MAX = 3332;
export const MAX_TOKEN_TAGS_PER_SUBMISSION = 5;

export type DayState = 'voting' | 'closed' | 'published';

export interface DayEntry {
  dayNumber: number;
  caption: string;
  description: string;
  // Day 1 has no image (text-only intro). Subsequent days op-managed.
  tokenId: number | null;
  imageUrl: string | null;
  // null for Day 1 (op-seeded). For Day 2+ this is the winning submitter.
  submitterAddress: string | null;
  publishedAt: number;
  // Voting window for the NEXT day's submissions starts when this day publishes.
  votingClosesAt: number;
  winnerSubmissionId: string | null;
}

export interface Submission {
  id: string;
  dayNumber: number;
  submitterAddress: string;
  caption: string;
  description: string;
  prompt: string;
  // Token tags extracted from the description (#NUMBER syntax). Empty array
  // is allowed — the holder may pitch a story beat without naming a BOOA.
  tokenIds: number[];
  submittedAt: number;
  voteCount: number;
  status: 'active' | 'winner' | 'expired';
}

export interface WritersRoomState {
  currentDay: number;
  totalDays: number;
  publishedDay: DayEntry | null;
  votingClosesAt: number | null;
  votingOpen: boolean;
  submissionsOpenForDay: number | null;
}

export interface LeaderboardRow {
  address: string;
  contributions: number;
  totalLikesReceived: number;
}

export interface LeaderboardResponse {
  topContributions: LeaderboardRow[];
  topLikes: LeaderboardRow[];
}
