// ═══════════════════════════════════════════════════════════
// Banana Code Studio — Main App (Part: Core + Init + Connection)
// ═══════════════════════════════════════════════════════════

import { WSClient } from './ws-client.js';
import { PROVIDERS, PROVIDER_MODELS, PERMISSION_MODES, OPERATING_MODES, REASONING_LEVELS, providerLogoHtml, iconHtml } from './constants.js';
import { marked } from '../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../node_modules/dompurify/dist/purify.es.mjs';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const RECENT_WORKSPACES_KEY = 'recentWorkspaces';
const SESSION_WORKSPACES_KEY = 'sessionWorkspaces';
const COLLAPSED_PROJECTS_KEY = 'collapsedProjects';
const MAX_RECENT_WORKSPACES = 8;
const DEFAULT_IMAGEGEN_BASE_URL = 'http://127.0.0.1:8000';
const VOICE_MODELS = [
  { value: 'whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo' },
  { value: 'whisper-large-v3', label: 'Whisper Large V3' },
];

window.marked = marked;
window.DOMPurify = DOMPurify;
marked.setOptions({ breaks: true, gfm: true });

// ── App State ──
const state = {
  ws: new WSClient(),
  config: null,       // studio-config { serverUrl, token }
  serverConfig: null,  // from config_updated
  currentSessionId: null,
  workspacePath: null,
  isStreaming: false,
  streamingText: '',
  streamingEl: null,
  permissionQueue: [],
  currentPermission: null,
  permMode: 'guard',   // yolo | guard | manual
  currentProvider: 'gemini',
  currentModel: 'gemini-2.5-flash',
  operatingMode: 'agent',
  sessions: [],
  attachments: [],
  voiceRecorder: null,
  isVoiceRecording: false,
  isVoiceTranscribing: false,
  homePath: null,
  pendingWorkspacePath: null,
  platform: null,
  contextInfo: null,
  permissions: [],
  betaFeatures: [],
  imageGenModels: null,
  imageGenCards: new Map(),
  renderedImageGenRequestIds: new Set(),
};

// ── Init ──
async function init() {
  state.config = await window.studioAPI.readStudioConfig();
  if (!state.config) {
    window.location.href = 'setup.html';
    return;
  }

  state.homePath = await window.studioAPI.getHomePath();
  state.platform = await window.studioAPI.getPlatform();
  document.body.dataset.platform = state.platform;
  setupTitlebar();
  setupSidebar();
  setupInput();
  setupDropdowns();
  setupToolbar();
  setupSettings();
  setupPermissionModal();
  connectWebSocket();
}

// ── Titlebar ──
function setupTitlebar() {
  $('#btn-close')?.addEventListener('click', () => window.studioAPI.closeWindow());
  $('#btn-minimize')?.addEventListener('click', () => window.studioAPI.minimizeWindow());
  $('#btn-maximize')?.addEventListener('click', () => window.studioAPI.maximizeWindow());
}

// ── WebSocket Connection ──
function connectWebSocket() {
  const ws = state.ws;

  ws.on('stateChange', (s) => {
    const badge = $('#connection-badge');
    const label = $('#connection-label');
    badge.className = 'connection-badge ' + s;
    const labels = {
      connected: 'Connected', disconnected: 'Disconnected',
      connecting: 'Connecting...', authenticating: 'Authenticating...',
      reconnecting: 'Reconnecting...',
    };
    label.textContent = labels[s] || s;
  });

  ws.on('connected', () => {
    ws.listSessions();
    fetchServerConfig();
    ws.getContext();
    showToast('success', 'Connected to Banana Code API');
  });

  ws.on('error', (msg) => showToast('error', msg));
  ws.on('chunk', onChunk);
  ws.on('toolStart', onToolStart);
  ws.on('toolEnd', onToolEnd);
  ws.on('done', onDone);
  ws.on('permissionRequested', onPermissionRequested);
  ws.on('sessionsList', onSessionsList);
  ws.on('codexLoginStarted', (msg) => {
    showToast('info', msg);
    const status = $('#codex-login-status');
    if (status) status.textContent = '⏳ Waiting for browser login...';
  });

  ws.on('codexLoginFinished', (data) => {
    const status = $('#codex-login-status');
    if (data.success) {
      showToast('success', 'Codex login successful!');
      if (status) status.textContent = '✓ Logged in successfully';
    } else {
      showToast('error', 'Codex login failed: ' + data.error);
      if (status) status.textContent = '✗ Login failed: ' + data.error;
    }
  });
  ws.on('sessionLoaded', onSessionLoaded);
  ws.on('workspaceUpdated', (p) => updateWorkspacePill(p));
  ws.on('historyCleared', () => { clearMessages(); showToast('success', 'History cleared'); });
  ws.on('initComplete', () => showToast('success', 'BANANA.md created!'));
  ws.on('cleanComplete', () => { clearMessages(); showToast('success', 'Context compressed ✓'); });
  ws.on('configUpdated', onConfigUpdated);
  ws.on('memoriesList', onMemoriesList);
  ws.on('memoryAdded', () => { showToast('success', 'Memory added'); state.ws.listMemories(); });
  ws.on('memoryDeleted', () => { showToast('success', 'Memory deleted'); state.ws.listMemories(); });
  ws.on('contextInfo', onContextInfo);
  ws.on('permissionsList', onPermissionsList);
  ws.on('betaFeatures', onBetaFeatures);
  ws.on('imagegenModels', onImageGenModels);
  ws.on('imageGenerationProgress', onImageGenerationProgress);
  ws.on('imageGenerationResult', onImageGenerationResult);
  ws.on('attachmentsDropped', onAttachmentsDropped);
  ws.on('terminalOutput', (data) => console.log('[terminal_output]', data));
  ws.on('authFailure', () => showToast('error', 'Auth failed. Check settings.'));
  ws.on('error', (msg) => showToast('error', `Server Error: ${msg}`));

  ws.connect(state.config.serverUrl, state.config.token);
}

function onConfigUpdated(config) {
  state.serverConfig = config;
  
  if (config.provider === 'openai' && config.authType === 'oauth') {
    state.currentProvider = 'openai_oauth';
  } else if (config.provider) {
    state.currentProvider = config.provider;
  }
  
  if (config.model) state.currentModel = config.model;
  updateModelTrigger();
  updateOperatingModeFromConfig(config);
  updateTokenBadge();
  if (config.showTokenCount) state.ws.getContext();

  // Sync permission mode
  if (config.yolo) state.permMode = 'yolo';
  else if (config.useBananaGuard !== false) state.permMode = 'guard';
  else state.permMode = 'manual';
  updateModeTrigger();
  updateOperatingModeTrigger();
  updateVoiceButtonState();
  if ($('#settings-panel')?.classList.contains('open') && ['settings', 'modes', 'voice', 'imagegen', 'bananasplit'].includes(currentSettingsTab)) {
    renderSettingsTab(currentSettingsTab);
  }
}

