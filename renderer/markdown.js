// ═══════════════════════════════════════════════════════════
// Banana Code Studio — Markdown Renderer
// ═══════════════════════════════════════════════════════════

import { marked } from '../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

export async function initMarkdown() {
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
  window.marked = marked;
  window.DOMPurify = DOMPurify;
}

/**
 * Render markdown text to sanitized HTML with syntax highlighting
 */
export function renderMarkdown(text) {
  if (!text) return '';
  if (!marked) {
    // Fallback if not initialized yet
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  let html = marked(text);

  // Add code block headers with copy buttons and language labels
  html = html.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (match, lang, code) => {
      let highlighted = code;
      if (window.hljs) {
        try {
          highlighted = window.hljs.highlight(decodeHtmlEntities(code), { language: lang, ignoreIllegals: true }).value;
        } catch (e) {
          // If language not found, try auto-detection
          try {
            highlighted = window.hljs.highlightAuto(decodeHtmlEntities(code)).value;
          } catch (e2) {}
        }
      }
      return `<pre><div class="code-header"><span>${lang}</span><button class="copy-btn" onclick="copyCode(this)">📋 Copy</button></div><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    }
  );

  // Handle code blocks without language specification
  html = html.replace(
    /<pre><code>([\s\S]*?)<\/code><\/pre>/g,
    (match, code) => {
      let highlighted = code;
      if (window.hljs) {
        try {
          const result = window.hljs.highlightAuto(decodeHtmlEntities(code));
          highlighted = result.value;
        } catch (e) {}
      }
      return `<pre><div class="code-header"><span>code</span><button class="copy-btn" onclick="copyCode(this)">📋 Copy</button></div><code class="hljs">${highlighted}</code></pre>`;
    }
  );

  // Sanitize
  if (DOMPurify) {
    html = DOMPurify.sanitize(html, {
      ADD_TAGS: ['button'],
      ADD_ATTR: ['onclick', 'class'],
    });
  }

  return html;
}

/**
 * Render streaming markdown — incrementally updates an element
 */
export function renderStreamingMarkdown(element, fullText) {
  const html = renderMarkdown(fullText);
  element.innerHTML = html + '<span class="streaming-cursor">▋</span>';
  return element;
}

/**
 * Finalize a streamed message — remove cursor, do final render
 */
export function finalizeMarkdown(element, fullText) {
  element.innerHTML = renderMarkdown(fullText);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

// Global copy function for code blocks
window.copyCode = function(btn) {
  const codeBlock = btn.closest('pre').querySelector('code');
  const text = codeBlock.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
};
