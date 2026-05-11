// Redis key namespace for Writers Room. All keys flow through these helpers
// so renames stay safe and audits stay easy.

export const WR = {
  // Timestamp (ms) when the 30-day community cycle was kicked off. Lazy-set on
  // first state read after deploy. Day 1 voting window = cycleStartedAt + 24h.
  cycleStartedAt: 'writers-room:cycle:started-at',
  currentDay: 'writers-room:day:current',
  day: (n: number) => `writers-room:day:${n}`,
  dayState: (n: number) => `writers-room:day:${n}:state`,
  // ZSET, score = like count, member = submission id
  submissions: (n: number) => `writers-room:submissions:${n}`,
  submission: (id: string) => `writers-room:submission:${id}`,
  // SET of lowercase addresses that liked this submission
  voters: (id: string) => `writers-room:submission:${id}:voters`,
  // SET of submission ids the address liked for day n
  voteIndex: (address: string, n: number) =>
    `writers-room:vote:${address.toLowerCase()}:${n}`,
  // 1-per-day-per-address submission rate limit
  submitOnce: (address: string, n: number) =>
    `writers-room:submit-once:${address.toLowerCase()}:${n}`,
  // Leaderboards (rolling 30 day total). ZSET, score = count, member = address.
  leaderboardContributions: 'writers-room:leaderboard:contributions',
  leaderboardLikes: 'writers-room:leaderboard:likes',
  // Random seed for reproducible tie-break audits
  publishLog: (n: number) => `writers-room:publish-log:${n}`,
};