async function fetchServerConfig() {
  try {
    const httpUrl = state.config.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/config?token=${state.config.token}`);
    const data = await res.json();
    if (data) onConfigUpdated(data);
  } catch (e) {
    console.warn('Could not fetch server config:', e);
  }
}

// ── Workspace ──
function normalizeWorkspacePath(p) {
  return p ? p.replace(/[\\/]+$/, '') : '';
}

function readRecentWorkspaces() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeRecentWorkspaces(paths) {
  localStorage.setItem(RECENT_WORKSPACES_KEY, JSON.stringify(paths));
}

function readSessionWorkspaces() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_WORKSPACES_KEY) || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function writeSessionWorkspaces(workspaces) {
  localStorage.setItem(SESSION_WORKSPACES_KEY, JSON.stringify(workspaces));
}

function rememberSessionWorkspace(sessionId, workspacePath) {
  if (!sessionId || !workspacePath) return;
  const workspaces = readSessionWorkspaces();
  workspaces[sessionId] = workspacePath;
  writeSessionWorkspaces(workspaces);
}

function readCollapsedProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLLAPSED_PROJECTS_KEY) || '[]');
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function writeCollapsedProjects(collapsed) {
  localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify([...collapsed]));
}

function toggleProjectCollapsed(projectKey) {
  const collapsed = readCollapsedProjects();
  if (collapsed.has(projectKey)) collapsed.delete(projectKey);
  else collapsed.add(projectKey);
  writeCollapsedProjects(collapsed);
  renderSessions(state.sessions);
}

function addRecentWorkspace(path) {
  if (!path || normalizeWorkspacePath(path) === normalizeWorkspacePath(state.homePath)) return;
  const normalized = normalizeWorkspacePath(path);
  const recent = readRecentWorkspaces().filter(p => normalizeWorkspacePath(p) !== normalized);
  writeRecentWorkspaces([path, ...recent].slice(0, MAX_RECENT_WORKSPACES));
}

function removeRecentWorkspace(path) {
  const normalized = normalizeWorkspacePath(path);
  writeRecentWorkspaces(readRecentWorkspaces().filter(p => normalizeWorkspacePath(p) !== normalized));
  renderWorkspacePanel();
}

function folderName(path) {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function sessionId(session = {}) {
  return session.uuid || session.sessionId || session.id;
}

function sessionUpdatedAtMs(session = {}) {
  return new Date(session.updatedAt || 0).getTime() || 0;
}

function sessionWorkspacePath(session = {}) {
  const id = sessionId(session);
  const remembered = id ? readSessionWorkspaces()[id] : null;
  return session.workspacePath
    || session.workspace_path
    || session.workspace
    || session.cwd
    || session.projectPath
    || session.project_path
    || session.project
    || session.folder
    || session.workingDirectory
    || session.working_directory
    || session.directory
    || session.root
    || session.metadata?.workspacePath
    || session.metadata?.workspace_path
    || session.metadata?.workspace
    || session.metadata?.cwd
    || session.metadata?.projectPath
    || session.metadata?.project_path
    || session.metadata?.project
    || session.metadata?.folder
    || remembered
    || null;
}

function inferredSessionWorkspacePath(session = {}) {
  return sessionWorkspacePath(session);
}

function sessionProjectLabel(session) {
  const workspacePath = inferredSessionWorkspacePath(session);
  if (workspacePath) {
    const isHomeFallback = normalizeWorkspacePath(workspacePath) === normalizeWorkspacePath(state.homePath);
    return isHomeFallback ? 'Home' : folderName(workspacePath);
  }

  return 'No folder';
}

function updateWorkspacePill(p) {
  state.workspacePath = p;
  const isHomeFallback = !p || normalizeWorkspacePath(p) === normalizeWorkspacePath(state.homePath);
  if (isHomeFallback) {
    $('#workspace-path').textContent = 'Home';
    $('#workspace-pill').title = 'Change workspace folder';
    return;
  }

  const home = '~';
  const display = p.replace(/^\/home\/[^/]+/, home);
  $('#workspace-path').textContent = display;
  $('#workspace-pill').title = p;
  addRecentWorkspace(p);
}

// ── Toast ──
function showToast(type, message) {
  const container = $('#toast-container');
  const icons = { success: '✓', error: '✗', warning: '⚠️', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}

// ── Sidebar Sessions ──
function setupSidebar() {
  $('#btn-new-chat').addEventListener('click', newChat);
  $('#search-sessions').addEventListener('input', (e) => filterSessions(e.target.value));
}

async function newChat() {
  const homeDir = state.homePath || await window.studioAPI.getHomePath();
  if (homeDir) state.ws.setWorkspace(homeDir);
  state.ws.clearHistory();
  state.currentSessionId = null;
  clearMessages();
  $('#message-input').focus();
}

function emptyStateHtml() {
  return `<div class="empty-state" id="empty-state">
    <img class="empty-state-logo" src="../assets/banana.png" alt="">
    <h2>What should we work on?</h2>
    <div class="empty-suggestions" aria-label="Suggested tasks">
      <div class="suggestion-card">
        <div class="suggestion-icon code"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5.5-4 4.5 4 4.5M12.5 5.5l4 4.5-4 4.5M11 4.5l-2 11"/></svg></div>
        <div class="suggestion-title">Review codebase</div>
        <div class="suggestion-desc">Understand your code and get insights</div>
      </div>
      <div class="suggestion-card">
        <div class="suggestion-icon bug"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 7.5h6v5.2a3 3 0 0 1-6 0V7.5ZM6 5l2 2.5M14 5l-2 2.5M4.5 10H7M13 10h2.5M5 14h2.2M12.8 14H15M10 7.5v8M8 4.5h4"/></svg></div>
        <div class="suggestion-title">Fix a bug</div>
        <div class="suggestion-desc">Find issues and propose a fix</div>
      </div>
      <div class="suggestion-card">
        <div class="suggestion-icon idea"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 14h5M8 16h4M13.5 8.7c0 1.3-.7 2.2-1.6 3-.5.5-.7 1-.7 1.3H8.8c0-.7-.3-1.1-.8-1.7-.8-.8-1.5-1.7-1.5-3A3.5 3.5 0 0 1 10 4.8a3.5 3.5 0 0 1 3.5 3.9Z"/></svg></div>
        <div class="suggestion-title">Plan a feature</div>
        <div class="suggestion-desc">Break down ideas into steps and tasks</div>
      </div>
    </div>
  </div>`;
}

function clearMessages() {
  const container = $('#messages-container');
  container.innerHTML = emptyStateHtml();
  resetImageGenRenderState();
}

function resetImageGenRenderState() {
  state.imageGenCards.clear();
  state.renderedImageGenRequestIds.clear();
  state._activeImageToolCard = null;
}

function onSessionsList(sessions) {
  if (state.pendingWorkspacePath) {
    const newestSession = [...sessions]
      .sort((a, b) => sessionUpdatedAtMs(b) - sessionUpdatedAtMs(a))
      .find(s => sessionId(s));
    if (newestSession) {
      rememberSessionWorkspace(sessionId(newestSession), state.pendingWorkspacePath);
      state.pendingWorkspacePath = null;
    }
  }

  sessions.forEach(session => {
    const id = sessionId(session);
    const workspacePath = sessionWorkspacePath(session);
    if (id && workspacePath) rememberSessionWorkspace(id, workspacePath);
  });

  state.sessions = sessions;
  renderSessions(sessions);
}

function renderSessions(sessions) {
  const container = $('#sessions-container');
  if (!sessions.length) { container.innerHTML = '<p class="sidebar-empty">No chats yet</p>'; return; }

  const groups = new Map();
  const ungroupedSessions = [];
  sessions.forEach(s => {
    const workspacePath = inferredSessionWorkspacePath(s);
    if (!workspacePath) {
      ungroupedSessions.push(s);
      return;
    }

    const key = normalizeWorkspacePath(workspacePath) || '__no_folder__';
    if (!groups.has(key)) {
      groups.set(key, {
        label: sessionProjectLabel(s),
        path: workspacePath,
        sessions: [],
        updatedAt: 0,
      });
    }
    const group = groups.get(key);
    const updatedAt = sessionUpdatedAtMs(s);
    group.updatedAt = Math.max(group.updatedAt, updatedAt);
    group.sessions.push(s);
  });

  const projectGroups = Array.from(groups.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const collapsedProjects = readCollapsedProjects();

  let html = projectGroups.map(group => {
    const activeProject = group.sessions.some(s => String(sessionId(s)) === String(state.currentSessionId));
    const projectKey = normalizeWorkspacePath(group.path) || group.label;
    const collapsed = collapsedProjects.has(projectKey);
    const pathAttr = group.path ? ` data-project-path="${escapeAttr(group.path)}"` : '';
    let groupHtml = `<div class="project-group${activeProject ? ' active' : ''}${collapsed ? ' collapsed' : ''}">
      <button class="project-group-header" type="button" data-project-key="${escapeAttr(projectKey)}"${pathAttr} title="${escapeAttr(group.path || group.label)}" aria-expanded="${!collapsed}">
        <span class="project-group-caret">▾</span>
        <span class="project-group-icon">${iconHtml('folder')}</span>
        <span class="project-group-name">${escapeHtml(group.label)}</span>
      </button>`;

    group.sessions
      .sort((a, b) => sessionUpdatedAtMs(b) - sessionUpdatedAtMs(a))
      .forEach(s => {
      const id = sessionId(s);
      if (!id) return;
      const active = String(id) === String(state.currentSessionId) ? ' active' : '';
      groupHtml += `<div class="session-item${active}" data-id="${escapeAttr(id)}">
        <span class="session-title">${escapeHtml(s.title || 'Untitled')}</span>
        <span class="session-meta">${formatTime(s.updatedAt)}</span>
      </div>`;
    });

    return groupHtml + '</div>';
  }).join('');

  html += ungroupedSessions
    .sort((a, b) => sessionUpdatedAtMs(b) - sessionUpdatedAtMs(a))
    .map(s => {
      const id = sessionId(s);
      if (!id) return '';
      const active = String(id) === String(state.currentSessionId) ? ' active' : '';
      return `<div class="session-item no-project${active}" data-id="${escapeAttr(id)}">
        <span class="session-title">${escapeHtml(s.title || 'Untitled')}</span>
        <span class="session-meta">${formatTime(s.updatedAt)}</span>
      </div>`;
    }).join('');

  container.innerHTML = html;
  container.querySelectorAll('.session-item').forEach(el => {
    el.addEventListener('click', () => loadSession(el.dataset.id));
  });
  container.querySelectorAll('[data-project-key]').forEach(el => {
    el.addEventListener('click', () => {
      toggleProjectCollapsed(el.dataset.projectKey);
    });
  });
}

function filterSessions(query) {
  const q = query.toLowerCase();
  const filtered = q ? state.sessions.filter(s => {
    const workspacePath = inferredSessionWorkspacePath(s) || '';
    const projectLabel = sessionProjectLabel(s);
    return (s.title || '').toLowerCase().includes(q)
      || workspacePath.toLowerCase().includes(q)
      || projectLabel.toLowerCase().includes(q);
  }) : state.sessions;
  renderSessions(filtered);
}

function loadSession(id) {
  state.currentSessionId = id;
  state.ws.loadSession(id);
  $$('.session-item').forEach(el => el.classList.toggle('active', el.dataset.id === id));
}

function onSessionLoaded(data) {
  state.currentSessionId = data.sessionId;
  const loadedWorkspace = sessionWorkspacePath(data);
  if (loadedWorkspace) rememberSessionWorkspace(data.sessionId, loadedWorkspace);
  const container = $('#messages-container');
  container.innerHTML = '';
  resetImageGenRenderState();
  $('#empty-state')?.remove();
  
  const msgs = data.messages || [];
  
  // Build a map of tool_call_id -> tool result content for quick lookup
  const toolResults = {};
  msgs.forEach(m => {
    if (m.role === 'tool' && m.tool_call_id) {
      toolResults[m.tool_call_id] = m.content || '';
    }
  });
  
  msgs.forEach(m => {
    // Skip system messages
    if (m.role === 'system') return;
    
    // Skip tool result messages — they're rendered inline with the tool card
    if (m.role === 'tool') return;
    
    if (m.role === 'user') {
      // Render user messages (content can be string or array of parts)
      const text = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || JSON.stringify(m.content));
      addMessageBubble('user', text);
      return;
    }
    
    if (m.role === 'assistant') {
      // If this assistant message has tool_calls, render each as a completed tool card
      if (m.tool_calls && m.tool_calls.length > 0) {
        m.tool_calls.forEach(tc => {
          const fnName = tc.function?.name || tc.name || 'tool';
          const fnArgs = tc.function?.arguments || '';
          let argsStr = '';
          try {
            const parsed = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs;
            argsStr = JSON.stringify(parsed, null, 2);
          } catch { argsStr = fnArgs; }
          
          const resultText = toolResults[tc.id] || '';
          
          const card = document.createElement('div');
          card.className = 'tool-card success';
          card.innerHTML = `<div class="tool-card-header" onclick="this.parentElement.classList.toggle('expanded')">
            <span>🔧</span><span class="tool-card-name">${escapeHtml(fnName)}</span>
            <span>✓</span><span class="tool-card-chevron">▸</span>
          </div><div class="tool-card-body">${escapeHtml(resultText.substring(0, 2000))}</div>`;
          container.appendChild(card);
        });
      }
      
      // If there's also text content, render it as a normal assistant message
      if (m.content) {
        const text = typeof m.content === 'string' ? m.content : (m.content?.[0]?.text || '');
        if (text.trim()) addMessageBubble('assistant', text);
      }
      return;
    }
  });
  
  container.scrollTop = container.scrollHeight;
  state.ws.listSessions(); // refresh sidebar to highlight active
  if (state.serverConfig?.showTokenCount) state.ws.getContext();
}

// ── Message Rendering ──
function addMessageBubble(role, content) {
  const container = $('#messages-container');
  $('#empty-state')?.remove();

  const msg = document.createElement('div');
  msg.className = 'message';
  const isAssistant = role === 'assistant';
  msg.innerHTML = `
    <div class="message-avatar ${isAssistant ? 'assistant' : ''}">${isAssistant ? '<img src="../assets/logo.svg" class="avatar-logo">' : '👤'}</div>
    <div class="message-body">
      <div class="message-role">${isAssistant ? 'Banana Code' : 'You'}</div>
      <div class="message-content">${isAssistant ? renderMd(content) : escapeHtml(content)}</div>
    </div>`;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function renderMd(text) {
  if (!text) return '';
  try {
    if (window.marked) {
      let html = window.marked.parse(text);
      // Add code headers
      html = html.replace(/<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g, (_, lang, code) => {
        let hl = code;
        try { if (window.hljs) hl = window.hljs.highlight(decodeEntities(code), { language: lang, ignoreIllegals: true }).value; } catch(e) {}
        return `<pre><div class="code-header"><span>${lang}</span><button class="copy-btn" onclick="window._copyCode(this)">📋 Copy</button></div><code class="hljs language-${lang}">${hl}</code></pre>`;
      });
      html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
        let hl = code;
        try { if (window.hljs) hl = window.hljs.highlightAuto(decodeEntities(code)).value; } catch(e) {}
        return `<pre><div class="code-header"><span>code</span><button class="copy-btn" onclick="window._copyCode(this)">📋 Copy</button></div><code class="hljs">${hl}</code></pre>`;
      });
      if (window.DOMPurify) html = window.DOMPurify.sanitize(html, { ADD_TAGS: ['button'], ADD_ATTR: ['onclick'] });
      return html;
    }
  } catch(e) { console.error('Markdown error:', e); }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

window._copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code');
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
};

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function escapeAttr(t) { return escapeHtml(t).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function decodeEntities(t) { const a = document.createElement('textarea'); a.innerHTML = t; return a.value; }

function customSelectHtml(id, options, value) {
  const normalized = options.map(opt => (
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  ));
  const selected = normalized.find(opt => String(opt.value) === String(value)) || normalized[0] || { value: '', label: 'Select' };
  return `<div class="custom-select" data-select-target="${escapeAttr(id)}" data-value="${escapeAttr(selected.value)}" role="combobox" aria-expanded="false">
    <button class="custom-select-trigger" type="button">
      <span class="custom-select-value">${escapeHtml(selected.label)}</span>
      <span class="custom-select-caret" aria-hidden="true"></span>
    </button>
    <div class="custom-select-menu" role="listbox">
      ${normalized.map(opt => {
        const active = String(opt.value) === String(selected.value);
        return `<button class="custom-select-option${active ? ' active' : ''}" type="button" role="option" aria-selected="${active}" data-value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</button>`;
      }).join('')}
    </div>
  </div><input type="hidden" id="${escapeAttr(id)}" value="${escapeAttr(selected.value)}">`;
}

function closeCustomSelects(except = null) {
  document.querySelectorAll('.custom-select.open').forEach(select => {
    if (select === except) return;
    select.classList.remove('open');
    select.setAttribute('aria-expanded', 'false');
  });
}

function initCustomSelects(root = document) {
  root.querySelectorAll('.custom-select').forEach(select => {
    const trigger = select.querySelector('.custom-select-trigger');
    const valueLabel = select.querySelector('.custom-select-value');
    const options = Array.from(select.querySelectorAll('.custom-select-option'));
    const input = document.getElementById(select.dataset.selectTarget);
    const setValue = (option, emitChange = true) => {
      if (!option) return;
      const nextValue = option.dataset.value;
      select.dataset.value = nextValue;
      if (input) {
        input.value = nextValue;
        if (emitChange) input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (valueLabel) valueLabel.textContent = option.textContent;
      options.forEach(item => {
        const active = item === option;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
    };

    setValue(options.find(option => option.dataset.value === select.dataset.value) || options[0], false);

    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      const shouldOpen = !select.classList.contains('open');
      closeCustomSelects(select);
      select.classList.toggle('open', shouldOpen);
      select.setAttribute('aria-expanded', String(shouldOpen));
    });

    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        setValue(option);
        closeCustomSelects();
        trigger?.focus();
      });
    });

    select.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCustomSelects();
        trigger?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const activeIndex = Math.max(0, options.findIndex(option => option.classList.contains('active')));
        const nextIndex = e.key === 'ArrowDown'
          ? Math.min(options.length - 1, activeIndex + 1)
          : Math.max(0, activeIndex - 1);
        setValue(options[nextIndex]);
      }
    });
  });
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Streaming ──
function onChunk(content) {
  if (!state.isStreaming) {
    state.isStreaming = true;
    state.streamingText = '';
    const container = $('#messages-container');
    $('#empty-state')?.remove();
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.id = 'streaming-msg';
    msg.innerHTML = `<div class="message-avatar assistant"><img src="../assets/logo.svg" class="avatar-logo"></div>
      <div class="message-body"><div class="message-role">Banana Code</div>
      <div class="message-content" id="streaming-content"></div></div>`;
    container.appendChild(msg);
    state.streamingEl = msg.querySelector('#streaming-content');
  }
  state.streamingText += content;
  if (state.streamingEl) {
    state.streamingEl.innerHTML = renderMd(state.streamingText) + '<span class="streaming-cursor">▋</span>';
    $('#messages-container').scrollTop = $('#messages-container').scrollHeight;
  }
}

function onToolStart(tool) {
  // Finalize any current streaming message before inserting the tool card
  if (state.streamingEl && state.streamingText) {
    state.streamingEl.innerHTML = renderMd(state.streamingText);
  }
  // Reset streaming state so post-tool chunks create a NEW message bubble
  state.streamingEl = null;
  state.streamingText = '';
  state.isStreaming = false;

  const container = $('#messages-container');
  $('#empty-state')?.remove();
  const card = document.createElement('div');
  card.className = 'tool-card running';
  card.id = `tool-${Date.now()}`;
  const name = typeof tool === 'string' ? tool : (tool?.name || tool?.type || 'tool');
  const input = typeof tool === 'object' ? JSON.stringify(tool.input || tool, null, 2) : '';
  const isImageTool = isGenerateImageTool(name);
  const showInlineImagePreview = isImageTool && isImageGenRealtimeEnabled();
  card.className = `tool-card running${showInlineImagePreview ? ' image-tool-card expanded' : ''}`;
  card.innerHTML = `<div class="tool-card-header" onclick="this.parentElement.classList.toggle('expanded')">
    <span>🔧</span><span class="tool-card-name">${escapeHtml(name)}</span>
    <div class="tool-spinner"></div><span class="tool-card-chevron">▸</span>
  </div><div class="tool-card-body">${showInlineImagePreview ? imageToolLivePreviewHtml(input) : escapeHtml(input)}</div>`;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  state._lastToolCard = card;

  if (showInlineImagePreview) {
    state._activeImageToolCard = card;
    const toolPayload = parseToolPayload(tool);
    updateImageGenCardProgress({
      requestId: 'pending-imagegen',
      phase: 'queued',
      prompt: toolPayload.prompt,
      model: toolPayload.model || getImageGenConfig().model,
      steps: toolPayload.steps || toolPayload.num_inference_steps,
      message: 'Waiting for first live preview...'
    });
  } else if (isImageTool) {
    state._activeImageToolCard = null;
  }
}

function onToolEnd(result) {
  const card = state._lastToolCard;
  if (!card) return;
  card.classList.remove('running');
  const isError = result?.error || result?.exitCode !== undefined && result.exitCode !== 0;
  card.classList.add(isError ? 'error' : 'success');
  const spinner = card.querySelector('.tool-spinner');
  if (spinner) spinner.outerHTML = `<span>${isError ? '✗' : '✓'}</span>`;
  const body = card.querySelector('.tool-card-body');
  if (card.classList.contains('image-tool-card')) {
    if (isError && body && result) {
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      body.insertAdjacentHTML('beforeend', `<pre class="image-tool-error">${escapeHtml(text.substring(0, 2000))}</pre>`);
    }
    return;
  }
  if (body && result) {
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    body.textContent = text.substring(0, 2000);
  }
}

function onDone(data) {
  if (data.sessionId) {
    state.currentSessionId = data.sessionId;
    if (state.pendingWorkspacePath) {
      rememberSessionWorkspace(data.sessionId, state.pendingWorkspacePath);
      state.pendingWorkspacePath = null;
    }
  }

  let el = state.streamingEl;
  
  // If we didn't receive any chunks (non-streaming provider), create the message bubble now
  if (!state.isStreaming || !el) {
    $('#empty-state')?.remove();
    const container = $('#messages-container');
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.innerHTML = `<div class="message-avatar assistant"><img src="../assets/logo.svg" class="avatar-logo"></div>
      <div class="message-body"><div class="message-role">Banana Code</div>
      <div class="message-content" id="streaming-content"></div></div>`;
    container.appendChild(msg);
    el = msg.querySelector('#streaming-content');
    state.streamingText = data.finalResponse || '*(No response)*';
    el.innerHTML = renderMd(state.streamingText);
    container.scrollTop = container.scrollHeight;
  } else {
    // We were streaming, so finalize the text
    el.innerHTML = renderMd(state.streamingText);
  }

  // Add usage footer
  if (data.usage && el) {
    const u = data.usage;
    const footer = document.createElement('div');
    footer.className = 'message-usage';
    let html = '';
    if (u.inputTokens) html += `<span>↑ ${u.inputTokens.toLocaleString()} tokens</span>`;
    if (u.outputTokens) html += `<span>↓ ${u.outputTokens.toLocaleString()} tokens</span>`;
    if (u.totalCost) html += `<span>💰 $${u.totalCost.toFixed(4)}</span>`;
    footer.innerHTML = html;
    el.parentElement.appendChild(footer);
  }

  state.isStreaming = false;
  state.streamingText = '';
  state.streamingEl = null;
  if (Array.isArray(data.generatedImages) && data.generatedImages.length > 0) {
    renderGeneratedImagesFromDone(data.generatedImages);
  }
  setInputEnabled(true);
  state.ws.listSessions();
  if (state.serverConfig?.showTokenCount) state.ws.getContext();
}

// ── Image Generation Rendering ──
function getImageGenConfig() {
  return state.serverConfig?.imageGen || {};
}

function isImageGenRealtimeEnabled() {
  return getImageGenConfig().realtimeProgress !== false;
}

function onAttachmentsDropped(attachments) {
  if (!attachments.length) return;
  showToast('warning', `${attachments.length} attachment${attachments.length === 1 ? '' : 's'} could not be read.`);
}

function onImageGenModels(data) {
  state.imageGenModels = data;
  if ($('#settings-panel')?.classList.contains('open') && currentSettingsTab === 'imagegen') {
    const baseUrlInput = $('#imagegen-base-url');
    const modelInput = $('#imagegen-model');
    const modelList = $('#imagegen-model-list');
    const models = Array.isArray(data.models) ? data.models : [];
    if (baseUrlInput && data.baseUrl) baseUrlInput.value = data.baseUrl;
    if (modelInput && !modelInput.value.trim() && models[0]) modelInput.value = models[0];
    if (modelList) {
      const selected = modelInput?.value || getImageGenConfig().model || '';
      modelList.innerHTML = models.map(model => `<button class="imagegen-model-choice${model === selected ? ' active' : ''}" type="button" data-model="${escapeAttr(model)}">${escapeHtml(model)}</button>`).join('');
      wireImageGenModelChoiceHandlers(modelList);
    }
  }
  showToast('success', data.models?.length ? `Found ${data.models.length} ImageGen model${data.models.length === 1 ? '' : 's'}` : 'No ImageGen models found');
}

function wireImageGenModelChoiceHandlers(root = document) {
  root.querySelectorAll('[data-model]').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#imagegen-model').value = btn.dataset.model;
      $('#imagegen-model-list')?.querySelectorAll('[data-model]').forEach(choice => choice.classList.toggle('active', choice === btn));
    });
  });
}

function fileUrlFromPath(filePath) {
  if (!filePath) return '';
  const normalized = String(filePath).replace(/\\/g, '/');
  const prefix = /^[a-zA-Z]:\//.test(normalized) ? 'file:///' : 'file://';
  const encodedPath = normalized
    .split('/')
    .map((part, index) => index === 0 && /^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part))
    .join('/');
  return prefix + encodedPath;
}

function absoluteImageUrl(rawUrl, baseUrl) {
  if (!rawUrl) return '';
  const url = String(rawUrl);
  if (/^(https?:|file:|data:)/i.test(url)) return url;
  try {
    return new URL(url, baseUrl || getImageGenConfig().baseUrl || DEFAULT_IMAGEGEN_BASE_URL).toString();
  } catch {
    return url;
  }
}

function cacheBustUrl(url, cacheKey) {
  if (!url || !cacheKey || /^data:/i.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_bc_preview=${encodeURIComponent(cacheKey)}`;
}

function imagePreviewUrl(image = {}, { preferPath = false, baseUrl, cacheKey } = {}) {
  let url = '';
  if (image.b64_json) {
    return `data:${image.mime_type || 'image/png'};base64,${image.b64_json}`;
  }
  if (image.base64) {
    return `data:${image.mime_type || image.mimeType || 'image/png'};base64,${image.base64}`;
  }
  if (preferPath && image.path) url = fileUrlFromPath(image.path);
  else if (image.url) url = absoluteImageUrl(image.url, baseUrl);
  else if (image.preview_url) url = absoluteImageUrl(image.preview_url, baseUrl);
  else if (image.previewUrl) url = absoluteImageUrl(image.previewUrl, baseUrl);
  else if (image.image_url) url = absoluteImageUrl(image.image_url, baseUrl);
  else if (image.imageUrl) url = absoluteImageUrl(image.imageUrl, baseUrl);
  else if (image.path) url = fileUrlFromPath(image.path);
  return cacheBustUrl(url, cacheKey);
}

function imageGenStatusText(payload = {}) {
  if (payload.ok || payload.images) {
    const count = Array.isArray(payload.images) ? payload.images.length : 0;
    return count ? `Saved ${count} image${count === 1 ? '' : 's'}` : 'Completed';
  }
  if (payload.phase === 'queued') return 'Waiting for first preview';
  if (payload.phase === 'start') return 'Starting stream';
  if (payload.step || payload.total) {
    const step = payload.step || '?';
    const total = payload.total || '?';
    const percent = Number.isFinite(Number(payload.percent)) ? ` (${Math.round(Number(payload.percent))}%)` : '';
    return `Step ${step}/${total}${percent}`;
  }
  return payload.phase ? String(payload.phase) : 'Generating';
}

function imageGenPercent(payload = {}) {
  const explicit = Number(payload.percent);
  if (Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const step = Number(payload.step);
  const total = Number(payload.total);
  if (Number.isFinite(step) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(100, (step / total) * 100));
  }
  return 0;
}

function imagePayloadPreview(payload = {}) {
  const image = payload.image
    || payload.preview
    || payload.progress_image
    || payload.progressImage
    || payload.frame
    || payload.sample
    || payload.artifact
    || payload.images?.[0]
    || payload.data?.[0]
    || payload.output?.[0]
    || (payload.url
      || payload.b64_json
      || payload.base64
      || payload.preview_url
      || payload.previewUrl
      || payload.image_url
      || payload.imageUrl
      || payload.path
      ? payload
      : null);
  if (!image) return '';
  const url = imagePreviewUrl(image, {
    baseUrl: payload.baseUrl || getImageGenConfig().baseUrl,
    cacheKey: imageGenStepKey(payload)
  });
  return url ? `<img src="${escapeAttr(url)}" alt="Image generation preview">` : '';
}

function renderImageGrid(images = [], payload = {}) {
  return images.map((image, index) => {
    const src = imagePreviewUrl(image, { preferPath: true, baseUrl: payload.baseUrl || getImageGenConfig().baseUrl });
    const label = image.path || image.url || `Image ${index + 1}`;
    return `<figure class="imagegen-result">
      <div class="imagegen-image-frame">${src ? `<img src="${escapeAttr(src)}" alt="Generated image ${index + 1}">` : ''}</div>
      <figcaption title="${escapeAttr(label)}">${escapeHtml(label)}</figcaption>
    </figure>`;
  }).join('');
}

function imageGenStepKey(payload = {}) {
  return [
    payload.phase || 'progress',
    payload.step ?? '',
    payload.total ?? '',
    payload.percent ?? ''
  ].join(':');
}

function imageGenStepText(payload = {}) {
  if (payload.phase === 'queued') return payload.message || 'Waiting for first live preview';
  if (payload.phase === 'start') return 'Started generation';
  if (payload.phase === 'fallback') return payload.message || 'Realtime stream unavailable, waiting for final image';
  if (payload.step || payload.total) return imageGenStatusText(payload);
  return payload.message || imageGenStatusText(payload);
}

function imageToolLivePreviewHtml(input = '') {
  return `<div class="image-tool-live">
    <div class="image-tool-live-title">Starting</div>
    <div class="imagegen-prompt"></div>
    <div class="imagegen-progress-track"><div class="imagegen-progress-fill"></div></div>
    <div class="imagegen-preview-frame has-preview"><div class="imagegen-preview"><div class="imagegen-preview-placeholder">Starting image preview now...</div></div></div>
    <div class="imagegen-steps"></div>
    <div class="imagegen-meta"></div>
    ${input ? `<details class="image-tool-input"><summary>Tool input</summary><pre>${escapeHtml(input)}</pre></details>` : ''}
  </div>`;
}

function applyImageGenProgressToCard(card, payload = {}, { isFinal = false } = {}) {
  if (!card) return;
  const title = card.querySelector('.image-tool-live-title') || card.querySelector('.imagegen-title');
  const status = card.querySelector('.imagegen-card-status');
  const prompt = card.querySelector('.imagegen-prompt');
  const fill = card.querySelector('.imagegen-progress-fill');
  const preview = card.querySelector('.imagegen-preview');
  const previewFrame = card.querySelector('.imagegen-preview-frame');
  const steps = card.querySelector('.imagegen-steps');
  const meta = card.querySelector('.imagegen-meta');

  const statusText = imageGenStatusText(payload);
  if (title) {
    if (title.classList.contains('imagegen-title') && payload.model) {
      title.textContent = `ImageGen · ${payload.model}`;
    } else {
      title.textContent = statusText;
    }
  }
  if (status) status.textContent = statusText;
  if (prompt && payload.prompt) prompt.textContent = payload.prompt;
  if (fill) fill.style.width = `${isFinal ? 100 : imageGenPercent(payload)}%`;

  const finalImages = Array.isArray(payload.images) && payload.images.length > 0;
  const previewHtml = finalImages
    ? renderImageGrid(payload.images, payload)
    : imagePayloadPreview(payload);

  if (previewHtml && preview) {
    preview.innerHTML = previewHtml;
    previewFrame?.classList.add('has-preview');
    previewFrame?.classList.remove('waiting');
    if (finalImages || isFinal) {
      previewFrame?.classList.add('final');
    }
  } else if (isFinal && preview) {
    preview.innerHTML = renderImageGrid(payload.images || [], payload);
    previewFrame?.classList.add('has-preview', 'final');
    previewFrame?.classList.remove('waiting');
  }

  if (steps && !finalImages && !isFinal) {
    appendImageGenStep(steps, payload, previewHtml);
  }

  if (meta) {
    if (isFinal) {
      meta.textContent = payload.requestId || '';
    } else {
      const bits = [];
      if (payload.step || payload.total) bits.push(`step ${payload.step || '?'}/${payload.total || '?'}`);
      if (payload.seed !== undefined) bits.push(`seed ${payload.seed}`);
      if (payload.requestId) bits.push(payload.requestId);
      meta.textContent = bits.join(' · ');
    }
  }
}

function updateActiveImageToolPreview(payload = {}) {
  applyImageGenProgressToCard(state._activeImageToolCard, payload);
}

function isGenerateImageTool(name = '') {
  return /^(generate_image|Generate Image|ImageGen)$/i.test(String(name).trim());
}

function parseToolPayload(tool) {
  if (!tool || typeof tool !== 'object') return {};
  const raw = tool.input || tool.arguments || tool.function?.arguments || tool;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function ensureImageGenCard(payload = {}) {
  const requestId = payload.requestId || payload.id || 'latest';
  let card = state.imageGenCards.get(requestId);
  if (card) return card;
  if (requestId !== 'pending-imagegen' && state.imageGenCards.has('pending-imagegen')) {
    card = state.imageGenCards.get('pending-imagegen');
    state.imageGenCards.delete('pending-imagegen');
    state.imageGenCards.set(requestId, card);
    card.dataset.requestId = requestId;
    return card;
  }

  $('#empty-state')?.remove();
  const container = $('#messages-container');
  card = document.createElement('div');
  card.className = 'imagegen-card running';
  card.dataset.requestId = requestId;
  card.innerHTML = `<div class="imagegen-card-header">
    <span class="imagegen-badge">IMG</span>
    <span class="imagegen-title">ImageGen</span>
    <span class="imagegen-card-status">Starting</span>
    <div class="tool-spinner"></div>
  </div>
  <div class="imagegen-card-body">
    <div class="imagegen-prompt"></div>
    <div class="imagegen-progress-track"><div class="imagegen-progress-fill"></div></div>
    <div class="imagegen-preview-frame has-preview"><div class="imagegen-preview"><div class="imagegen-preview-placeholder">Waiting for first live preview...</div></div></div>
    <div class="imagegen-steps"></div>
    <div class="imagegen-meta"></div>
  </div>`;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  state.imageGenCards.set(requestId, card);
  return card;
}

function updateImageGenCardProgress(payload = {}) {
  if (state._activeImageToolCard) {
    updateActiveImageToolPreview(payload);
    return;
  }
  applyImageGenProgressToCard(ensureImageGenCard(payload), payload);
}

function appendImageGenStep(steps, payload = {}, previewHtml = '') {
  const key = imageGenStepKey(payload);
  if (key === steps.dataset.lastStepKey) return;
  steps.dataset.lastStepKey = key;

  const item = document.createElement('div');
  item.className = `imagegen-step${previewHtml ? ' has-preview' : ''}`;
  item.innerHTML = `<span class="imagegen-step-dot"></span>
    <div class="imagegen-step-text">${escapeHtml(imageGenStepText(payload))}</div>
    ${previewHtml ? `<div class="imagegen-step-thumb">${previewHtml}</div>` : ''}`;
  steps.appendChild(item);

  while (steps.children.length > 12) {
    steps.removeChild(steps.firstElementChild);
  }
}

function onImageGenerationProgress(payload = {}) {
  if (!isImageGenRealtimeEnabled()) return;
  updateImageGenCardProgress(payload);
}

function onImageGenerationResult(payload = {}) {
  if (state._activeImageToolCard) {
    const toolCard = state._activeImageToolCard;
    toolCard.classList.remove('running');
    toolCard.classList.add('success');
    const toolSpinner = toolCard.querySelector('.tool-spinner');
    if (toolSpinner) toolSpinner.outerHTML = '<span class="imagegen-complete">✓</span>';
    applyImageGenProgressToCard(toolCard, payload, { isFinal: true });
    toolCard.dataset.resultRendered = 'true';
    state._activeImageToolCard = null;
    state.renderedImageGenRequestIds.add(payload.requestId || 'latest');
    $('#messages-container').scrollTop = $('#messages-container').scrollHeight;
    return;
  }

  const card = ensureImageGenCard(payload);
  card.classList.remove('running');
  card.classList.add('success');
  card.dataset.resultRendered = 'true';

  const spinner = card.querySelector('.tool-spinner');
  if (spinner) spinner.outerHTML = '<span class="imagegen-complete">✓</span>';
  const title = card.querySelector('.imagegen-title');
  const status = card.querySelector('.imagegen-card-status');
  const prompt = card.querySelector('.imagegen-prompt');
  const fill = card.querySelector('.imagegen-progress-fill');
  const preview = card.querySelector('.imagegen-preview');
  const previewFrame = card.querySelector('.imagegen-preview-frame');
  const meta = card.querySelector('.imagegen-meta');

  if (title && payload.model) title.textContent = `ImageGen · ${payload.model}`;
  if (status) status.textContent = imageGenStatusText(payload);
  if (prompt && payload.prompt) prompt.textContent = payload.prompt;
  if (fill) fill.style.width = '100%';
  if (preview) preview.innerHTML = renderImageGrid(payload.images || [], payload);
  if (previewFrame) {
    previewFrame.classList.add('has-preview', 'final');
    previewFrame.classList.remove('waiting');
  }
  if (meta) meta.textContent = payload.requestId || '';
  if (payload.requestId) state.renderedImageGenRequestIds.add(payload.requestId);
  $('#messages-container').scrollTop = $('#messages-container').scrollHeight;
}

function renderGeneratedImagesFromDone(images = []) {
  const grouped = new Map();
  images.forEach(image => {
    const key = image.requestId || 'latest';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(image);
  });

  grouped.forEach((groupImages, requestId) => {
    if (state.renderedImageGenRequestIds.has(requestId)) return;
    const existingCard = state.imageGenCards.get(requestId);
    if (existingCard?.dataset.resultRendered === 'true') return;
    onImageGenerationResult({
      requestId,
      ok: true,
      images: groupImages,
      prompt: groupImages[0]?.prompt,
      model: groupImages[0]?.model,
    });
  });
}

// ── Input ──
function setupInput() {
  const textarea = $('#message-input');
  const sendBtn = $('#btn-send');
  const attachBtn = $('#btn-add-attachment');
  const voiceBtn = $('#btn-voice');

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    updateVoiceButtonState();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  attachBtn?.addEventListener('click', addAttachments);
  voiceBtn?.addEventListener('click', handleVoiceButtonClick);
  renderAttachmentChips();
  updateVoiceButtonState();
}

async function addAttachments() {
  const paths = await window.studioAPI.openFileDialog();
  if (!paths?.length) return;
  const existing = new Set(state.attachments.map(a => a.path));
  for (const path of paths) {
    if (!existing.has(path)) state.attachments.push({ path });
  }
  renderAttachmentChips();
  updateVoiceButtonState();
}

function renderAttachmentChips() {
  const container = $('#attachment-chips');
  if (!container) return;
  container.innerHTML = state.attachments.map((attachment, index) => {
    const name = attachment.path.split(/[\\/]/).pop();
    return `<button class="attachment-chip" type="button" data-index="${index}" title="${escapeAttr(attachment.path)}">
      <span>${escapeHtml(name)}</span><span class="attachment-remove">×</span>
    </button>`;
  }).join('');
  container.classList.toggle('empty', state.attachments.length === 0);
  container.querySelectorAll('.attachment-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.attachments.splice(Number(chip.dataset.index), 1);
      renderAttachmentChips();
      updateVoiceButtonState();
    });
  });
}

