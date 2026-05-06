// ═══════════════════════════════════════════════════════════
// Banana Code Studio — Setup Wizard Logic
// ═══════════════════════════════════════════════════════════

import { PROVIDERS, PROVIDER_MODELS, providerLogoHtml } from './constants.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentStep = 'welcome';
let testedUrl = '';
let testedToken = '';
let testWs = null;
let needsProviderSetup = false;
let selectedProvider = null;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Step Navigation ──
function goToStep(stepId) {
  $$('.setup-step').forEach(s => s.classList.remove('active'));
  $(`#step-${stepId}`).classList.add('active');
  currentStep = stepId;
}

// ── Auto-detect token ──
async function tryAutoDetectToken() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const tokenData = await window.studioAPI.readTokenFile();
      if (tokenData && tokenData.token) {
        $('#api-token').value = tokenData.token;
        $('#auto-token-info').style.display = 'block';
        return;
      }
    } catch (e) {
      // Token not available yet, user can still enter it manually
    }

    await sleep(500);
  }
}

// ── Test Connection ──
function testConnection() {
  const url = $('#server-url').value.trim();
  const token = $('#api-token').value.trim();

  if (!url || !token) {
    showTestResult('error', 'Please fill in both Server URL and API Token.');
    return;
  }

  showTestResult('loading', '⏳ Connecting...');
  $('#btn-test-connection').disabled = true;

  if (testWs) {
    testWs.onclose = null;
    testWs.onerror = null;
    try { testWs.close(); } catch (e) {}
  }

  const timeout = setTimeout(() => {
    showTestResult('error', '✗ Connection timed out. Is the server running?');
    $('#btn-test-connection').disabled = false;
    try { testWs.close(); } catch (e) {}
  }, 8000);

  try {
    testWs = new WebSocket(url);
  } catch (e) {
    clearTimeout(timeout);
    showTestResult('error', `✗ Invalid URL: ${e.message}`);
    $('#btn-test-connection').disabled = false;
    return;
  }

  testWs.onopen = () => {
    testWs.send(JSON.stringify({ type: 'auth', token }));
  };

  testWs.onmessage = (event) => {
    clearTimeout(timeout);
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'auth_success') {
        testedUrl = url;
        testedToken = token;
        showTestResult('success', '✓ Connected and authenticated successfully!');
        $('#btn-continue-connect').disabled = false;
        // Check if server needs provider setup
        checkServerConfig(url, token);
      } else if (data.type === 'error') {
        showTestResult('error', `✗ ${data.message}`);
      }
    } catch (e) {
      showTestResult('error', '✗ Invalid response from server.');
    }
    $('#btn-test-connection').disabled = false;
  };

  testWs.onerror = () => {
    clearTimeout(timeout);
    showTestResult('error', '✗ Connection failed. Check the URL and ensure the server is running.');
    $('#btn-test-connection').disabled = false;
  };

  testWs.onclose = (e) => {
    clearTimeout(timeout);
    if (e.code === 1008) {
      showTestResult('error', '✗ Authentication failed. Check your token.');
      $('#btn-test-connection').disabled = false;
    }
  };
}

