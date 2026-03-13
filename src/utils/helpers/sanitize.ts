/**
 * Sanitize user input before inserting into AI prompts.
 * Strips control characters, null bytes, and prompt injection patterns.
 */
export function sanitizeForPrompt(input: string): string {
  return input
    // Remove null bytes and control characters (except newline, tab)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Collapse excessive whitespace
    .replace(/\s{10,}/g, ' ')
    // Strip common prompt injection delimiters
    .replace(/```/g, '')
    .replace(/<\/?system>/gi, '')
    .replace(/<\/?user>/gi, '')
    .replace(/<\/?assistant>/gi, '')
    .trim();
}