async function handleVoiceButtonClick() {
  if (state.isVoiceRecording) {
    await stopVoiceRecordingAndSend();
    return;
  }

  const textarea = $('#message-input');
  if (textarea.value.trim() || state.attachments.length > 0) {
    showToast('info', 'Voice input starts from an empty message.');
    textarea.focus();
    return;
  }

  const voice = state.serverConfig?.voice || {};
  if (voice.enabled === false) {
    showToast('info', 'Voice input is disabled in Settings.');
    return;
  }

  if (!voice.groqApiKey || !voice.model) {
    openSettings();
    setActiveSettingsTab('voice');
    showToast('info', 'Set up voice input first.');
    return;
  }

  if (state.isStreaming || state.isVoiceTranscribing) return;
  await startVoiceRecording();
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('error', 'Microphone recording is not available in this environment.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const chunks = [];

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(input));
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    state.voiceRecorder = {
      stream,
      audioContext,
      source,
      processor,
      chunks,
      sampleRate: audioContext.sampleRate,
      startedAt: Date.now(),
    };
    state.isVoiceRecording = true;
    setInputEnabled(false);
    updateVoiceButtonState();
    showToast('info', 'Recording voice. Press the microphone again to stop.');
  } catch (err) {
    showToast('error', `Microphone access failed: ${err.message}`);
    cleanupVoiceRecorder();
    updateVoiceButtonState();
  }
}

