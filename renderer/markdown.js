// ═══════════════════════════════════════════════════════════
// Banana Code Studio — Markdown Renderer
// ═══════════════════════════════════════════════════════════

let marked, hljs, DOMPurify;

export async function initMarkdown() {
  // Load dependencies from node_modules
  const markedMod = await import('../node_modules/marked/lib/marked.esm.js');
  marked = markedMod.marked;

  // highlight.js and DOMPurify need to be loaded via script tags since they
  // don't always play nice with ESM in Electron renderer
  await loadScript('../node_modules/highlight.js/lib/index.js');
  await loadScript('../node_modules/dompurify/dist/purify.min.js');

  hljs = window.hljs;
  DOMPurify = window.DOMPurify;

  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
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
      if (hljs) {
        try {
          highlighted = hljs.highlight(decodeHtmlEntities(code), { language: lang, ignoreIllegals: true }).value;
        } catch (e) {
          // If language not found, try auto-detection
          try {
            highlighted = hljs.highlightAuto(decodeHtmlEntities(code)).value;
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
      if (hljs) {
        try {
          const result = hljs.highlightAuto(decodeHtmlEntities(code));
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
