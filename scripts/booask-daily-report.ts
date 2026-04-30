// Print BOOASK daily metrics report to stdout.
//
// Usage:
//   npx tsx scripts/booask-daily-report.ts            # today UTC
//   npx tsx scripts/booask-daily-report.ts 2026-04-30 # specific day
//
// Reads from production Redis. Run from repo root with .env loaded:
//   set -a && source .env && set +a && npx tsx scripts/booask-daily-report.ts

import { getBooaskDailyReport } from '../src/lib/booask/metrics';

async function main() {
  const day = process.argv[2];
  const report = await getBooaskDailyReport(day);

  console.log('═══════════════════════════════════════════════');
  console.log(`BOOASK daily report — ${report.day} UTC`);
  console.log('═══════════════════════════════════════════════');
  console.log(`Total requests:     ${report.requests}`);
  console.log(`Approx unique IPs:  ${report.uniqueIPs}`);
  console.log(`BYOK requests:      ${report.byokRequests}  (excluded from cost)`);
  console.log(`Free-tier requests: ${report.requests - report.byokRequests}`);
  console.log('');
  console.log('Token usage (free tier only):');
  console.log(`  Input tokens:  ${report.inputTokens.toLocaleString()}`);
  console.log(`  Output tokens: ${report.outputTokens.toLocaleString()}`);
  console.log(`  Tool calls:    ${report.toolCalls}`);
  console.log('');
  console.log(`Cost (Gemini 2.5 Flash Lite): $${report.costUSD.toFixed(4)} USD`);
  console.log('');
  if (Object.keys(report.errors).length) {
    console.log('Errors / blocked:');
    for (const [kind, count] of Object.entries(report.errors)) {
      console.log(`  ${kind.padEnd(20)} ${count}`);
    }
  } else {
    console.log('Errors / blocked: none');
  }
  console.log('═══════════════════════════════════════════════');

  // Also print as JSON on the last line for easy parsing.
  console.log(JSON.stringify(report));
}

main().catch((e) => {
  console.error('Failed to fetch report:', e);
  process.exit(1);
});