async function stopVoiceRecordingAndSend() {
  const recorder = state.voiceRecorder;
  if (!recorder) return;

  state.isVoiceRecording = false;
  state.isVoiceTranscribing = true;
  updateVoiceButtonState();

  cleanupVoiceRecorder();

  try {
    if (Date.now() - recorder.startedAt < 500 || recorder.chunks.length === 0) {
      throw new Error('Recording was too short.');
    }

    const wavBlob = encodeWavBlob(recorder.chunks, recorder.sampleRate);
    if (wavBlob.size <= 44) throw new Error('Recording did not capture audio.');

    if (!state.currentSessionId) state.pendingWorkspacePath = state.workspacePath;
    showToast('info', 'Transcribing voice...');
    state.isStreaming = true;
    const result = await state.ws.sendVoice(wavBlob, { fileName: 'voice.wav' });
    if (result.transcript) addMessageBubble('user', result.transcript);
    onDone(result);
  } catch (err) {
    state.isStreaming = false;
    setInputEnabled(true);
    showToast('error', `Voice input failed: ${err.message}`);
  } finally {
    state.isVoiceTranscribing = false;
    updateVoiceButtonState();
  }
}

function cleanupVoiceRecorder() {
  const recorder = state.voiceRecorder;
  if (!recorder) return;
  try { recorder.processor.disconnect(); } catch {}
  try { recorder.source.disconnect(); } catch {}
  try { recorder.audioContext.close(); } catch {}
  recorder.stream.getTracks().forEach(track => track.stop());
  state.voiceRecorder = null;
}

