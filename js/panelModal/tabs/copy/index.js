/**
 * Copy Tab - 复制记录
 *
 * 功能：
 * - 开关：是否开启复制监听（默认开启）
 * - 列表：查看已保存的复制记录
 * - 操作：复制内容 / 打开链接（尝试 scroll-to-text-fragment）/ 删除
 */

class CopyTab extends BaseTab {
  constructor() {
    super();
    this.id = 'copy';
    this.name = '剪贴板';
    this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;

    this._onStorageChanged = this._onStorageChanged.bind(this);
  }

  _escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  render() {
    const container = document.createElement('div');
    container.className = 'copy-tab';

    container.innerHTML = `
      <div class="setting-section">
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">监听复制</div>
            <div class="setting-hint">开启后，复制内容时会询问是否保存到剪贴板</div>
          </div>
          <label class="ait-toggle-switch">
            <input type="checkbox" id="copy-toggle">
            <span class="ait-toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="divider"></div>

      <div class="copy-list-header">
        <div class="copy-list-title">保存记录</div>
        <button class="copy-list-clear" type="button">清空</button>
      </div>

      <div class="copy-list" id="copy-records"></div>
      <div class="copy-empty" id="copy-empty">暂无记录</div>
    `;

    return container;
  }

  async mounted() {
    super.mounted();

    const checkbox = document.getElementById('copy-toggle');
    if (checkbox) {
      try {
        const enabled = await window.AITCopyUtils?.getEnabled?.();
        checkbox.checked = enabled !== false;
      } catch {
        checkbox.checked = true;
      }

      this.addEventListener(checkbox, 'change', async (e) => {
        try {
          await window.AITCopyUtils?.setEnabled?.(!!e.target.checked);
        } catch {
          checkbox.checked = !checkbox.checked;
        }
      });
    }

    const clearBtn = document.querySelector('.copy-list-clear');
    if (clearBtn) {
      this.addEventListener(clearBtn, 'click', async () => {
        try {
          const ok = window.globalPopconfirmManager
            ? await window.globalPopconfirmManager.show({
              title: '清空所有记录？',
              content: '此操作无法撤销',
              confirmText: '清空',
              cancelText: '取消',
              confirmTextType: 'danger',
            })
            : true;

          if (!ok) return;

          await window.AITCopyUtils?.setRecords?.([]);
          await this._renderRecords();
        } catch {}
      });
    }

    // 监听本地存储变化：同步刷新列表 & 开关
    try {
      chrome.storage.onChanged.addListener(this._onStorageChanged);
    } catch {}

    await this._renderRecords();
  }

  unmounted() {
    try { chrome.storage.onChanged.removeListener(this._onStorageChanged); } catch {}
    super.unmounted();
  }

  async _onStorageChanged(changes, areaName) {
    if (areaName && areaName !== 'local') return;

    // 开关同步
    if (changes && Object.prototype.hasOwnProperty.call(changes, 'copyEnabled')) {
      const checkbox = document.getElementById('copy-toggle');
      if (checkbox) {
        checkbox.checked = changes.copyEnabled?.newValue !== false;
      }
    }

    // 列表刷新
    if (changes && Object.prototype.hasOwnProperty.call(changes, 'copyRecords')) {
      await this._renderRecords();
    }
  }

  _formatTime(ts) {
    try {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  }

  async _renderRecords() {
    const listEl = document.getElementById('copy-records');
    const emptyEl = document.getElementById('copy-empty');
    if (!listEl || !emptyEl) return;

    const records = await window.AITCopyUtils?.getRecords?.() || [];

    if (!records.length) {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';

    listEl.innerHTML = records.map(r => {
      const host = (() => {
        try { return new URL(r.url).host; } catch { return ''; }
      })();
      const preview = (r.text || '').slice(0, 140) + ((r.text || '').length > 140 ? '…' : '');
      const time = this._formatTime(r.createdAt);
      const truncated = r.truncated ? `<span class="copy-item-tag">已截断</span>` : '';
      return `
        <div class="copy-item" data-id="${r.id}">
          <div class="copy-item-head">
            <div class="copy-item-site">${this._escapeHtml(host || '页面')}</div>
            <div class="copy-item-time">${this._escapeHtml(time)} ${truncated}</div>
          </div>
          <div class="copy-item-preview">${this._escapeHtml(preview || '')}</div>
          <div class="copy-item-actions">
            <button class="copy-item-btn" data-action="copy" type="button">复制</button>
            <button class="copy-item-btn" data-action="open" type="button">跳转</button>
            <button class="copy-item-btn copy-item-btn--danger" data-action="delete" type="button">删除</button>
          </div>
        </div>
      `;
    }).join('');

    // 事件委托
    this.addEventListener(listEl, 'click', async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn) return;
      const item = btn.closest('.copy-item');
      if (!item) return;
      const id = item.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      const recordsNow = await window.AITCopyUtils?.getRecords?.() || [];
      const record = recordsNow.find(x => x.id === id);
      if (!record) return;

      if (action === 'copy') {
        window.AITCopyUtils?.copyToClipboard?.(record.text || '');
        if (window.globalToastManager) {
          window.globalToastManager.success('已复制', btn, { duration: 900, icon: '✓' });
        }
        return;
      }

      if (action === 'open') {
        const url = window.AITCopyUtils?.buildTextFragmentUrl
          ? window.AITCopyUtils.buildTextFragmentUrl(record.url, record.text)
          : record.url;
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          location.href = url;
        }
        return;
      }

      if (action === 'delete') {
        const ok = window.globalPopconfirmManager
          ? await window.globalPopconfirmManager.show({
            title: '删除这条记录？',
            content: '此操作无法撤销',
            confirmText: '删除',
            cancelText: '取消',
            confirmTextType: 'danger',
          })
          : true;

        if (!ok) return;

        const next = recordsNow.filter(x => x.id !== id);
        await window.AITCopyUtils?.setRecords?.(next);
        await this._renderRecords();
      }
    });
  }
}


