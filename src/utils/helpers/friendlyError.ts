/** Maps raw error messages to user-friendly messages */
export function friendlyError(raw: string): string {
  console.warn('[friendlyError] raw:', raw);
  const lower = raw.toLowerCase();

  // Rate limiting / quota
  if (lower.includes('too many requests') || lower.includes('429'))
    return 'You\'re going too fast! Please wait a moment and try again.';
  if (lower.includes('generation limit') || lower.includes('quota'))
    return 'You\'ve reached your generation limit for this session. Mint your current agent to unlock more.';

  // Auth
  if (lower.includes('authentication required') || lower.includes('sign in'))
    return 'Please connect and sign in with your wallet to continue.';
  if (lower.includes('wallet not connected'))
    return 'Your wallet is not connected. Please connect your wallet and try again.';

  // Wallet rejections
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request'))
    return 'Transaction cancelled — no worries, nothing was charged.';

  // Network / RPC — only match very specific network errors
  if (lower.includes('network request failed') || lower.includes('wrong network') || lower.includes('chain mismatch'))
    return 'Network issue — please check your connection and make sure you\'re on the right network.';
  if (lower.includes('insufficient funds') || lower.includes('insufficient balance'))
    return 'Not enough ETH in your wallet for this transaction.';
  if (lower.includes('nonce too'))
    return 'Transaction conflict — please reset your wallet\'s pending transactions and try again.';

  // Contract errors
  if (lower.includes('mintingpaused') || lower.includes('minting is paused'))
    return 'Minting is currently paused. Please check back soon!';
  if (lower.includes('signatureexpired') || lower.includes('expired'))
    return 'Your session expired. Please try minting again.';
  if (lower.includes('mintlimitreached') || lower.includes('mint limit'))
    return 'You\'ve reached the maximum mints per wallet.';
  if (lower.includes('maxsupplyreached') || lower.includes('max supply'))
    return 'All agents have been minted — the collection is complete!';
  if (lower.includes('invalidsignature') || lower.includes('invalid sig'))
    return 'Signature verification failed. Please try again.';
  if (lower.includes('signaturealreadyused'))
    return 'This mint session was already used. Please generate a new agent.';

  // AI generation
  if (lower.includes('no agent response') || lower.includes('no image generated') || lower.includes('incomplete agent'))
    return 'AI had a hiccup generating your agent. Please try again — each attempt is unique!';
  if (lower.includes('failed to generate'))
    return 'Something went wrong during generation. Please try again in a moment.';

  // Server errors
  if (lower.includes('server error') || lower.includes('502') || lower.includes('503'))
    return 'Our servers are having a moment. Please try again shortly.';
  if (lower.includes('load failed') || lower.includes('failed to fetch'))
    return 'Could not reach the server. Please check your internet connection and try again.';

  // Registration
  if (lower.includes('missing mint data'))
    return 'Mint data not found — please mint your agent first before registering.';
  if (lower.includes('could not find registered event'))
    return 'Registration transaction succeeded but confirmation is pending. Check your wallet for details.';

  // Transaction
  if (lower.includes('execution reverted') || lower.includes('reverted'))
    return 'Transaction reverted on-chain. Please try again.';
  if (lower.includes('transaction failed'))
    return 'Transaction failed on-chain. This can happen if conditions changed — please try again.';
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'Request timed out. The network might be congested — please try again.';

  // Download
  if (lower.includes('failed to download'))
    return 'Download failed. Please try again.';

  // Fallback — if it's a long technical message, summarize it
  if (raw.length > 200)
    return 'Something unexpected happened. Please try again.';

  return raw;
}