function encodeWavBlob(chunks, sampleRate) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let position = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(position, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    position += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function updateVoiceButtonState() {
  const btn = $('#btn-voice');
  if (!btn) return;
  const textarea = $('#message-input');
  const blockedByContent = Boolean(textarea.value.trim() || state.attachments.length > 0);
  const voice = state.serverConfig?.voice || {};
  const isSetup = Boolean(voice.groqApiKey && voice.model);
  const isEnabled = voice.enabled !== false;
  const canStart = !state.isStreaming
    && !state.isVoiceTranscribing
    && !blockedByContent
    && isEnabled;
  btn.disabled = state.isVoiceRecording ? false : !canStart;
  btn.classList.toggle('recording', state.isVoiceRecording);
  btn.classList.toggle('busy', state.isVoiceTranscribing);
  btn.classList.toggle('needs-setup', !isSetup && isEnabled && !blockedByContent);
  btn.title = state.isVoiceRecording
    ? 'Stop recording'
    : (state.isVoiceTranscribing
      ? 'Transcribing voice...'
      : (blockedByContent
        ? 'Clear the message to record voice'
        : (!isEnabled ? 'Voice is disabled in Settings' : (!isSetup ? 'Set up voice in Settings' : 'Record voice message'))));
  btn.setAttribute('aria-label', btn.title);
}

function sendMessage() {
  const textarea = $('#message-input');
  const text = textarea.value.trim();
  if ((!text && state.attachments.length === 0) || state.isStreaming) return;
  if (!state.currentSessionId) state.pendingWorkspacePath = state.workspacePath;

  const attachments = state.attachments.map(a => ({ path: a.path }));
  const attachmentLabel = attachments.length
    ? `\n\n${attachments.map(a => `Attached: ${a.path.split(/[\\/]/).pop()}`).join('\n')}`
    : '';
  addMessageBubble('user', (text || 'Attachment context') + attachmentLabel);
  state.ws.sendChat(text, attachments);
  textarea.value = '';
  textarea.style.height = 'auto';
  state.attachments = [];
  renderAttachmentChips();
  setInputEnabled(false);
}

function setInputEnabled(enabled) {
  $('#message-input').disabled = !enabled;
  $('#btn-send').disabled = !enabled;
  const attachBtn = $('#btn-add-attachment');
  if (attachBtn) attachBtn.disabled = !enabled;
  updateVoiceButtonState();
}

// ── Dropdowns ──
function setupDropdowns() {
  // Permission mode dropdown
  const modePanel = $('#mode-panel');
  PERMISSION_MODES.forEach(m => {
    const item = document.createElement('div');
    item.className = `dropdown-item${m.id === state.permMode ? ' active' : ''}`;
    item.innerHTML = `${iconHtml(m.icon)} ${m.label} <span style="color:var(--text-muted);font-size:11px;margin-left:auto">${m.desc}</span>`;
    item.addEventListener('click', () => setPermMode(m.id));
    modePanel.appendChild(item);
  });

  $('#mode-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    modePanel.classList.toggle('open');
  });

  const operatingPanel = $('#operating-mode-panel');
  OPERATING_MODES.forEach(m => {
    const item = document.createElement('div');
    item.className = `dropdown-item${m.id === state.operatingMode ? ' active' : ''}`;
    item.textContent = m.label;
    item.addEventListener('click', () => setOperatingMode(m.id));
    operatingPanel.appendChild(item);
  });

  $('#operating-mode-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    operatingPanel.classList.toggle('open');
  });

  // Model selector dropdown
  $('#model-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    renderModelPanel();
    $('#model-panel').classList.toggle('open');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);
  updateModeTrigger();
  updateOperatingModeTrigger();
  updateModelTrigger();
}

function closeAllDropdowns() {
  $$('.dropdown-panel').forEach(p => p.classList.remove('open'));
}

function setPermMode(mode) {
  state.permMode = mode;
  closeAllDropdowns();
  updateModeTrigger();
  if (mode === 'yolo') {
    state.ws.updateConfig({ yolo: true, useBananaGuard: false }, true);
    showToast('warning', 'Full access enabled. All commands are auto-approved.');
  } else if (mode === 'guard') {
    state.ws.updateConfig({ yolo: false, useBananaGuard: true }, true);
  } else {
    state.ws.updateConfig({ yolo: false, useBananaGuard: false }, true);
  }
}

function updateModeTrigger() {
  const m = PERMISSION_MODES.find(p => p.id === state.permMode) || PERMISSION_MODES[1];
  $('#mode-icon').innerHTML = iconHtml(m.icon);
  $('#mode-label').textContent = m.label;
  // Update active state in panel
  $$('#mode-panel .dropdown-item').forEach((el, i) => {
    el.classList.toggle('active', PERMISSION_MODES[i].id === state.permMode);
  });
}

function updateOperatingModeFromConfig(config = {}) {
  if (config.skillCreatorMode) state.operatingMode = 'skill_creator';
  else if (config.deepReviewMode === 'full') state.operatingMode = 'deepreview_full';
  else if (config.deepReviewMode === 'diff') state.operatingMode = 'deepreview_diff';
  else if (config.securityMode) state.operatingMode = 'security';
  else if (config.askMode) state.operatingMode = 'ask';
  else if (config.planMode) state.operatingMode = 'plan';
  else state.operatingMode = 'agent';
}

function operatingModeConfig(mode) {
  const base = {
    planMode: false,
    askMode: false,
    securityMode: false,
    deepReviewMode: false,
    skillCreatorMode: false,
  };
  if (mode === 'plan') base.planMode = true;
  if (mode === 'ask') base.askMode = true;
  if (mode === 'security') base.securityMode = true;
  if (mode === 'deepreview_full') base.deepReviewMode = 'full';
  if (mode === 'deepreview_diff') base.deepReviewMode = 'diff';
  if (mode === 'skill_creator') base.skillCreatorMode = true;
  return base;
}

function setOperatingMode(mode) {
  state.operatingMode = mode;
  closeAllDropdowns();
  updateOperatingModeTrigger();
  state.ws.updateConfig(operatingModeConfig(mode), true);
}

function updateOperatingModeTrigger() {
  const mode = OPERATING_MODES.find(m => m.id === state.operatingMode) || OPERATING_MODES[0];
  const label = $('#operating-mode-label');
  if (label) label.textContent = mode.label;
  $$('#operating-mode-panel .dropdown-item').forEach((el, i) => {
    el.classList.toggle('active', OPERATING_MODES[i].id === state.operatingMode);
  });
}

function renderModelPanel() {
  const panel = $('#model-panel');
  let html = '<div class="provider-tabs">';
  PROVIDERS.forEach(p => {
    html += `<div class="provider-tab${p.id === state.currentProvider ? ' active' : ''}" data-prov="${p.id}">${providerLogoHtml(p, 'provider-logo provider-logo-tab')} ${p.name.split(' ')[0]}</div>`;
  });
  html += '</div><div id="model-list"></div>';
  panel.innerHTML = html;
  panel.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderModelList(tab.dataset.prov);
    });
  });
  renderModelList(state.currentProvider);
}

function renderModelList(providerId) {
  const list = $('#model-list');
  const models = PROVIDER_MODELS[providerId] || [];
  let html = '';
  if (providerId === 'openrouter') {
    html = `<div style="padding:12px"><input type="text" id="or-model-input" placeholder="Enter model ID..." style="width:100%;padding:8px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-family:var(--font-mono);font-size:12px;outline:none" value="${providerId === state.currentProvider ? state.currentModel : ''}">
    <button onclick="document.dispatchEvent(new CustomEvent('or-model-set'))" style="margin-top:8px;padding:6px 14px;background:var(--accent);border:none;border-radius:6px;color:var(--text-inverse);cursor:pointer;font-size:12px">Set Model</button></div>`;
  } else if (providerId === 'ollama' || providerId === 'lmstudio') {
    // Render a loading state, then fetch
    html = `<div id="dynamic-model-list-${providerId}" style="padding:12px;color:var(--text-muted);font-size:12px">⏳ Detecting local models...</div>`;
    
    // Asynchronously fetch and inject
    setTimeout(async () => {
      let fetchedModels = [];
      try {
        if (providerId === 'ollama') {
          const res = await fetch('http://localhost:11434/api/tags');
          const data = await res.json();
          fetchedModels = data.models.map(m => ({ label: m.name, value: m.name }));
        } else if (providerId === 'lmstudio') {
          const baseUrl = state.config?.lmStudioBaseUrl || 'http://localhost:1234/v1';
          const res = await fetch(`${baseUrl}/models`);
          const data = await res.json();
          fetchedModels = data.data.map(m => ({ label: m.id, value: m.id }));
        }
      } catch (e) {
        // Failed to fetch
      }
      
      const container = document.getElementById(`dynamic-model-list-${providerId}`);
      if (!container) return; // panel closed or switched
      
      if (fetchedModels.length === 0) {
        container.innerHTML = `<span style="color:#ff6b6b">✗ Could not detect models. Is ${providerId === 'ollama' ? 'Ollama' : 'LM Studio'} running?</span>`;
      } else {
        container.style.padding = '0';
        container.innerHTML = fetchedModels.map(m => {
          const active = m.value === state.currentModel && providerId === state.currentProvider;
          return `<div class="dropdown-item${active ? ' active' : ''}" data-model="${m.value}" data-prov="${providerId}">${m.label}</div>`;
        }).join('');
        
        // Re-attach listeners to the new items
        container.querySelectorAll('.dropdown-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectModel(item.dataset.prov, item.dataset.model);
          });
        });
      }
    }, 10);
  } else if (models.length === 0) {
    html = '<div style="padding:12px;color:var(--text-muted);font-size:12px">No models configured</div>';
  } else {
    models.forEach(m => {
      const active = m.value === state.currentModel && providerId === state.currentProvider;
      html += `<div class="dropdown-item${active ? ' active' : ''}" data-model="${m.value}" data-prov="${providerId}">${m.label}</div>`;
    });
  }
  // Provider reasoning controls
  if (providerId === 'claude') {
    const selectedEffort = state.serverConfig?.claudeEffort || 'medium';
    const allowedEfforts = getClaudeEfforts(state.currentModel);
    html += `<div class="claude-controls">
      <label>Reasoning Effort</label>
      <div class="reasoning-selector">
        ${allowedEfforts.map(k =>
          `<button class="reasoning-btn${selectedEffort === k ? ' active' : ''}" data-level="${k}">${REASONING_LEVELS[k].label}</button>`
        ).join('')}
      </div>
      <label style="margin-top:8px">Prompt Cache</label>
      <div class="reasoning-selector">
        <button class="reasoning-btn cache-btn${!state.serverConfig?.useExtendedCache ? ' active' : ''}" data-cache="false">5 min</button>
        <button class="reasoning-btn cache-btn${state.serverConfig?.useExtendedCache ? ' active' : ''}" data-cache="true">1 hour</button>
      </div>
    </div>`;
  } else if (providerId === 'openai_oauth') {
    const selectedEffort = state.serverConfig?.openaiCodexEffort || 'medium';
    html += `<div class="claude-controls">
      <label>Reasoning Effort</label>
      <div class="reasoning-selector">
        ${['low', 'medium', 'high', 'xhigh'].map(k =>
          `<button class="reasoning-btn${selectedEffort === k ? ' active' : ''}" data-level="${k}">${REASONING_LEVELS[k].label}</button>`
        ).join('')}
      </div>
    </div>`;
  }
  list.innerHTML = html;
  // Attach model click handlers
  list.querySelectorAll('.dropdown-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectModel(el.dataset.prov, el.dataset.model);
    });
  });
  // Claude reasoning
  list.querySelectorAll('.reasoning-btn:not(.cache-btn)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.querySelectorAll('.reasoning-btn:not(.cache-btn)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (providerId === 'claude') {
        state.ws.updateConfig({ claudeEffort: btn.dataset.level }, true);
      } else if (providerId === 'openai_oauth') {
        state.ws.updateConfig({ provider: 'openai', authType: 'oauth', openaiCodexEffort: btn.dataset.level }, true);
      }
    });
  });
  list.querySelectorAll('.cache-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      list.querySelectorAll('.cache-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.ws.updateConfig({ useExtendedCache: btn.dataset.cache === 'true' });
    });
  });
  // OpenRouter custom
  document.addEventListener('or-model-set', () => {
    const v = document.getElementById('or-model-input')?.value?.trim();
    if (v) selectModel('openrouter', v);
  }, { once: true });
}

