/**
 * Settings Tab - 其他配置
 * 
 * 功能：
 * - URL 按钮功能开关（识别页面纯文本 URL 并添加快捷跳转按钮）
 */

class SettingsTab extends BaseTab {
    constructor() {
        super();
        this.id = 'settings';
        this.name = chrome.i18n.getMessage('settingsTabName') || '其他配置';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="1"/>
            <circle cx="19" cy="12" r="1"/>
            <circle cx="5" cy="12" r="1"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'settings-tab';
        
        // URL 按钮功能开关
        const urlButtonSection = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('urlButtonLabel') || 'URL 快捷跳转'}</div>
                        <div class="setting-hint">
                            ${chrome.i18n.getMessage('urlButtonHint') || '识别页面上的纯文本 URL，在其后添加快捷跳转图标，点击可在新标签页打开链接'}
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="url-button-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        
        container.innerHTML = urlButtonSection;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        // 处理 URL 按钮开关
        const urlButtonToggle = document.getElementById('url-button-toggle');
        if (urlButtonToggle) {
            // 读取当前状态（默认开启）
            try {
                const result = await chrome.storage.local.get('urlButtonEnabled');
                // 默认值为 true（开启）
                urlButtonToggle.checked = result.urlButtonEnabled !== false;
            } catch (e) {
                console.error('[SettingsTab] Failed to load URL button state:', e);
                // 读取失败，默认开启
                urlButtonToggle.checked = true;
            }
            
            // 监听开关变化
            this.addEventListener(urlButtonToggle, 'change', async (e) => {
                try {
                    const enabled = e.target.checked;
                    
                    // 保存到 Storage
                    await chrome.storage.local.set({ urlButtonEnabled: enabled });
                    
                    if (enabled) {
                        // 开启功能
                        if (window.urlAutoLinkManager) {
                            // 已有实例，重新扫描页面
                            window.urlAutoLinkManager.reprocess();
                        } else if (window.UrlAutoLinkManager) {
                            // 没有实例但有类，创建新实例
                            window.urlAutoLinkManager = new window.UrlAutoLinkManager({ debug: false });
                        }
                    } else {
                        // 关闭功能：移除所有已添加的链接
                        this._removeAllUrlLinks();
                        
                        // 销毁实例（停止监听 DOM 变化）
                        if (window.urlAutoLinkManager) {
                            window.urlAutoLinkManager.destroy();
                            window.urlAutoLinkManager = null;
                        }
                    }
                    
                    console.log('[SettingsTab] URL button enabled:', enabled);
                } catch (e) {
                    console.error('[SettingsTab] Failed to save URL button state:', e);
                    
                    // 保存失败，恢复checkbox状态
                    urlButtonToggle.checked = !urlButtonToggle.checked;
                }
            });
        }
    }
    
    /**
     * 移除页面上所有 URL 链接（关闭功能时调用）
     */
    _removeAllUrlLinks() {
        const links = document.querySelectorAll('a.url-auto-link');
        links.forEach(link => {
            if (link.parentNode) {
                // 用纯文本节点替换链接
                const textNode = document.createTextNode(link.textContent);
                link.parentNode.replaceChild(textNode, link);
            }
        });
        console.log('[SettingsTab] Removed all URL links');
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

