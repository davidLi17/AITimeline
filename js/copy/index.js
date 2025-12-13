/**
 * Copy Manager - 全站复制监听与保存
 *
 * 功能：
 * - 监听用户 copy 行为（不区分场景，不做敏感过滤）
 * - 防抖：短时间连续复制只弹最后一次
 * - 软询问浮层：保存（文本 + 当前链接）/ 忽略 / 查看记录
 * - 本地存储：chrome.storage.local
 * - 打开链接时尝试使用 scroll-to-text-fragment 定位高亮
 */

(function () {
  const STORAGE_KEYS = {
    enabled: 'copyEnabled',
    records: 'copyRecords',
  };

  const CONFIG = {
    debounceMs: 650,
    maxTextLength: 1000, // 单条最大保存字符数（超出截断）
    maxRecords: 500, // 总记录上限（超出丢弃最旧）
    promptAutoCloseMs: 6000,
    promptPreviewLength: 90,
    fragmentMaxLength: 180, // 用于 #:~:text 的片段长度（越短越稳）
  };

  const t = (fallback) => fallback;

  function nowTs() {
    return Date.now();
  }

  function safeTrim(str) {
    return (str || '').replace(/\u00A0/g, ' ').trim();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * ============================================================
   * 核心优化：智能提取"干净的文本片段"用于 scroll-to-text-fragment
   * ============================================================
   * 
   * 失败的主要原因：
   * 1. CSS 生成内容（列表序号、符号）会被复制，但不在 DOM 文本里
   * 2. 跨段落文本中间有 HTML 结构阻隔
   * 3. 标点/空白差异
   * 
   * 策略：
   * 1. 清除常见的 CSS 生成前缀（序号、符号等）
   * 2. 只用第一段的第一句话（短而独特）
   * 3. 彻底归一化空白和标点
   */

  // 常见的 CSS 生成前缀（复制时会带上，但 DOM 里没有）
  const CSS_GENERATED_PREFIXES = [
    /^[\d]+[.)、]\s*/,           // 有序列表：1. 2) 3、
    /^[a-zA-Z][.)]\s*/,          // 字母列表：a. b)
    /^[•◦▪▸►‣⁃●○■□▶︎]\s*/,      // 无序列表符号
    /^[-*+]\s+/,                 // Markdown 列表：- * +
    /^>\s+/,                     // 引用块
    /^\[[ x]\]\s*/i,             // 复选框：[ ] [x]
    /^#{1,6}\s+/,                // Markdown 标题
    /^[\d]+\s{2,}/,              // 行号（数字 + 多个空格）
    /^[>$#%]\s+/,                // Shell/REPL 提示符
    /^(注[：:])|(Note[：:])/i,   // 注释前缀
  ];

  /**
   * 清除 CSS 生成的前缀
   */
  function removeCssGeneratedPrefix(text) {
    let result = safeTrim(text);
    for (const pattern of CSS_GENERATED_PREFIXES) {
      result = result.replace(pattern, '');
    }
    return result;
  }

  /**
   * 提取第一段的第一句话（短而独特的片段）
   */
  function extractFirstSentence(text) {
    const trimmed = safeTrim(text);
    if (!trimmed) return trimmed;

    // 1. 先按段落分割，取第一段
    const paragraphs = trimmed
      .split(/[\r\n]{2,}|[\u2028\u2029]+/)
      .map(p => safeTrim(p))
      .filter(p => p.length > 0);
    
    let firstPara = paragraphs[0] || trimmed;
    
    // 2. 清除 CSS 生成的前缀
    firstPara = removeCssGeneratedPrefix(firstPara);
    
    // 3. 尝试提取第一句话（在句号、问号、感叹号处截断）
    //    中英文句号都支持
    const sentenceEnd = firstPara.search(/[。！？.!?]/);
    if (sentenceEnd > 15 && sentenceEnd < 150) {
      // 找到句子结尾，且长度合适
      return firstPara.slice(0, sentenceEnd + 1);
    }
    
    // 4. 如果没有明确的句子边界，取前 100 个字符并在词边界截断
    if (firstPara.length > 100) {
      // 在空格/标点处截断，避免截断词中间
      const cutPoint = firstPara.slice(0, 120).search(/[\s,，;；:：、]/);
      if (cutPoint > 50) {
        return firstPara.slice(0, cutPoint);
      }
      return firstPara.slice(0, 100);
    }
    
    return firstPara;
  }

  /**
   * 彻底归一化文本用于 fragment 匹配
   */
  function normalizeForFragment(text) {
    return safeTrim(text)
      // 移除零宽字符
      .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
      // 移除文本方向标记
      .replace(/[\u202A-\u202E\u2066-\u2069]/g, '')
      // 移除段落/行分隔符
      .replace(/[\u2028\u2029]/g, ' ')
      // 换行 → 空格
      .replace(/[\r\n]+/g, ' ')
      // 制表符 → 空格
      .replace(/\t+/g, ' ')
      // 连续空白 → 单空格
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildTextFragmentUrl(pageUrl, copiedText) {
    try {
      if (!pageUrl) return pageUrl;
      // 不能直接丢弃 hash：很多站点（SPA）用 hash 做路由（如 #/xxx），丢了会跳错页面
      const u = new URL(pageUrl);
      
      // ✨ 核心优化：
      // 1. 提取第一段的第一句话（清除 CSS 生成前缀）
      // 2. 归一化处理
      // 3. 限制长度
      const cleanText = extractFirstSentence(copiedText);
      const normalized = normalizeForFragment(cleanText);
      if (!normalized) return u.toString();

      // 最终片段：最多 fragmentMaxLength 字符
      const snippet = normalized.length > CONFIG.fragmentMaxLength
        ? normalized.slice(0, CONFIG.fragmentMaxLength)
        : normalized;

      // 按规范对片段做 encode
      const encoded = encodeURIComponent(snippet);

      // 如果原本就有 fragment（#...），保留并追加 :~:text；同时移除旧的 :~:text 避免叠加
      const rawHash = (u.hash || '').startsWith('#') ? u.hash.slice(1) : (u.hash || '');
      const hashWithoutDirective = rawHash ? rawHash.split(':~:text=')[0] : '';
      u.hash = hashWithoutDirective
        ? `${hashWithoutDirective}:~:text=${encoded}`
        : `:~:text=${encoded}`;

      return u.toString();
    } catch {
      return pageUrl;
    }
  }

  async function getEnabled() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.enabled);
      return result[STORAGE_KEYS.enabled] !== false; // 默认开启
    } catch {
      return true;
    }
  }

  async function setEnabled(enabled) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.enabled]: !!enabled });
    } catch {}
  }

  async function getRecords() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.records);
      const list = result[STORAGE_KEYS.records];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  async function setRecords(records) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.records]: records });
    } catch {}
  }

  async function addRecord(record) {
    const list = await getRecords();
    const next = [record, ...list];
    if (next.length > CONFIG.maxRecords) {
      next.length = CONFIG.maxRecords;
    }
    await setRecords(next);
  }

  function copyToClipboard(text) {
    const value = text || '';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value);
        return;
      }
    } catch {}

    // fallback: execCommand
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {}
  }

  class CopyPrompt {
    constructor() {
      this.el = null;
      this.timer = null;
      this.lastPayload = null;
    }

    hide(immediate = false) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (!this.el) return;

      const node = this.el;
      this.el = null;

      if (immediate) {
        try { node.remove(); } catch {}
        return;
      }

      node.classList.remove('visible');
      setTimeout(() => {
        try { node.remove(); } catch {}
      }, 180);
    }

    show(payload) {
      this.lastPayload = payload;
      this.hide(true);

      const { text, url } = payload;
      const host = (() => {
        try { return new URL(url).host; } catch { return ''; }
      })();

      const preview = safeTrim(text).slice(0, CONFIG.promptPreviewLength);
      const previewText = preview + (safeTrim(text).length > CONFIG.promptPreviewLength ? '…' : '');

      const root = document.createElement('div');
      root.className = 'ait-copy-prompt';
      root.innerHTML = `
        <div class="ait-copy-prompt__header">
          <div class="ait-copy-prompt__title">${t('保存这段复制内容？')}</div>
          <button class="ait-copy-prompt__close" type="button" aria-label="close">×</button>
        </div>
        <div class="ait-copy-prompt__meta">
          <div class="ait-copy-prompt__site">${escapeHtml(host || t('当前页面'))}</div>
        </div>
        <div class="ait-copy-prompt__preview" title="${escapeHtml(safeTrim(text) || '')}">${escapeHtml(previewText || t('（空内容）'))}</div>
        <div class="ait-copy-prompt__actions">
          <button class="ait-copy-prompt__btn ait-copy-prompt__btn--ghost" data-action="dismiss" type="button">${t('忽略')}</button>
          <button class="ait-copy-prompt__btn ait-copy-prompt__btn--ghost" data-action="view" type="button">${t('查看')}</button>
          <button class="ait-copy-prompt__btn ait-copy-prompt__btn--primary" data-action="save" type="button">${t('保存')}</button>
        </div>
      `;

      const closeBtn = root.querySelector('.ait-copy-prompt__close');
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
      });

      root.addEventListener('click', async (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
        if (!btn) return;
        e.stopPropagation();

        const action = btn.getAttribute('data-action');
        if (action === 'dismiss') {
          this.hide();
          return;
        }

        if (action === 'view') {
          this.hide();
          if (window.panelModal && typeof window.panelModal.show === 'function') {
            window.panelModal.show('copy');
          }
          return;
        }

        if (action === 'save') {
          const trimmed = safeTrim(text);
          const storedText = trimmed.length > CONFIG.maxTextLength ? trimmed.slice(0, CONFIG.maxTextLength) : trimmed;
          const record = {
            id: `${nowTs()}_${Math.random().toString(16).slice(2)}`,
            createdAt: nowTs(),
            url: url || location.href,
            text: storedText,
            truncated: trimmed.length > CONFIG.maxTextLength,
          };

          await addRecord(record);
          this.hide();

          // 给一个轻提示
          try {
            if (window.globalToastManager) {
              window.globalToastManager.success(t('已保存'), null, { duration: 1200, icon: '✓' });
            }
          } catch {}
        }
      });

      document.body.appendChild(root);
      requestAnimationFrame(() => root.classList.add('visible'));

      this.el = root;
      this.timer = setTimeout(() => this.hide(), CONFIG.promptAutoCloseMs);
    }
  }

  class CopyListener {
    constructor() {
      this.enabled = true;
      this.debounceTimer = null;
      this.pendingPayload = null;
      this.prompt = new CopyPrompt();

      this._onCopy = this._onCopy.bind(this);
      this._onStorageChanged = this._onStorageChanged.bind(this);
    }

    async init() {
      this.enabled = await getEnabled();
      document.addEventListener('copy', this._onCopy, true);

      try {
        chrome.storage.onChanged.addListener(this._onStorageChanged);
      } catch {}
    }

    destroy() {
      document.removeEventListener('copy', this._onCopy, true);
      try { chrome.storage.onChanged.removeListener(this._onStorageChanged); } catch {}
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.prompt.hide(true);
    }

    _onStorageChanged(changes, areaName) {
      if (areaName && areaName !== 'local') return;
      if (changes && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.enabled)) {
        const nv = changes[STORAGE_KEYS.enabled]?.newValue;
        this.enabled = nv !== false;
      }
    }

    _getSelectedTextFromCopyEvent(e) {
      // 优先 selection（跨网站兼容更好）
      try {
        const s = window.getSelection ? window.getSelection() : null;
        const text = s ? s.toString() : '';
        if (text && safeTrim(text)) return text;
      } catch {}

      // 其次 clipboardData（部分站点可用）
      try {
        const cd = e && e.clipboardData;
        if (cd && typeof cd.getData === 'function') {
          const text = cd.getData('text/plain');
          if (text && safeTrim(text)) return text;
        }
      } catch {}

      return '';
    }

    _onCopy(e) {
      if (!this.enabled) return;

      const rawText = this._getSelectedTextFromCopyEvent(e);
      const text = safeTrim(rawText);
      if (!text) return;

      this.pendingPayload = {
        text,
        url: location.href,
      };

      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null;
        if (!this.pendingPayload) return;
        const stillEnabled = await getEnabled();
        this.enabled = stillEnabled;
        if (!stillEnabled) return;
        this.prompt.show(this.pendingPayload);
        this.pendingPayload = null;
      }, CONFIG.debounceMs);
    }
  }

  // ==================== 对外工具（Copy Tab 会用到）====================
  if (!window.AITCopyUtils) {
    window.AITCopyUtils = {
      getEnabled,
      setEnabled,
      getRecords,
      setRecords,
      addRecord,
      copyToClipboard,
      buildTextFragmentUrl,
    };
  }

  // ==================== 自动初始化（全站启用）====================
  if (!window.__aitCopyListener) {
    const listener = new CopyListener();
    window.__aitCopyListener = listener;
    listener.init();
  }
})();