function selectModel(provider, model) {
  const prov = PROVIDERS.find(p => p.id === provider);
  let apiKey = undefined;
  
  if (prov?.needsKey || prov?.needsOAuth) {
    if (prov?.needsKey) apiKey = localStorage.getItem(`apikey_${provider}`);
    
    let isCurrentProvider = false;
    if (provider === 'openai_oauth') {
      isCurrentProvider = state.serverConfig?.provider === 'openai' && state.serverConfig?.authType === 'oauth';
    } else if (provider === 'openai') {
      isCurrentProvider = state.serverConfig?.provider === 'openai' && state.serverConfig?.authType !== 'oauth';
    } else {
      isCurrentProvider = provider === state.serverConfig?.provider;
    }
    
    if (!isCurrentProvider && (prov?.needsOAuth || !apiKey)) {
      // Missing API key or needs OAuth login for new provider! Prompt user.
      closeAllDropdowns();
      openSettings();
      setActiveSettingsTab('provider');
      showToast('info', prov?.needsOAuth ? `Please sign in to ${prov.name}` : `Please enter your API key for ${prov.name}`);
      
      // Auto-select the provider in settings
      setTimeout(() => {
        const grid = $('#settings-provider-grid');
        const card = Array.from(grid?.querySelectorAll('.provider-card') || []).find(c => c.dataset.prov === provider);
        if (card) card.click();
      }, 50);
      return;
    }
  }

  state.currentProvider = provider;
  state.currentModel = model;
  const configUpdate = { provider, model };
  if (apiKey) configUpdate.apiKey = apiKey;
  
  if (provider === 'openai_oauth') {
    configUpdate.provider = 'openai';
    configUpdate.authType = 'oauth';
  } else if (provider === 'openai') {
    configUpdate.authType = 'api_key';
  } else {
    configUpdate.authType = null; // Clear oauth flag for other providers
  }
  
  state.ws.updateConfig(configUpdate, true);
  updateModelTrigger();
  closeAllDropdowns();
}

function updateModelTrigger() {
  const p = PROVIDERS.find(pr => pr.id === state.currentProvider);
  $('#model-icon').innerHTML = providerLogoHtml(p, 'provider-logo provider-logo-trigger');
  $('#model-label').textContent = state.currentModel === 'auto' ? 'Auto Mode' : state.currentModel;
}

function getClaudeEfforts(model = '') {
  const efforts = ['low', 'medium', 'high'];
  const supportsExtended = /opus|sonnet|4-6|4-7/i.test(model || '');
  return supportsExtended ? [...efforts, 'xhigh', 'max'] : efforts;
}

// ── Permission Modal ──
function setupPermissionModal() {
  $('#btn-perm-allow').addEventListener('click', () => respondPermission(true, false));
  $('#btn-perm-always').addEventListener('click', () => respondPermission(true, true));
  $('#btn-perm-deny').addEventListener('click', () => respondPermission(false, false));
}

function onPermissionRequested(req) {
  state.permissionQueue.push(req);
  if (!state.currentPermission) showNextPermission();
}

function showNextPermission() {
  if (state.permissionQueue.length === 0) {
    $('#permission-modal').classList.add('hidden');
    state.currentPermission = null;
    return;
  }
  state.currentPermission = state.permissionQueue.shift();
  $('#permission-action').textContent = state.currentPermission.action;
  $('#permission-details').textContent = state.currentPermission.details;
  $('#permission-modal').classList.remove('hidden');
}

function respondPermission(allowed, session) {
  if (!state.currentPermission) return;
  state.ws.respondPermission(state.currentPermission.ticketId, allowed, session);
  state.currentPermission = null;
  showNextPermission();
}

// ── Toolbar ──
function setupToolbar() {
  const chooseWorkspaceFromDialog = async () => {
    const dir = await window.studioAPI.openDirectoryDialog();
    if (dir) {
      addRecentWorkspace(dir);
      state.ws.setWorkspace(dir);
      closeAllDropdowns();
    }
  };
  const selectWorkspace = (dir) => {
    addRecentWorkspace(dir);
    state.ws.setWorkspace(dir);
    closeAllDropdowns();
  };

  const workspacePill = $('#workspace-pill');
  const workspacePanel = $('#workspace-panel');

  workspacePill.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllDropdowns();
    renderWorkspacePanel();
    workspacePanel.classList.toggle('open');
  });
  workspacePanel.addEventListener('click', (e) => e.stopPropagation());
  workspacePanel.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-workspace]');
    if (deleteBtn) {
      removeRecentWorkspace(deleteBtn.dataset.deleteWorkspace);
      return;
    }

    const item = e.target.closest('[data-workspace-path]');
    if (item) {
      selectWorkspace(item.dataset.workspacePath);
      return;
    }

    if (e.target.closest('[data-browse-workspace]')) chooseWorkspaceFromDialog();
  });

  $('#btn-init').addEventListener('click', () => { state.ws.initProject(); showToast('info', 'Generating BANANA.md...'); });
  $('#btn-compress').addEventListener('click', () => { state.ws.cleanContext(); showToast('info', 'Compressing context...'); });
  $('#btn-clear').addEventListener('click', () => { state.ws.clearHistory(); });
}

function renderWorkspacePanel() {
  const panel = $('#workspace-panel');
  const activePath = normalizeWorkspacePath(state.workspacePath);
  const recent = readRecentWorkspaces();

  let html = '<div class="dropdown-label">Folders</div>';
  if (recent.length === 0) {
    html += '<div class="workspace-empty">No saved folders</div>';
  } else {
    html += recent.map(path => {
      const active = normalizeWorkspacePath(path) === activePath;
      return `<div class="workspace-item${active ? ' active' : ''}" data-workspace-path="${escapeAttr(path)}" title="${escapeAttr(path)}">
        <div class="workspace-item-text">
          <span class="workspace-item-name">${escapeHtml(folderName(path))}</span>
          <span class="workspace-item-path">${escapeHtml(path)}</span>
        </div>
        <button class="workspace-delete" type="button" data-delete-workspace="${escapeAttr(path)}" title="Remove from list" aria-label="Remove ${escapeAttr(folderName(path))} from list">×</button>
      </div>`;
    }).join('');
  }

  html += '<div class="dropdown-separator"></div>';
  html += `<button class="workspace-browse" type="button" data-browse-workspace>
    <span class="workspace-icon">${iconHtml('folder')}</span>
    <span>Browse for folder...</span>
  </button>`;
  panel.innerHTML = html;
}

// ── Settings Panel ──
let settingsMemories = [];
let currentSettingsTab = 'connection';

function setupSettings() {
  $('#btn-open-settings').addEventListener('click', openSettings);
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#settings-overlay').addEventListener('click', closeSettings);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select')) closeCustomSelects();
  });

  $$('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSettingsTab(tab.dataset.tab);
    });
  });
}

function openSettings() {
  $('#settings-overlay').classList.add('open');
  $('#settings-panel').classList.add('open');
  setActiveSettingsTab(currentSettingsTab || 'connection');
}

function closeSettings() {
  $('#settings-overlay').classList.remove('open');
  $('#settings-panel').classList.remove('open');
}

