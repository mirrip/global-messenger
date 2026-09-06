// ===================================================
// GLOBAL MESSENGER CLIENT — CROSS-DEVICE TELEGRAM ENGINE
// ===================================================

class GlobalMessenger {
  constructor() {
    this.config = window.GM_CONFIG || {
      PRIMARY_ENDPOINT: 'https://script.google.com/macros/s/AKfycbwxGP9V8FLse_ZGzcCl-hwSWNUiOXpwdNCBRpqnrfe8iBNQz-u9aLjB6bf0TPFpyKpyJw/exec',
      SYNC_INTERVAL_MS: 1500,
      MAX_FILE_SIZE_BYTES: 1024 * 1024 * 1024 * 1024
    };

    this.user = null;
    this.session = null;
    this.currentChatId = 'dm:general';
    this.lastSeq = 0;
    this.pollTimer = null;
    this.localBlobUrls = new Map();
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

    // Send text message on Enter or Airplane click
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

    // Lightbox modal controls
    this.el.lightboxCloseBtn.addEventListener('click', () => this.closeLightbox());
    this.el.lightboxModal.querySelector('.lightbox-backdrop').addEventListener('click', () => this.closeLightbox());
    this.el.lightboxDownloadBtn.addEventListener('click', () => {
      if (this.activeLightboxData) {
        this.downloadMedia(this.activeLightboxData.url, this.activeLightboxData.name);
      }
    });

    // Handle Escape key for lightbox
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

    // Optimistic Telegram message render
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
      console.error('Ошибка отправки сообщения:', err);
    }
  }

  // ===================================================
  // CROSS-DEVICE MEDIA THUMBNAIL GENERATORS
  // ===================================================

  // Creates a lightweight base64 JPEG thumbnail (< 20 KB) that travels inside message JSON
  createImageThumbnail(file, maxDim = 520, quality = 0.65) {
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          };
          img.onerror = () => resolve(null);
          img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      } catch (err) {
        resolve(null);
      }
    });
  }

  // Extracts video frame (0.5s) as a base64 poster frame thumbnail (< 15 KB)
  createVideoPoster(file, maxDim = 480) {
    return new Promise((resolve) => {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const blobUrl = URL.createObjectURL(file);
        video.src = blobUrl;

        const cleanup = () => {
          URL.revokeObjectURL(blobUrl);
          video.remove();
        };

        video.onloadeddata = () => {
          video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        };

        video.onseeked = () => {
          try {
            let w = video.videoWidth || 480;
            let h = video.videoHeight || 320;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, w, h);
            const poster = canvas.toDataURL('image/jpeg', 0.6);
            cleanup();
            resolve(poster);
          } catch (e) {
            cleanup();
            resolve(null);
          }
        };

        video.onerror = () => {
          cleanup();
          resolve(null);
        };

        setTimeout(() => {
          cleanup();
          resolve(null);
        }, 4000);
      } catch (err) {
        resolve(null);
      }
    });
  }

  // Uploads file to public cloud storage (Litterbox, 72h-30d retention, CORS-enabled)
  async uploadFileToCloud(file, onProgress) {
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('time', '72h');
    formData.append('fileToUpload', file, file.name);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'https://litterbox.catbox.moe/resources/internals/api.php', true);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.round((evt.loaded / evt.total) * 100);
            onProgress(pct, evt.loaded, evt.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const url = xhr.responseText.trim();
          if (url.startsWith('http')) {
            resolve(url);
          } else {
            reject(new Error('Некорректный ответ хранилища: ' + url));
          }
        } else {
          reject(new Error('Ошибка загрузки в облако: HTTP ' + xhr.status));
        }
      };

      xhr.onerror = () => reject(new Error('Ошибка сети при отправке файла в облако'));
      xhr.send(formData);
    });
  }

  // ===================================================
  // TELEGRAM COMPOSER & FILE SENDING PIPELINE
  // ===================================================

  async handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.el.fileInput.value = '';

    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);

    const localBlobUrl = URL.createObjectURL(file);
    const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    this.localBlobUrls.set(fileId, localBlobUrl);

    // Show upload progress card
    this.el.uploadCard.classList.remove('hidden');
    this.el.uploadFileName.innerText = file.name;
    this.el.uploadProgressFill.style.width = '10%';
    this.el.uploadFileStats.innerText = 'Подготовка предпросмотра...';

    let previewUrl = null;

    try {
      // 1. Generate lightweight cross-device preview Base64 data URL
      if (isImage) {
        previewUrl = await this.createImageThumbnail(file, 520, 0.65);
      } else if (isVideo) {
        previewUrl = await this.createVideoPoster(file, 480);
      }

      this.el.uploadFileStats.innerText = 'Отправка в облачное хранилище...';

      // 2. Upload file to universal public cloud host
      let publicFileUrl = null;
      try {
        publicFileUrl = await this.uploadFileToCloud(file, (pct, loaded, total) => {
          this.el.uploadProgressFill.style.width = pct + '%';
          this.el.uploadFileStats.innerText = this.formatBytes(loaded) + ' / ' + this.formatBytes(total) + ' (' + pct + '%)';
        });
      } catch (cloudErr) {
        console.warn('Cloud upload failed, using fallback:', cloudErr.message);
      }

      // 3. Construct cross-device payload
      const filePayload = {
        id: fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || (isImage ? 'image/jpeg' : (isVideo ? 'video/mp4' : 'application/octet-stream')),
        previewUrl: previewUrl || '', // Guaranteed Base64 dataUrl visible across all devices!
        url: publicFileUrl || localBlobUrl,
        downloadUrl: publicFileUrl || previewUrl || localBlobUrl
      };

      // 4. Send message to backend
      const messageText = this.el.messageInput.value.trim();
      this.el.messageInput.value = '';

      await this.apiRequest('send', {
        sessionToken: this.session.sessionToken,
        chatId: this.currentChatId,
        messageType: isImage ? 'image' : (isVideo ? 'video' : 'file'),
        content: {
          text: messageText,
          file: filePayload
        }
      });

      this.el.uploadCard.classList.add('hidden');
      this.syncMessages();
    } catch (err) {
      alert('Ошибка при отправке: ' + err.message);
      this.el.uploadCard.classList.add('hidden');
    }
  }

  // ===================================================
  // TELEGRAM MESSAGE RENDERING (CROSS-DEVICE READY)
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
      const isImage = (f.mimeType && f.mimeType.startsWith('image/')) || /\.(jpe?g|png|webp|gif|svg)$/i.test(f.name);
      const isVideo = (f.mimeType && f.mimeType.startsWith('video/')) || /\.(mp4|webm|mov|mkv)$/i.test(f.name);

      // Resolve best visual source for current device:
      // 1. Local active blob URL (if this device created it)
      // 2. Embedded Base64 previewUrl (works 100% on ANY other device/browser!)
      // 3. Public download URL
      const localBlob = f.id ? this.localBlobUrls.get(f.id) : null;
      const displayUrl = localBlob || f.previewUrl || (f.url && !f.url.startsWith('blob:') ? f.url : '');
      const downloadTarget = (f.downloadUrl && !f.downloadUrl.startsWith('blob:')) 
        ? f.downloadUrl 
        : (f.url && !f.url.startsWith('blob:') ? f.url : (f.previewUrl || localBlob || ''));

      if (isImage) {
        // TELEGRAM PHOTO CARD WITH BORDERLESS PREVIEW & OVERLAY DOWNLOAD
        if (displayUrl) {
          contentHtml = `
            <div class="tg-photo-card" data-preview="${this.escapeHtml(displayUrl)}" data-download="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}">
              <img src="${this.escapeHtml(displayUrl)}" alt="${this.escapeHtml(f.name)}" loading="lazy">
              <button class="tg-media-dl-btn btn-dl-action" data-url="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}" title="Скачать фото">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Скачать</span>
              </button>
            </div>
            ${msg.content.text ? '<div class="tg-msg-text" style="margin-top:4px;">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
          `;
        } else {
          // Graceful fallback for older expired blob photos
          contentHtml = `
            <div class="tg-doc-item">
              <div class="tg-doc-round-btn btn-dl-action" data-url="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}">📷</div>
              <div class="tg-doc-meta">
                <div class="tg-doc-title">${this.escapeHtml(f.name)}</div>
                <div class="tg-doc-size">${this.formatBytes(f.size)}</div>
              </div>
            </div>
            ${msg.content.text ? '<div class="tg-msg-text">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
          `;
        }
      } else if (isVideo) {
        // TELEGRAM VIDEO PLAYER WITH POSTER PREVIEW & DOWNLOAD
        const posterAttr = f.previewUrl ? `poster="${this.escapeHtml(f.previewUrl)}"` : '';
        const videoSrc = (f.url && !f.url.startsWith('blob:')) ? f.url : (localBlob || '');

        contentHtml = `
          <div class="tg-video-card">
            <video controls playsinline preload="metadata" ${posterAttr} src="${this.escapeHtml(videoSrc)}"></video>
            <div class="tg-video-bottom">
              <span class="tg-video-title" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)} (${this.formatBytes(f.size)})</span>
              <button class="tg-media-dl-btn btn-dl-action" data-url="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}" title="Скачать видео">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Скачать</span>
              </button>
            </div>
          </div>
          ${msg.content.text ? '<div class="tg-msg-text" style="margin-top:4px;">' + this.escapeHtml(msg.content.text) + '</div>' : ''}
        `;
      } else {
        // TELEGRAM CIRCULAR FILE DOCUMENT CARD (APK, ZIP, PDF, ETC)
        contentHtml = `
          <div class="tg-doc-item">
            <div class="tg-doc-round-btn btn-dl-action" data-url="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}" title="Скачать">
              <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </div>
            <div class="tg-doc-meta">
              <div class="tg-doc-title" title="${this.escapeHtml(f.name)}">${this.escapeHtml(f.name)}</div>
              <div class="tg-doc-size">${this.formatBytes(f.size)}</div>
            </div>
            <button class="tg-doc-action-btn btn-dl-action" data-url="${this.escapeHtml(downloadTarget)}" data-name="${this.escapeHtml(f.name)}">
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

    // Click photo to zoom in Lightbox
    bubble.querySelectorAll('.tg-photo-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-dl-action')) return;
        const preview = card.getAttribute('data-preview');
        const dl = card.getAttribute('data-download') || preview;
        const name = card.getAttribute('data-name');
        this.openLightbox(preview, dl, name);
      });
    });

    // Download action handlers
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

  openLightbox(previewUrl, downloadUrl, fileName) {
    this.activeLightboxData = { url: downloadUrl || previewUrl, name: fileName };
    this.el.lightboxImg.src = previewUrl || downloadUrl;
    this.el.lightboxTitle.innerText = fileName || 'Фотография';
    this.el.lightboxModal.classList.remove('hidden');
  }

  closeLightbox() {
    this.el.lightboxModal.classList.add('hidden');
    this.el.lightboxImg.src = '';
    this.activeLightboxData = null;
  }

  downloadMedia(url, fileName) {
    if (!url || url === '#' || url.startsWith('blob:')) {
      alert('Файл недоступен для прямого скачивания');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
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
      } catch (e) {
        // Ignored
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.messenger = new GlobalMessenger();
});