async function checkServerConfig(wsUrl, token) {
  try {
    // Derive HTTP URL from WebSocket URL
    const httpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/config?token=${token}`);
    const config = await res.json();
    needsProviderSetup = config.isInitialApiSetup === true;
  } catch (e) {
    console.log('Could not check server config:', e);
    needsProviderSetup = false;
  }
}

function showTestResult(type, message) {
  const container = $('#test-result-container');
  container.innerHTML = `<div class="test-result ${type}">${message}</div>`;
}

// ── Provider Selection ──
function renderProviderGrid() {
  const grid = $('#provider-grid');
  grid.innerHTML = PROVIDERS.map(p =>
    `<div class="provider-card" data-provider="${p.id}">
      ${providerLogoHtml(p, 'provider-logo provider-logo-card')}
      <span class="provider-name">${p.name}</span>
    </div>`
  ).join('');

  grid.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedProvider = card.dataset.provider;
      renderProviderForm(selectedProvider);
      $('#btn-save-provider').disabled = false;
    });
  });
}

function renderProviderForm(providerId) {
  const container = $('#provider-form-container');
  container.style.display = 'block';

  const provider = PROVIDERS.find(p => p.id === providerId);
  const models = PROVIDER_MODELS[providerId] || [];
  let html = '';

  // API Key field (for providers that need it)
  if (provider.needsKey) {
    const keyLabel = providerId === 'ollama_cloud' ? 'Ollama API Key' :
                     providerId === 'openrouter' ? 'OpenRouter API Key' :
                     providerId === 'mistral' ? 'Mistral API Key' :
                     providerId === 'deepseek' ? 'DeepSeek API Key' :
                     providerId === 'kimi' ? 'Moonshot API Key' :
                     'API Key';
    html += `
      <div class="setup-field">
        <label for="provider-key">${keyLabel}</label>
        <div class="password-wrapper">
          <input type="password" id="provider-key" placeholder="Enter your API key">
          <button class="password-toggle" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'" type="button">👁️</button>
        </div>
      </div>`;
  }
  
  if (provider.needsOAuth) {
    html += `
      <div class="setup-field">
        <label>Authentication</label>
        <button type="button" id="btn-codex-login-setup" class="btn-setup" style="background:#10a37f;color:#fff;border:none;">Sign in with ChatGPT (Codex)</button>
        <p id="codex-login-status-setup" style="font-size:12px;margin-top:4px;color:var(--text-muted);"></p>
      </div>`;
  }

  // Model selector
  if (models.length > 0) {
    html += `
      <div class="setup-field">
        <label for="provider-model">Model</label>
        <select id="provider-model" style="width:100%;padding:11px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-ui);font-size:14px;outline:none;">
          ${models.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
        </select>
      </div>`;
  } else if (providerId === 'openrouter') {
    html += `
      <div class="setup-field">
        <label for="provider-model">Model ID</label>
        <input type="text" id="provider-model-text" placeholder="e.g. nvidia/nemotron-3-super-120b-a12b:free">
        <p class="setup-help">Enter the exact OpenRouter model ID. Browse models at <code>openrouter.ai/models</code></p>
      </div>`;
  } else if (providerId === 'ollama') {
    html += `
      <div class="setup-field">
        <label>Local Models</label>
        <button class="btn-setup" id="btn-detect-ollama" style="font-size:13px;padding:8px 16px;" type="button">🔍 Detect Models</button>
        <select id="provider-model" style="display:none;width:100%;padding:11px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-ui);font-size:14px;outline:none;margin-top:8px;"></select>
      </div>`;
  } else if (providerId === 'lmstudio') {
    html += `
      <div class="setup-field">
        <label for="lmstudio-url">Base URL</label>
        <input type="text" id="lmstudio-url" value="http://localhost:1234/v1" placeholder="http://localhost:1234/v1">
      </div>
      <div class="setup-field">
        <label>Models</label>
        <button class="btn-setup" id="btn-detect-lmstudio" style="font-size:13px;padding:8px 16px;" type="button">🔍 Detect Models</button>
        <select id="provider-model" style="display:none;width:100%;padding:11px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-ui);font-size:14px;outline:none;margin-top:8px;"></select>
      </div>`;
  }

  // Claude-specific options
  if (providerId === 'claude') {
    html += `
      <div class="setup-field">
        <label>Prompt Caching</label>
        <select id="provider-cache" style="width:100%;padding:11px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-primary);font-family:var(--font-ui);font-size:14px;outline:none;">
          <option value="false">5 Minutes (Default — Cheaper)</option>
          <option value="true">1 Hour (Better for long sessions)</option>
        </select>
      </div>`;
  }

  container.innerHTML = html;

  // Attach detect handlers
  if (providerId === 'ollama') {
    container.querySelector('#btn-detect-ollama')?.addEventListener('click', detectOllamaModels);
  }
  if (providerId === 'lmstudio') {
    container.querySelector('#btn-detect-lmstudio')?.addEventListener('click', detectLMStudioModels);
  }
  
  // Attach OAuth login handler
  if (provider.needsOAuth) {
    const loginBtn = container.querySelector('#btn-codex-login-setup');
    const statusTxt = container.querySelector('#codex-login-status-setup');
    if (loginBtn && testWs && testWs.readyState === WebSocket.OPEN) {
      loginBtn.addEventListener('click', () => {
        statusTxt.textContent = 'Requesting login...';
        testWs.send(JSON.stringify({ type: 'trigger_codex_login' }));
        
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'codex_login_started') {
            statusTxt.textContent = '⏳ Waiting for browser login...';
          } else if (data.type === 'codex_login_finished') {
            if (data.success) {
              statusTxt.textContent = '✓ Logged in successfully';
              showToast('success', 'Codex login successful!');
            } else {
              statusTxt.textContent = '✗ Login failed: ' + data.error;
              showToast('error', 'Login failed');
            }
            testWs.removeEventListener('message', handler);
          }
        };
        testWs.addEventListener('message', handler);
      });
    }
  }
}

async function detectOllamaModels() {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    const data = await res.json();
    const select = $('#provider-model');
    select.style.display = 'block';
    select.innerHTML = data.models.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
    if (data.models.length === 0) {
      showToast('warning', 'No models found. Pull a model with `ollama pull <model>`.');
    }
  } catch (e) {
    showToast('error', 'Could not connect to Ollama at localhost:11434');
  }
}

async function detectLMStudioModels() {
  const baseUrl = $('#lmstudio-url')?.value || 'http://localhost:1234/v1';
  try {
    const res = await fetch(`${baseUrl}/models`);
    const data = await res.json();
    const select = $('#provider-model');
    select.style.display = 'block';
    select.innerHTML = data.data.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
    if (data.data.length === 0) {
      showToast('warning', 'No models found. Load a model in LM Studio first.');
    }
  } catch (e) {
    showToast('error', `Could not connect to LM Studio at ${baseUrl}`);
  }
}

// ── Save Provider Config via WebSocket ──
function saveProviderConfig() {
  if (!selectedProvider) return;

  const config = { provider: selectedProvider };
  
  if (selectedProvider === 'openai_oauth') {
    config.provider = 'openai';
    config.authType = 'oauth';
  } else if (selectedProvider === 'openai') {
    config.authType = 'api_key';
  }

  // API Key
  const keyInput = $('#provider-key');
  if (keyInput) {
    config.apiKey = keyInput.value.trim();
    if (config.apiKey) localStorage.setItem(`apikey_${selectedProvider}`, config.apiKey);
  }

  // Model
  const modelSelect = $('#provider-model');
  const modelText = $('#provider-model-text');
  if (modelSelect && modelSelect.style.display !== 'none') {
    config.model = modelSelect.value;
  } else if (modelText) {
    config.model = modelText.value.trim();
  }

  // LM Studio URL
  const lmUrl = $('#lmstudio-url');
  if (lmUrl) config.lmStudioBaseUrl = lmUrl.value.trim();

  // Claude cache
  const cacheSelect = $('#provider-cache');
  if (cacheSelect) config.useExtendedCache = cacheSelect.value === 'true';

  // Send via WebSocket
  if (testWs && testWs.readyState === WebSocket.OPEN) {
    testWs.send(JSON.stringify({ type: 'update_config', config, save: true }));

    testWs.addEventListener('message', function handler(event) {
      const data = JSON.parse(event.data);
      if (data.type === 'config_updated') {
        testWs.removeEventListener('message', handler);
        goToStep('done');
      }
    });
  } else {
    // If WS disconnected, just proceed
    goToStep('done');
  }
}

// ── Finish Setup ──
async function finishSetup() {
  await window.studioAPI.writeStudioConfig({
    serverUrl: testedUrl,
    token: testedToken,
  });

  // Close test websocket
  if (testWs) {
    testWs.onclose = null;
    try { testWs.close(); } catch (e) {}
  }

  // Navigate to main app
  const { ipcRenderer } = window.studioAPI;
  // Use IPC to tell main process to load index.html
  // We exposed this via preload
  try {
    // Fallback: reload the window, main.js will see config exists and load index.html
    window.location.href = 'index.html';
  } catch (e) {
    window.location.reload();
  }
}

// ── Toast ──
function showToast(type, message) {
  const container = $('#toast-container');
  const icons = { success: '✓', error: '✗', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

// ── Event Listeners ──
document.addEventListener('DOMContentLoaded', () => {
  // Step 1: Welcome
  $('#btn-get-started').addEventListener('click', () => {
    goToStep('connection');
    tryAutoDetectToken();
  });

  // Step 2: Connection
  $('#toggle-token').addEventListener('click', () => {
    const input = $('#api-token');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('#btn-test-connection').addEventListener('click', testConnection);

  $('#btn-continue-connect').addEventListener('click', () => {
    if (needsProviderSetup) {
      renderProviderGrid();
      goToStep('provider');
    } else {
      goToStep('done');
    }
  });

  // Step 3: Provider
  $('#btn-save-provider').addEventListener('click', saveProviderConfig);

  // Step 4: Done
  $('#btn-open-studio').addEventListener('click', finishSetup);
});