function setActiveSettingsTab(tab) {
  currentSettingsTab = tab;
  $$('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderSettingsTab(tab);
}

function renderSettingsTab(tab) {
  currentSettingsTab = tab;
  closeCustomSelects();
  const body = $('#settings-body');
  const title = $('#settings-page-title');
  const activeTab = Array.from($$('.settings-tab')).find(t => t.dataset.tab === tab);
  if (title) title.textContent = activeTab?.textContent || 'Settings';
  if (tab === 'connection') {
    body.innerHTML = `<div class="settings-section"><h3>Server Connection</h3>
      <div class="settings-field"><label>Server URL</label>
        <input type="text" id="settings-url" value="${state.config?.serverUrl || 'ws://127.0.0.1:3000'}"></div>
      <div class="settings-field"><label>API Token</label>
        <input type="password" id="settings-token" value="${state.config?.token || ''}"></div>
      <button class="btn-settings-action" id="btn-save-connection">Save & Reconnect</button></div>`;
    $('#btn-save-connection').addEventListener('click', async () => {
      const newConfig = { serverUrl: $('#settings-url').value, token: $('#settings-token').value };
      await window.studioAPI.writeStudioConfig(newConfig);
      state.config = newConfig;
      state.ws.disconnect();
      state.ws.connect(newConfig.serverUrl, newConfig.token);
      closeSettings();
      showToast('success', 'Connection updated');
    });
  } else if (tab === 'voice') {
    const voice = state.serverConfig?.voice || {};
    const configured = Boolean(voice.groqApiKey && voice.model);
    const enabled = voice.enabled !== false;
    body.innerHTML = `<div class="settings-section"><h3>Voice Input</h3>
      <div class="toggle-container"><span class="toggle-label">Enable microphone transcription</span>
        <div class="toggle${enabled ? ' active' : ''}" id="toggle-voice"></div></div>
      <div class="settings-field"><label>Groq API Key</label>
        <input type="password" id="voice-groq-key" placeholder="gsk_..." value="${escapeAttr(voice.groqApiKey || '')}"></div>
      <div class="settings-field"><label>Whisper Model</label>
        ${customSelectHtml('voice-model', VOICE_MODELS, voice.model || 'whisper-large-v3-turbo')}</div>
      <div class="test-result ${configured ? 'success' : 'warning'}">${configured ? 'Voice is configured on the Banana Code server.' : 'Add a Groq API key and save to finish setup.'}</div>
      <button class="btn-settings-action" id="btn-save-voice" style="width:100%;margin-top:14px">Save Voice Settings</button>
    </div>`;
    initCustomSelects(body);
    $('#toggle-voice').addEventListener('click', () => {
      $('#toggle-voice').classList.toggle('active');
    });
    $('#btn-save-voice').addEventListener('click', () => {
      const groqApiKey = $('#voice-groq-key').value.trim();
      const model = $('#voice-model').value || 'whisper-large-v3-turbo';
      const nextVoice = {
        ...voice,
        enabled: $('#toggle-voice').classList.contains('active'),
        groqApiKey,
        model,
      };

      if (nextVoice.enabled && !groqApiKey) {
        showToast('error', 'Groq API key is required to enable voice input.');
        return;
      }

      state.ws.updateConfig({ voice: nextVoice }, true);
      showToast('success', nextVoice.enabled ? 'Voice settings saved' : 'Voice input disabled');
    });
  } else if (tab === 'imagegen') {
    const imageGen = getImageGenConfig();
    const enabled = imageGen.enabled === true;
    const realtimeProgress = imageGen.realtimeProgress !== false;
    const baseUrl = imageGen.baseUrl || DEFAULT_IMAGEGEN_BASE_URL;
    const discoveredModels = state.imageGenModels?.baseUrl === baseUrl && Array.isArray(state.imageGenModels.models)
      ? state.imageGenModels.models
      : [];
    body.innerHTML = `<div class="settings-section"><h3>Image Generation</h3>
      <div class="toggle-container"><span class="toggle-label">Enable image generation tool</span>
        <div class="toggle${enabled ? ' active' : ''}" id="toggle-imagegen"></div></div>
      <div class="settings-field"><label>ImageGen API Base URL</label>
        <input type="text" id="imagegen-base-url" value="${escapeAttr(baseUrl)}" placeholder="${DEFAULT_IMAGEGEN_BASE_URL}"></div>
      <div class="settings-field"><label>Default Image Model</label>
        <input type="text" id="imagegen-model" value="${escapeAttr(imageGen.model || '')}" placeholder="sd35_medium">
        <div class="imagegen-model-list" id="imagegen-model-list">
          ${discoveredModels.map(model => `<button class="imagegen-model-choice${model === imageGen.model ? ' active' : ''}" type="button" data-model="${escapeAttr(model)}">${escapeHtml(model)}</button>`).join('')}
        </div>
      </div>
      <button class="btn-settings-action secondary" id="btn-discover-imagegen" type="button">Detect Models</button>
    </div>
    <div class="settings-section"><h3>Advanced</h3>
      <div class="toggle-container"><span class="toggle-label">Show live generation steps and previews</span>
        <div class="toggle${realtimeProgress ? ' active' : ''}" id="toggle-imagegen-realtime"></div></div>
      <div class="test-result ${enabled ? 'success' : 'warning'}">${enabled ? 'When enabled, the AI can call generate_image from chat.' : 'Image generation is disabled until you turn it on and save.'}</div>
      <button class="btn-settings-action" id="btn-save-imagegen" style="width:100%;margin-top:14px">Save ImageGen Settings</button>
    </div>`;

    $('#toggle-imagegen').addEventListener('click', () => $('#toggle-imagegen').classList.toggle('active'));
    $('#toggle-imagegen-realtime').addEventListener('click', () => $('#toggle-imagegen-realtime').classList.toggle('active'));
    wireImageGenModelChoiceHandlers(body);
    $('#btn-discover-imagegen').addEventListener('click', () => {
      const nextBaseUrl = $('#imagegen-base-url').value.trim() || DEFAULT_IMAGEGEN_BASE_URL;
      state.ws.listImageGenModels(nextBaseUrl);
      showToast('info', 'Detecting ImageGen models...');
    });
    $('#btn-save-imagegen').addEventListener('click', () => {
      const nextConfig = {
        enabled: $('#toggle-imagegen').classList.contains('active'),
        baseUrl: $('#imagegen-base-url').value.trim() || DEFAULT_IMAGEGEN_BASE_URL,
        model: $('#imagegen-model').value.trim(),
        realtimeProgress: $('#toggle-imagegen-realtime').classList.contains('active'),
      };

      state.ws.setImageGen(nextConfig);
      showToast('info', nextConfig.enabled ? 'Saving ImageGen settings...' : 'Disabling ImageGen...');
    });
  } else if (tab === 'modes') {
    const isGuard = state.permMode === 'guard';
    const isYolo = state.permMode === 'yolo';
    body.innerHTML = `<div class="settings-section"><h3>Permission Mode</h3>
      <div class="toggle-container"><span class="toggle-label">${iconHtml('shield')} Banana Guard (Smart Auto-Approve)</span>
        <div class="toggle${isGuard ? ' active' : ''}" id="toggle-guard"></div></div>
      <div class="toggle-container"><span class="toggle-label">${iconHtml('unlocked')} Full access (Auto-Approve ALL)</span>
        <div class="toggle${isYolo ? ' active' : ''}" id="toggle-yolo"></div></div>
      ${isYolo ? '<div class="test-result error" style="margin-top:8px">Full access auto-approves ALL commands including destructive ones.</div>' : ''}
    </div>
    <div class="settings-section"><h3>Operating Mode</h3>
      <div class="mode-grid">
        ${OPERATING_MODES.map(mode => `<button class="mode-choice${state.operatingMode === mode.id ? ' active' : ''}" data-mode="${mode.id}" type="button">${mode.label}</button>`).join('')}
      </div>
    </div>`;
    $('#toggle-guard').addEventListener('click', () => { setPermMode(isGuard ? 'manual' : 'guard'); renderSettingsTab('modes'); });
    $('#toggle-yolo').addEventListener('click', () => { setPermMode(isYolo ? 'manual' : 'yolo'); renderSettingsTab('modes'); });
    body.querySelectorAll('.mode-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        setOperatingMode(btn.dataset.mode);
        renderSettingsTab('modes');
      });
    });
  } else if (tab === 'settings') {
    const settings = [
      ['autoFeedWorkspace', 'Auto-feed workspace files'],
      ['useMarkedTerminal', 'CLI markdown highlighting'],
      ['usePatchFile', 'Patch file tool'],
      ['showTokenCount', 'Show token count'],
      ['useMemory', 'Memory tools'],
      ['useBananaGuard', 'Banana Guard'],
      ['useExtendedCache', 'Extended prompt cache'],
      ['useUltraMemory', 'UltraMemory background scan'],
    ];
    body.innerHTML = `<div class="settings-section"><h3>Feature Settings</h3>
      ${settings.map(([key, label]) => `<div class="toggle-container"><span class="toggle-label">${label}</span>
        <div class="toggle${state.serverConfig?.[key] ? ' active' : ''}" data-setting="${key}"></div></div>`).join('')}
      <div class="test-result warning">UltraMemory can significantly increase API usage and cost.</div>
    </div>`;
    body.querySelectorAll('[data-setting]').forEach(toggle => {
      toggle.addEventListener('click', () => {
        const key = toggle.dataset.setting;
        const next = !state.serverConfig?.[key];
        if (key === 'useUltraMemory' && next) {
          const ok = window.confirm('UltraMemory scans chats in the background using AI and can significantly increase API usage and cost. Enable it?');
          if (!ok) return;
        }
        state.ws.updateConfig({ [key]: next }, true);
      });
    });
  } else if (tab === 'provider') {
    const prov = PROVIDERS.find(p => p.id === state.currentProvider);
    body.innerHTML = `<div class="settings-section"><h3>Current Provider</h3>
      <p class="current-provider-line">${providerLogoHtml(prov, 'provider-logo provider-logo-inline')} ${prov?.name || state.currentProvider} — ${state.currentModel}</p>
      <div class="provider-grid" id="settings-provider-grid"></div>
      <div id="settings-provider-form" style="margin-top:16px"></div>
    </div>`;
    const grid = $('#settings-provider-grid');
    PROVIDERS.forEach(p => {
      const card = document.createElement('div');
      card.className = `provider-card${p.id === state.currentProvider ? ' selected' : ''}`;
      card.dataset.prov = p.id;
      card.innerHTML = `${providerLogoHtml(p, 'provider-logo provider-logo-card')}<span class="provider-name">${p.name}</span>`;
      card.addEventListener('click', () => {
        grid.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        renderProviderSettingsForm(p.id);
      });
      grid.appendChild(card);
    });
    // Render the form for the currently selected provider card
    renderProviderSettingsForm(state.currentProvider);
  } else if (tab === 'beta') {
    body.innerHTML = `<div class="settings-section"><h3>Beta Manager</h3>
      <div id="beta-features-list"><p style="color:var(--text-muted);font-size:12px">Loading...</p></div>
      <div class="test-result warning">DuckDuckGo Scrape uses the DuckDuckGo Lite HTML site and may be rate limited.</div>
      <button class="btn-settings-action" id="btn-save-beta" style="width:100%;margin-top:12px">Save Beta Features</button>
    </div>`;
    state.ws.listBetaFeatures();
    $('#btn-save-beta').addEventListener('click', () => {
      const selected = Array.from(body.querySelectorAll('[data-beta-feature].active')).map(el => el.dataset.betaFeature);
      if (selected.includes('duck_duck_go_scrape') && !(state.serverConfig?.betaTools || []).includes('duck_duck_go_scrape')) {
        const ok = window.confirm('DuckDuckGo Scrape is not an official API, may violate terms, and may be rate limited. Enable it?');
        if (!ok) return;
      }
      state.ws.setBetaFeatures(selected);
    });
  } else if (tab === 'bananasplit') {
    const split = state.serverConfig?.bananaSplit || {};
    body.innerHTML = `<div class="settings-section"><h3>BananaSplit</h3>
      <div class="toggle-container"><span class="toggle-label">Enable BananaSplit</span>
        <div class="toggle${split.enabled ? ' active' : ''}" id="toggle-bananasplit"></div></div>
      <div class="settings-field"><label>Local Coding Provider</label>
        ${customSelectHtml('bs-local-provider', [{ value: 'ollama', label: 'Ollama' }, { value: 'lmstudio', label: 'LM Studio' }], split.local?.provider || 'ollama')}</div>
      <div class="settings-field"><label>Local Model</label>
        <input id="bs-local-model" value="${escapeAttr(split.local?.model || '')}" placeholder="local model name"></div>
      <div class="settings-field"><label>LM Studio URL</label>
        <input id="bs-lmstudio-url" value="${escapeAttr(split.local?.lmStudioBaseUrl || state.serverConfig?.lmStudioBaseUrl || 'http://localhost:1234/v1')}"></div>
      <div class="settings-field"><label>Reviewer Provider</label>
        ${customSelectHtml('bs-reviewer-provider', ['gemini', 'claude', 'openai', 'mistral', 'deepseek', 'kimi', 'openrouter', 'ollama_cloud'], split.reviewer?.provider || 'gemini')}</div>
      <div class="settings-field"><label>Reviewer Model</label>
        <input id="bs-reviewer-model" value="${escapeAttr(split.reviewer?.model || '')}" placeholder="reviewer model or auto"></div>
      <div class="settings-field"><label>Reviewer API Key</label>
        <input type="password" id="bs-reviewer-key" value="${escapeAttr(split.reviewer?.apiKey || '')}" placeholder="leave blank to use existing provider key"></div>
      <div class="settings-field"><label>OpenAI Auth Type</label>
        ${customSelectHtml('bs-openai-auth', [{ value: 'api_key', label: 'API key' }, { value: 'oauth', label: 'OAuth' }], split.reviewer?.authType === 'oauth' ? 'oauth' : 'api_key')}</div>
      <div class="settings-field"><label>OpenAI OAuth Effort</label>
        ${customSelectHtml('bs-openai-effort', ['low', 'medium', 'high', 'xhigh'], split.reviewer?.openaiCodexEffort || 'medium')}</div>
      <div class="settings-field"><label>Claude Effort</label>
        ${customSelectHtml('bs-claude-effort', ['low', 'medium', 'high', 'xhigh', 'max'], split.reviewer?.claudeEffort || 'medium')}</div>
      <div class="toggle-container"><span class="toggle-label">Reviewer Claude extended cache</span>
        <div class="toggle${split.reviewer?.useExtendedCache ? ' active' : ''}" id="bs-claude-cache"></div></div>
      <button class="btn-settings-action" id="btn-save-bananasplit" style="width:100%;margin-top:12px">Save BananaSplit</button>
    </div>`;
    initCustomSelects(body);
    let reviewerCache = !!split.reviewer?.useExtendedCache;
    $('#bs-claude-cache').addEventListener('click', () => {
      reviewerCache = !reviewerCache;
      $('#bs-claude-cache').classList.toggle('active', reviewerCache);
    });
    $('#toggle-bananasplit').addEventListener('click', () => {
      const enabled = !$('#toggle-bananasplit').classList.contains('active');
      $('#toggle-bananasplit').classList.toggle('active', enabled);
    });
    $('#btn-save-bananasplit').addEventListener('click', () => {
      const reviewerProvider = $('#bs-reviewer-provider').value;
      const config = {
        enabled: $('#toggle-bananasplit').classList.contains('active'),
        local: {
          provider: $('#bs-local-provider').value,
          model: $('#bs-local-model').value.trim(),
          lmStudioBaseUrl: $('#bs-lmstudio-url').value.trim(),
        },
        reviewer: {
          provider: reviewerProvider,
          model: $('#bs-reviewer-model').value.trim() || 'auto',
          apiKey: $('#bs-reviewer-key').value.trim() || undefined,
          authType: $('#bs-openai-auth').value,
          openaiCodexEffort: $('#bs-openai-effort').value,
          claudeEffort: $('#bs-claude-effort').value,
          useExtendedCache: reviewerCache,
        }
      };
      state.ws.setBananaSplit(config);
    });
  } else if (tab === 'status') {
    body.innerHTML = `<div class="settings-section"><h3>Context</h3>
      <button class="btn-settings-action" id="btn-refresh-context">Refresh Context</button>
      <div id="context-card" class="status-card"></div>
    </div>
    <div class="settings-section"><h3>Permissions</h3>
      <button class="btn-settings-action" id="btn-refresh-permissions">Refresh Permissions</button>
      <div id="permissions-card" class="status-card"></div>
    </div>`;
    $('#btn-refresh-context').addEventListener('click', () => state.ws.getContext());
    $('#btn-refresh-permissions').addEventListener('click', () => state.ws.listPermissions());
    renderContextCard();
    renderPermissionsCard();
  } else if (tab === 'memory') {
    body.innerHTML = `<div class="settings-section"><h3>Memories</h3>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <input type="text" id="memory-input" placeholder="Add a memory..." style="flex:1;padding:9px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text-primary);font-family:var(--font-ui);font-size:13px;outline:none">
        <button class="btn-settings-action" id="btn-add-memory">Add</button>
      </div>
      <div id="memories-list"><p style="color:var(--text-muted);font-size:12px">Loading...</p></div>
    </div>`;
    $('#btn-add-memory').addEventListener('click', () => {
      const fact = $('#memory-input').value.trim();
      if (fact) { state.ws.addMemory(fact); $('#memory-input').value = ''; }
    });
    state.ws.listMemories();
  }
}

