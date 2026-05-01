/**
 * Strip control characters and trim. For plain-text fields like bio and chat
 * messages we never want to allow HTML, so the safest move is to escape the
 * five characters that are special in HTML at the boundary.
 *
 * Frontend should still render these as text (not innerHTML), but escaping
 * here is defense-in-depth: a UI mistake one day shouldn't become an XSS hole.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalize plain-text user input: strip non-printable control chars, trim,
 * and escape HTML special characters. Use at the boundary where free-form
 * user text enters the system (bio, chat messages).
 */
export function sanitizePlainText(input: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return escapeHtml(stripped.trim());
}
