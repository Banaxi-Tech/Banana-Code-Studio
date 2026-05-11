// ═══════════════════════════════════════════════════════════
// Banana Code Studio — WebSocket Client
// ═══════════════════════════════════════════════════════════

export class WSClient {
  constructor() {
    this.ws = null;
    this.url = null;
    this.token = null;
    this.state = 'disconnected'; // disconnected | connecting | authenticating | connected | reconnecting
    this.listeners = {};
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 50;
    this.reconnectDelay = 3000;
    this.heartbeatTimer = null;
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error(`WSClient event error [${event}]:`, e); }
      });
    }
  }

  getHttpBaseUrl() {
    if (!this.url) return null;
    return this.url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
  }

  async sendVoice(audioBlob, { text = '', fileName = 'voice.wav' } = {}) {
    const httpUrl = this.getHttpBaseUrl();
    if (!httpUrl) throw new Error('Not connected to Banana Code API');

    const form = new FormData();
    form.append('file', audioBlob, fileName);
    if (text.trim()) form.append('text', text.trim());

    const url = new URL('/api/voice', httpUrl);
    if (this.token) url.searchParams.set('token', this.token);

    const response = await fetch(url, {
      method: 'POST',
      body: form,
    });

    const bodyText = await response.text();
    let payload = {};
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      payload = { error: bodyText };
    }

    if (!response.ok) {
      throw new Error(payload?.error || response.statusText || 'Voice transcription failed');
    }

    return payload;
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit('stateChange', newState);
    }
  }

  connect(url, token) {
    this.url = url;
    this.token = token;
    this.reconnectAttempts = 0;
    this._doConnect();
  }

  _doConnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      try { this.ws.close(); } catch (e) {}
    }

    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error('WebSocket creation failed:', e);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected, authenticating...');
      this.setState('authenticating');
      this.send('auth', { token: this.token });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._handleMessage(data);
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Connection closed (code: ${event.code})`);
      this._stopHeartbeat();
      if (event.code === 1008) {
        // Auth failure — don't reconnect
        this.setState('disconnected');
        this.emit('authFailure', 'Authentication failed');
        return;
      }
      this._scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'auth_success':
        console.log('[WS] Authenticated successfully');
        this.setState('connected');
        this.reconnectAttempts = 0;
        this._startHeartbeat();
        this.emit('connected');
        break;

      case 'error':
        this.emit('error', data.message);
        break;

      case 'chunk':
        this.emit('chunk', data.content);
        break;

      case 'tool_start':
        this.emit('toolStart', data.tool);
        break;

      case 'tool_end':
        this.emit('toolEnd', data.result);
        break;

      case 'session_started':
        this.emit('sessionStarted', {
          sessionId: data.sessionId,
          title: data.title,
        });
        break;

      case 'done':
        this.emit('done', {
          finalResponse: data.finalResponse,
          usage: data.usage,
          sessionId: data.sessionId,
          generatedImages: data.generatedImages || [],
        });
        break;

      case 'permission_requested':
        this.emit('permissionRequested', {
          ticketId: data.ticketId,
          action: data.action,
          details: data.details,
        });
        break;

      case 'workspace_updated':
        this.emit('workspaceUpdated', data.path);
        break;

      case 'config_updated':
        this.emit('configUpdated', data.config);
        break;

      case 'sessions_list':
        this.emit('sessionsList', data.sessions);
        break;

      case 'session_loaded':
        this.emit('sessionLoaded', data);
        break;

      case 'session_deleted':
        this.emit('sessionDeleted', data);
        break;

      case 'history_cleared':
        this.emit('historyCleared');
        break;

      case 'init_complete':
        this.emit('initComplete', data.summary);
        break;

      case 'clean_complete':
        this.emit('cleanComplete', data);
        break;

      case 'memory_added':
        this.emit('memoryAdded', data);
        break;

      case 'memory_deleted':
        this.emit('memoryDeleted', data);
        break;

      case 'memories_list':
        this.emit('memoriesList', data.memories);
        break;

      case 'context_info':
        this.emit('contextInfo', data);
        break;

      case 'permissions_list':
        this.emit('permissionsList', data.permissions || []);
        break;

      case 'beta_features':
        this.emit('betaFeatures', data);
        break;

      case 'terminal_output':
        this.emit('terminalOutput', data);
        break;

      case 'codex_login_started':
        this.emit('codexLoginStarted', data.message);
        break;

      case 'codex_login_finished':
        this.emit('codexLoginFinished', data);
        break;

      case 'imagegen_models':
        this.emit('imagegenModels', data);
        break;

      case 'image_generation_progress':
        this.emit('imageGenerationProgress', data);
        break;

      case 'image_generation_result':
        this.emit('imageGenerationResult', data);
        break;

      case 'attachments_dropped':
        this.emit('attachmentsDropped', data.attachments || []);
        break;

      case 'browser_request':
        this.emit('browserRequest', {
          requestId: data.requestId,
          action: data.action,
          params: data.params || {},
        });
        break;

      default:
        console.log('[WS] Unknown message type:', data.type);
    }
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send — not connected');
      return false;
    }
    const msg = { type, ...payload };
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  // Convenience methods
  sendChat(text, attachments = [], browserElements = []) { return this.send('chat', { text, attachments, browserElements }); }
  setWorkspace(path) { return this.send('set_workspace', { path }); }
  updateConfig(config, save = false) { return this.send('update_config', { config, save }); }
  getContext() { return this.send('get_context'); }
  listPermissions() { return this.send('list_permissions'); }
  listBetaFeatures() { return this.send('list_beta_features'); }
  setBetaFeatures(features) { return this.send('set_beta_features', { features }); }
  setBananaSplit(config) { return this.send('set_banana_split', { config }); }
  listImageGenModels(baseUrl) { return this.send('list_imagegen_models', { baseUrl }); }
  setImageGen(config) { return this.send('set_imagegen', { config }); }
  listSessions() { return this.send('list_sessions'); }
  loadSession(sessionId) { return this.send('load_session', { sessionId }); }
  deleteSession(sessionId) { return this.send('delete_session', { sessionId }); }
  clearHistory() { return this.send('clear_history'); }
  initProject() { return this.send('init'); }
  cleanContext() { return this.send('clean'); }
  listMemories() { return this.send('list_memories'); }
  addMemory(fact) { return this.send('add_memory', { fact }); }
  deleteMemory(id) { return this.send('delete_memory', { id }); }
  respondPermission(ticketId, allowed, session = false) {
    return this.send('permission_response', { ticketId, allowed, session });
  }
  browserBridgeReady() { return this.send('browser_bridge_ready'); }
  respondBrowser(requestId, ok, payload = {}) {
    return this.send('browser_response', { requestId, ok, ...payload });
  }
  sendBrowserState(state) { return this.send('browser_state', { state }); }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.setState('disconnected');
  }

  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setState('disconnected');
      this.emit('error', 'Max reconnection attempts reached');
      return;
    }
    this.setState('reconnecting');
    const delay = Math.min(this.reconnectDelay * Math.pow(1.3, this.reconnectAttempts), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      console.log(`[WS] Reconnect attempt ${this.reconnectAttempts}...`);
      this._doConnect();
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // WebSocket API doesn't support ping frames from browser,
        // so we just check readyState periodically
      }
    }, 30000);
  }

  _stopHeartbeat() {
    clearInterval(this.heartbeatTimer);
  }
}