function renderProviderSettingsForm(providerId) {
  const container = $('#settings-provider-form');
  if (!container) return;
  const provider = PROVIDERS.find(p => p.id === providerId);
  const models = PROVIDER_MODELS[providerId] || [];
  
  let html = '';
  // API Key field
  if (provider.needsKey) {
    const isCurrent = providerId === state.serverConfig?.provider || (providerId === 'openai_oauth' && state.serverConfig?.authType === 'oauth');
    const savedKey = localStorage.getItem(`apikey_${providerId}`) || '';
    const placeholder = isCurrent ? 'Leave blank to keep current server key' : 'Enter API key';
    const keyLabel = providerId === 'ollama_cloud' ? 'Ollama API Key' :
                     providerId === 'openrouter' ? 'OpenRouter API Key' :
                     providerId === 'mistral' ? 'Mistral API Key' :
                     providerId === 'deepseek' ? 'DeepSeek API Key' :
                     providerId === 'kimi' ? 'Moonshot API Key' :
                     'API Key';
    
    html += `
      <div class="settings-field">
        <label>${keyLabel}</label>
        <div class="password-wrapper">
          <input type="password" id="provider-setting-key" placeholder="${placeholder}" value="${savedKey}">
          <button class="password-toggle" onclick="this.previousElementSibling.type = this.previousElementSibling.type === 'password' ? 'text' : 'password'" type="button">👁️</button>
        </div>
      </div>`;
  }
  
  if (provider.needsOAuth) {
    html += `
      <div class="settings-field">
        <label>Authentication</label>
        <button type="button" id="btn-codex-login" class="btn-settings-action" style="background:#10a37f;color:#fff;border:none;">Sign in with ChatGPT (Codex)</button>
        <p id="codex-login-status" style="font-size:12px;margin-top:4px;color:var(--text-muted);"></p>
      </div>`;
  }

  if (providerId === 'claude') {
    const currentEffort = state.serverConfig?.claudeEffort || 'medium';
    html += `
      <div class="settings-field">
        <label>Reasoning Effort</label>
        ${customSelectHtml('provider-setting-claude-effort', getClaudeEfforts(state.currentModel), currentEffort)}
      </div>
      <div class="toggle-container"><span class="toggle-label">Extended prompt cache</span>
        <div class="toggle${state.serverConfig?.useExtendedCache ? ' active' : ''}" id="provider-setting-extended-cache"></div></div>`;
  }

  if (providerId === 'openai_oauth') {
    const currentEffort = state.serverConfig?.openaiCodexEffort || 'medium';
    html += `
      <div class="settings-field">
        <label>Reasoning Effort</label>
        ${customSelectHtml('provider-setting-openai-effort', ['low', 'medium', 'high', 'xhigh'], currentEffort)}
      </div>`;
  }

  // Model selector
  if (models.length > 0) {
    const currentModelVal = providerId === state.currentProvider ? state.currentModel : models[0].value;
    html += `
      <div class="settings-field">
        <label>Model</label>
        ${customSelectHtml('provider-setting-model', models, currentModelVal)}
      </div>`;
  } else if (providerId === 'openrouter') {
    html += `
      <div class="settings-field">
        <label>Model ID</label>
        <input type="text" id="provider-setting-model-text" placeholder="e.g. nvidia/nemotron-3-super-120b-a12b:free" value="${providerId === state.currentProvider ? state.currentModel : ''}">
      </div>`;
  } else {
    // For ollama/lmstudio, just a text input for manual override or a disabled note since auto-detect is in setup wizard
    html += `<div class="settings-field"><label>Model</label><input type="text" id="provider-setting-model-text" placeholder="Enter model name" value="${providerId === state.currentProvider ? state.currentModel : ''}"></div>`;
  }

  html += `<button class="btn-settings-action" id="btn-save-provider" style="width:100%; margin-top:8px;">Switch & Save Config</button>`;
  container.innerHTML = html;
  initCustomSelects(container);
  let extendedCache = !!state.serverConfig?.useExtendedCache;
  $('#provider-setting-extended-cache')?.addEventListener('click', () => {
    extendedCache = !extendedCache;
    $('#provider-setting-extended-cache').classList.toggle('active', extendedCache);
  });
  
  const loginBtn = $('#btn-codex-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      state.ws.send('trigger_codex_login');
      $('#codex-login-status').textContent = 'Requesting login...';
    });
  }

  $('#btn-save-provider').addEventListener('click', () => {
    const update = { provider: providerId };
    if (providerId === 'openai_oauth') {
      update.provider = 'openai';
      update.authType = 'oauth';
      update.openaiCodexEffort = $('#provider-setting-openai-effort')?.value || state.serverConfig?.openaiCodexEffort || 'medium';
    } else if (providerId === 'openai') {
      update.authType = 'api_key';
    } else {
      update.authType = null;
    }

    if (providerId === 'claude') {
      update.claudeEffort = $('#provider-setting-claude-effort')?.value || 'medium';
      update.useExtendedCache = extendedCache;
    }
    
    // Model
    const sel = $('#provider-setting-model');
    const txt = $('#provider-setting-model-text');
    if (sel) update.model = sel.value;
    else if (txt) update.model = txt.value.trim();
    
    // Key
    const keyInput = $('#provider-setting-key');
    if (keyInput) {
      const keyVal = keyInput.value.trim();
      if (keyVal) {
        update.apiKey = keyVal;
        localStorage.setItem(`apikey_${providerId}`, keyVal);
      } else if (providerId !== state.serverConfig?.provider) {
        // Switching to a new provider that needs a key, but none provided!
        showToast('error', 'API Key is required for ' + provider.name);
        return;
      }
    }
    
    state.ws.updateConfig(update, true);
    state.currentProvider = providerId;
    if (update.model) state.currentModel = update.model;
    updateModelTrigger();
    closeSettings();
    showToast('success', `Switched to ${provider.name}`);
  });
}

function onContextInfo(data) {
  state.contextInfo = data;
  renderContextCard();
  updateTokenBadge();
}

function onPermissionsList(permissions) {
  state.permissions = permissions || [];
  renderPermissionsCard();
}

function onBetaFeatures(data) {
  state.betaFeatures = data.features || [];
  renderBetaFeatureList();
}

function renderBetaFeatureList() {
  const list = $('#beta-features-list');
  if (!list) return;
  if (!state.betaFeatures.length) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No beta features available</p>';
    return;
  }
  list.innerHTML = state.betaFeatures.map(feature => `
    <div class="toggle-container">
      <span class="toggle-label">${escapeHtml(feature.label || feature.name)}</span>
      <div class="toggle${feature.enabled ? ' active' : ''}" data-beta-feature="${escapeAttr(feature.name)}" title="${escapeAttr(feature.description || '')}"></div>
    </div>`).join('');
  list.querySelectorAll('[data-beta-feature]').forEach(toggle => {
    toggle.addEventListener('click', () => toggle.classList.toggle('active'));
  });
}

function renderContextCard() {
  const card = $('#context-card');
  if (!card) return;
  const info = state.contextInfo;
  if (!info?.breakdown) {
    card.innerHTML = '<p>No context data loaded.</p>';
    return;
  }
  const breakdown = info.breakdown;
  const total = breakdown.total || breakdown.totalTokens || 0;
  const rows = [['system', 'system'], ['chat', 'chat'], ['tools', 'tool'], ['other', 'other']].map(([key, label]) => {
    const value = breakdown[key] || breakdown[`${key}Tokens`] || 0;
    const pct = total ? Math.round((value / total) * 100) : 0;
    return `<div class="status-row"><span>${label}</span><strong>${Number(value).toLocaleString()} (${pct}%)</strong></div>`;
  }).join('');
  const cost = info.cost || {};
  card.innerHTML = `<div class="status-row"><span>Total</span><strong>${Number(total).toLocaleString()}</strong></div>${rows}
    ${cost.cost || cost.totalCost ? `<div class="status-row"><span>Cost</span><strong>$${cost.cost || cost.totalCost}</strong></div>` : ''}
    ${cost.savings ? `<div class="status-row"><span>Savings</span><strong>$${cost.savings}</strong></div>` : ''}`;
}

function renderPermissionsCard() {
  const card = $('#permissions-card');
  if (!card) return;
  if (!state.permissions.length) {
    card.innerHTML = '<p>No session permissions approved.</p>';
    return;
  }
  card.innerHTML = `<ul class="permission-list">${state.permissions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
}

function updateTokenBadge() {
  const badge = $('#token-badge');
  if (!badge) return;
  const enabled = !!state.serverConfig?.showTokenCount;
  badge.classList.toggle('hidden', !enabled);
  if (!enabled) return;
  const breakdown = state.contextInfo?.breakdown;
  const total = breakdown?.total || breakdown?.totalTokens || 0;
  badge.textContent = `${Number(total).toLocaleString()} tokens`;
}

function onMemoriesList(memories) {
  settingsMemories = memories || [];
  const list = document.getElementById('memories-list');
  if (!list) return;
  if (!settingsMemories.length) { list.innerHTML = '<p style="color:var(--text-muted);font-size:12px">No memories stored</p>'; return; }
  list.innerHTML = settingsMemories.map((m, i) =>
    `<div class="memory-item"><span>${escapeHtml(typeof m === 'string' ? m : m.fact || JSON.stringify(m))}</span>
    <button class="memory-delete" data-idx="${i}" title="Delete">🗑️</button></div>`
  ).join('');
  list.querySelectorAll('.memory-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const mem = settingsMemories[btn.dataset.idx];
      const id = typeof mem === 'object' ? mem.id : btn.dataset.idx;
      state.ws.deleteMemory(id);
    });
  });
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', init);
