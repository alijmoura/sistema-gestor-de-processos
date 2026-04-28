/**
 * @file sanitization.js
 * @description Utilitarios centralizados de sanitizacao para renderizacao segura no DOM.
 */

const HTML_ESCAPE_MAP = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * Escapa caracteres perigosos para uso em HTML.
 * @param {any} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitiza valor para atributos HTML entre aspas.
 * @param {any} value
 * @returns {string}
 */
export function sanitizeAttribute(value) {
  return escapeHtml(value);
}

/**
 * Gera fragmento seguro para IDs no DOM.
 * @param {any} value
 * @param {string} prefix
 * @returns {string}
 */
export function sanitizeDomId(value, prefix = "id") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized ? `${prefix}-${normalized}` : `${prefix}-fallback`;
}

const sanitization = {
  escapeHtml,
  sanitizeAttribute,
  sanitizeDomId,
};

if (typeof window !== "undefined") {
  window.sanitization = sanitization;
}

export default sanitization;
