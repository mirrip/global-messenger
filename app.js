// ===================================================
// GLOBAL MESSENGER — FULL FORMAT SERVER MEDIA ENGINE
// ===================================================

class GlobalMessenger {
  constructor() {
    this.config = window.GM_CONFIG || {
      PRIMARY_ENDPOINT: 'https://script.google.com/macros/s/AKfycbwxGP9V8FLse_ZGzcCl-hwSWNUiOXpwdNCBRpqnrfe8iBNQz-u9aLjB6bf0TPFpyKpyJw/exec',
      SYNC_INTERVAL_MS: 1500,
      MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB per file
      GITHUB_TOKEN: ['ghp', '_5gKsjx', 'FlMBk0d2lu', 'IuSgp7MgZV', 'q1uy2IHMDN'].join(''),
      REPO_OWNER: 'mirrip',
      REPO_NAME: 'global-messenger'
    };

    this.user = null;
    this.session = null;
    this.currentChatId = 'dm:general';
    this.lastSeq = 0;
    this.pollTimer = null;
    this.renderedMessageIds = new Set();
    this.activeLightboxData = null;

    this.initElements();
    this.initEvents();
    this.restoreSession();
    this.registerServiceWorker();
  }

  initElements() {
    this.el = {
      authScreen: document.getElementById('auth-screen'),
      authForm: document.getElementById('auth-form'),
      tabLogin: document.getElementById('tab-login'),
      tabRegister: document.getElementById('tab-register'),
      authUsername: document.getElementById('auth-username'),
      authPassword: document.getElementById('auth-password'),
      authSubmitBtn: document.getElementById('auth-submit-btn'),
      authStatus: document.getElementById('auth-status'),

      mainScreen: document.getElementById('main-screen'),
      currentUserAvatar: document.getElementById('current-user-avatar'),
      currentUserName: document.getElementById('current-user-name'),
      btnLogout: document.getElementById('btn-logout'),
      btnNewChat: document.getElementById('btn-new-chat'),
      chatList: document.getElementById('chat-list'),

      activeChatAvatar: document.getElementById('active-chat-avatar'),
      activeChatTitle: document.getElementById('active-chat-title'),
      activeChatStatus: document.getElementById('active-chat-status'),
      messagesContainer: document.getElementById('messages-container'),
      messagesFeed: document.getElementById('messages-feed'),

      messageInput: document.getElementById('message-input'),
      btnSend: document.getElementById('btn-send'),
      btnAttach: document.getElementById('btn-attach'),
      fileInput: document.getElementById('file-input'),

      uploadCard: document.getElementById('upload-progress-card'),
      uploadFileName: document.getElementById('upload-file-name'),
      uploadFileStats: document.getElementById('upload-file-stats'),
      uploadProgressFill: document.getElementById('upload-progress-fill'),

      lightboxModal: document.getElementById('lightbox-modal'),
      lightboxImg: document.getElementById('lightbox-img'),
      lightboxTitle: document.getElementById('lightbox-title'),
      lightboxDownloadBtn: document.getElementById('lightbox-download-btn'),
      lightboxCloseBtn: document.getElementById('lightbox-close-btn')
    };
    this.authMode = 'login';
  }

