import DOMPurify from 'dompurify';

/**
 * Sanitize an HTML string to prevent XSS attacks.
 *
 * Use this wrapper for every innerHTML assignment that contains user-generated,
 * AI-generated, or remote (markdown / API) content.
 *
 * @param {string} html - The potentially untrusted HTML string
 * @returns {string} - The sanitized HTML string safe for innerHTML assignment
 */
export const sanitize = html => DOMPurify.sanitize(html ?? '', { USE_PROFILES: { html: true } });
