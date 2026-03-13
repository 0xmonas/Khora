/**
 * Sanitize user input before inserting into AI prompts.
 * Strips control characters, null bytes, newlines, and prompt injection patterns.
 */
export function sanitizeForPrompt(input: string): string {
  return input
    // Remove null bytes and ALL control characters including newline/tab
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Collapse excessive whitespace
    .replace(/\s{2,}/g, ' ')
    // Strip common prompt injection delimiters
    .replace(/```/g, '')
    .replace(/<\/?system>/gi, '')
    .replace(/<\/?user>/gi, '')
    .replace(/<\/?assistant>/gi, '')
    // Strip XML/HTML-like tags that could be used for injection
    .replace(/<\/?[a-z][a-z0-9_-]*>/gi, '')
    .trim();
}