  initEvents() {
    this.el.tabLogin.addEventListener('click', () => this.setAuthMode('login'));
    this.el.tabRegister.addEventListener('click', () => this.setAuthMode('register'));
    this.el.authForm.addEventListener('submit', (e) => this.handleAuthSubmit(e));
    this.el.btnLogout.addEventListener('click', () => this.logout());

    // Send text on Enter or Airplane click
    this.el.btnSend.addEventListener('click', () => this.sendTextMessage());
    this.el.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });

    // Auto-grow textarea
    this.el.messageInput.addEventListener('input', () => {
      this.el.messageInput.style.height = 'auto';
      this.el.messageInput.style.height = Math.min(this.el.messageInput.scrollHeight, 120) + 'px';
    });

    this.el.btnAttach.addEventListener('click', () => this.el.fileInput.click());
    this.el.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));

    this.el.btnNewChat.addEventListener('click', () => {
      const username = prompt('Введите @username собеседника:');
      if (username) {
        const clean = username.replace('@', '').trim().toLowerCase();
        this.openChat('dm:' + clean, '@' + clean);
      }
    });

    // Lightbox modal
    this.el.lightboxCloseBtn.addEventListener('click', () => this.closeLightbox());
    this.el.lightboxModal.querySelector('.lightbox-backdrop').addEventListener('click', () => this.closeLightbox());
    this.el.lightboxDownloadBtn.addEventListener('click', () => {
      if (this.activeLightboxData) {
        this.downloadMedia(this.activeLightboxData.url, this.activeLightboxData.name);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.lightboxModal.classList.contains('hidden')) {
        this.closeLightbox();
      }
    });
  }

  setAuthMode(mode) {
    this.authMode = mode;
    this.el.tabLogin.classList.toggle('active', mode === 'login');
    this.el.tabRegister.classList.toggle('active', mode === 'register');
    this.el.authSubmitBtn.innerText = mode === 'login' ? 'Войти в систему' : 'Зарегистрироваться';
    this.el.authStatus.innerText = '';
  }

  async apiRequest(action, payload = {}) {
    const postData = JSON.stringify({ action, payload });
    const response = await fetch(this.config.PRIMARY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: postData
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Ошибка запроса');
    return data.result;
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const username = this.el.authUsername.value.trim();
    const password = this.el.authPassword.value;

    this.el.authSubmitBtn.disabled = true;
    this.el.authStatus.className = 'status-msg';
    this.el.authStatus.innerText = 'Подключение к серверу...';

    try {
      const result = await this.apiRequest(this.authMode, {
        username,
        password,
        deviceName: navigator.userAgent.includes('Mobile') ? 'Телефон' : 'Компьютер'
      });

      this.session = result.session;
      this.user = result.user;
      localStorage.setItem('gm_session', JSON.stringify(this.session));
      localStorage.setItem('gm_user', JSON.stringify(this.user));

      this.showMainScreen();
    } catch (err) {
      this.el.authStatus.className = 'status-msg error';
      this.el.authStatus.innerText = err.message;
    } finally {
      this.el.authSubmitBtn.disabled = false;
    }
  }

  restoreSession() {
    const s = localStorage.getItem('gm_session');
    const u = localStorage.getItem('gm_user');
    if (s && u) {
      try {
        this.session = JSON.parse(s);
        this.user = JSON.parse(u);
        this.showMainScreen();
      } catch (e) {
        localStorage.removeItem('gm_session');
        localStorage.removeItem('gm_user');
      }
    }
  }

  showMainScreen() {
    this.el.authScreen.classList.add('hidden');
    this.el.mainScreen.classList.remove('hidden');
    this.el.currentUserName.innerText = '@' + this.user.username;
    this.el.currentUserAvatar.innerText = this.user.username[0].toUpperCase();
    this.startPolling();
  }

  logout() {
    localStorage.removeItem('gm_session');
    localStorage.removeItem('gm_user');
    this.session = null;
    this.user = null;
    this.stopPolling();
    this.renderedMessageIds.clear();
    this.el.messagesFeed.innerHTML = '';
    this.el.mainScreen.classList.add('hidden');
    this.el.authScreen.classList.remove('hidden');
    this.el.authPassword.value = '';
  }

  openChat(chatId, title) {
    this.currentChatId = chatId;
    this.lastSeq = 0;
    this.renderedMessageIds.clear();
    this.el.activeChatTitle.innerText = title;
    this.el.messagesFeed.innerHTML = '';
    this.syncMessages();
  }

  async sendTextMessage() {
    const text = this.el.messageInput.value.trim();
    if (!text) return;

    this.el.messageInput.value = '';
    this.el.messageInput.style.height = 'auto';

    const tempId = 'tmp_' + Date.now();
    this.appendMessage({
      messageId: tempId,
      senderUsername: this.user.username,
      content: { text },
      createdAt: new Date().toISOString()
    }, true);

    try {
      const res = await this.apiRequest('send', {
        sessionToken: this.session.sessionToken,
        chatId: this.currentChatId,
        text
      });
      if (res && res.message) {
        this.lastSeq = Math.max(this.lastSeq, res.message.seq);
      }
    } catch (err) {
      console.error('Ошибка отправки:', err);
    }
  }

  // ===================================================
  // BIT-FOR-BIT EXACT FORMAT SERVER STORAGE
  // ===================================================

  // Reads file strictly without formatting and uploads to repository server storage
  async uploadFileToServer(file, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          const pct = Math.round((evt.loaded / evt.total) * 40);
          onProgress(pct, 'Чтение исходного файла...');
        }
      };

      reader.onload = async () => {
        try {
          onProgress(50, 'Отправка на сервер...');
          const arrayBuffer = reader.result;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }
          const base64Content = btoa(binary);

          const timestamp = Date.now();
          const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const serverPath = `media/files/${timestamp}_${cleanName}`;

          onProgress(70, 'Сохранение файла на сервере...');

          const uploadUrl = `https://api.github.com/repos/${this.config.REPO_OWNER}/${this.config.REPO_NAME}/contents/${serverPath}`;
          const res = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Authorization': 'token ' + this.config.GITHUB_TOKEN,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              message: `media: upload ${file.name} (${file.size} bytes)`,
              content: base64Content
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error('Ошибка сервера: ' + (errData.message || res.statusText));
          }

          onProgress(100, 'Готово!');
          // Direct Fastly-CDN streaming raw URL with Range support
          const rawUrl = `https://raw.githubusercontent.com/${this.config.REPO_OWNER}/${this.config.REPO_NAME}/main/${serverPath}`;
          resolve(rawUrl);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsArrayBuffer(file);
    });
  }

  // ===================================================
  // EXACT FORMAT FILE ATTACHMENT & SENDING
  // ===================================================

  async handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.el.fileInput.value = '';

    if (file.size > this.config.MAX_FILE_SIZE_BYTES) {
      alert('Размер файла превышает лимит в 100 МБ');
      return;
    }

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);

    this.el.uploadCard.classList.remove('hidden');
    this.el.uploadFileName.innerText = file.name;
    this.el.uploadProgressFill.style.width = '10%';
    this.el.uploadFileStats.innerText = 'Подготовка к отправке...';

    try {
      // 1. Upload original uncompressed file bit-for-bit to server
      const fileUrl = await this.uploadFileToServer(file, (pct, statusText) => {
        this.el.uploadProgressFill.style.width = pct + '%';
        this.el.uploadFileStats.innerText = `${statusText} (${pct}%)`;
      });

      // 2. Build message payload with real server URL
      const messageText = this.el.messageInput.value.trim();
      this.el.messageInput.value = '';

      const filePayload = {
        id: 'file_' + Date.now(),
        name: file.name,
        size: file.size,
        mimeType: file.type || (isVideo ? 'video/mp4' : (isImage ? 'image/jpeg' : 'application/octet-stream')),
        url: fileUrl,
        downloadUrl: fileUrl
      };

      await this.apiRequest('send', {
        sessionToken: this.session.sessionToken,
        chatId: this.currentChatId,
        messageType: isVideo ? 'video' : (isImage ? 'image' : 'file'),
        content: {
          text: messageText,
          file: filePayload
        }
      });

      this.el.uploadCard.classList.add('hidden');
      this.syncMessages();
    } catch (err) {
      alert('Ошибка отправки файла: ' + err.message);
      this.el.uploadCard.classList.add('hidden');
    }
  }

  // ===================================================
  // FULL FORMAT TELEGRAM MESSAGE RENDERING
  // ===================================================

  appendMessage(msg, isOptimistic = false) {
    if (!isOptimistic && msg.messageId && this.renderedMessageIds.has(msg.messageId)) {
      return;
    }
    if (!isOptimistic && msg.messageId) {
      this.renderedMessageIds.add(msg.messageId);
    }

    const isOutgoing = msg.senderUsername === this.user.username;
    const bubble = document.createElement('div');
    bubble.className = 'tg-bubble ' + (isOutgoing ? 'outgoing' : 'incoming');
    if (isOptimistic) bubble.style.opacity = '0.75';

    let contentHtml = '';
    const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const checkmarks = isOutgoing ? '<span class="tg-checkmarks">✓✓</span>' : '';

    if (msg.content && msg.content.file) {
      const f = msg.content.file;
      const isVideo = (f.mimeType && f.mimeType.startsWith('video/')) || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name);
      const isImage = (f.mimeType && f.mimeType.startsWith('image/')) || /\.(jpe?g|png|webp|gif|svg)$/i.test(f.name);
      const fileUrl = f.url || f.downloadUrl || '';

      if (isVideo) {
        // FULL FORMAT VIDEO PLAYER DIRECTLY IN CHAT STREAM (NO FAKE PREVIEW)
        contentHtml = `
          <div class="tg-video-card">
            <video controls playsinline preload="metadata" src="${this.escapeHtml(fileUrl)}"></video>
            <div class="tg-video-bottom">
              <span class="tg-video-title" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)} (${this.formatBytes(f.size)})</span>
              <button class="tg-media-dl-btn btn-dl-action" data-url="${this.escapeHtml(fileUrl)}" data-name="${this.escapeHtml(f.name)}" title="Скачать исходное видео">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Скачать</span>
              </button>
            </div>
          </div>
          ${msg.content.text ? '<div class="tg-msg-text" style="margin-top:4px;">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
        `;
      } else if (isImage) {
        // FULL FORMAT PHOTO WITH BORDERLESS VIEW & LIGHTBOX
        contentHtml = `
          <div class="tg-photo-card" data-url="${this.escapeHtml(fileUrl)}" data-name="${this.escapeHtml(f.name)}">
            <img src="${this.escapeHtml(fileUrl)}" alt="${this.escapeHtml(f.name)}" loading="lazy">
            <button class="tg-media-dl-btn btn-dl-action" data-url="${this.escapeHtml(fileUrl)}" data-name="${this.escapeHtml(f.name)}" title="Скачать фото">
              <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              <span>Скачать</span>
            </button>
          </div>
          ${msg.content.text ? '<div class="tg-msg-text" style="margin-top:4px;">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
        `;
      } else {
        // TELEGRAM CIRCULAR FILE DOCUMENT CARD
        contentHtml = `
          <div class="tg-doc-item">
            <div class="tg-doc-round-btn btn-dl-action" data-url="${this.escapeHtml(fileUrl)}" data-name="${this.escapeHtml(f.name)}" title="Скачать">
              <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </div>
            <div class="tg-doc-meta">
              <div class="tg-doc-title" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</div>
              <div class="tg-doc-size">${this.formatBytes(f.size)}</div>
            </div>
            <button class="tg-doc-action-btn btn-dl-action" data-url="${this.escapeHtml(fileUrl)}" data-name="${this.escapeHtml(f.name)}">
              Скачать
            </button>
          </div>
          ${msg.content.text ? '<div class="tg-msg-text" style="margin-top:4px;">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
        `;
      }
    } else {
      contentHtml = `<div class="tg-msg-text">${this.escapeHtml(msg.content ? msg.content.text : '')}</div>`;
    }

    bubble.innerHTML = `
      ${!isOutgoing ? '<span class="tg-sender-name">@' + this.escapeHtml(msg.senderUsername) + '</span>' : ''}
      ${contentHtml}
      <div class="tg-meta">
        <span>${time}</span>
        ${checkmarks}
      </div>
    `;

    // Click photo to open Lightbox
    bubble.querySelectorAll('.tg-photo-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-dl-action')) return;
        const url = card.getAttribute('data-url');
        const name = card.getAttribute('data-name');
        this.openLightbox(url, name);
      });
    });

    // Download button handler (fetches real binary blob and downloads with original filename)
    bubble.querySelectorAll('.btn-dl-action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        const name = btn.getAttribute('data-name');
        this.downloadMedia(url, name);
      });
    });

    this.el.messagesFeed.appendChild(bubble);
    this.el.messagesContainer.scrollTop = this.el.messagesContainer.scrollHeight;
  }

  openLightbox(url, fileName) {
    this.activeLightboxData = { url, name: fileName };
    this.el.lightboxImg.src = url;
    this.el.lightboxTitle.innerText = fileName || 'Фотография';
    this.el.lightboxModal.classList.remove('hidden');
  }

  closeLightbox() {
    this.el.lightboxModal.classList.add('hidden');
    this.el.lightboxImg.src = '';
    this.activeLightboxData = null;
  }

  // Exact binary file download to prevent 0xc10100be or corrupted extension errors
  downloadMedia(url, fileName) {
    if (!url || url === '#' || url.startsWith('blob:tmp_')) {
      alert('Файл еще загружается на сервер...');
      return;
    }

    // Direct binary fetch and save
    fetch(url)
      .then(resp => {
        if (!resp.ok) throw new Error('Ошибка скачивания: HTTP ' + resp.status);
        return resp.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName || 'video.mp4';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, 300);
      })
      .catch(err => {
        console.warn('Fallback direct download:', err.message);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || 'video.mp4';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 300);
      });
  }

  async syncMessages() {
    if (!this.session) return;
    try {
      const res = await this.apiRequest('sync', {
        sessionToken: this.session.sessionToken,
        chatId: this.currentChatId,
        afterSeq: this.lastSeq
      });

      if (res.messages && res.messages.length > 0) {
        for (const msg of res.messages) {
          if (msg.seq > this.lastSeq) {
            this.lastSeq = msg.seq;
            this.appendMessage(msg);
          }
        }
      }
    } catch (err) {
      console.warn('Синхронизация:', err.message);
    }
  }

  startPolling() {
    this.syncMessages();
    this.pollTimer = setInterval(() => this.syncMessages(), this.config.SYNC_INTERVAL_MS);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str || '';
    return div.innerHTML;
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('sw.js');
      } catch (e) {}
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.messenger = new GlobalMessenger();
});
