/**
 * Panel Modal - 右侧弹出的面板模态框
 * 
 * 功能：
 * - 从右侧滑入/滑出
 * - 支持多个 tab 切换
 * - tab 只显示 icon，悬停显示 tooltip
 * - 点击遮罩层或关闭按钮关闭
 * 
 * ✨ 组件自治：
 * - 脚本加载时自动初始化
 * - 独立管理生命周期
 * - 其他模块通过 window.panelModal 调用
 * 
 * 使用方式：
 * window.panelModal.show('starred'); // 打开并显示 starred tab
 * window.panelModal.hide();          // 关闭
 * window.panelModal.registerTab(tab); // 注册新 tab
 */

class PanelModal {
    constructor() {
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        
        this.tabs = new Map(); // tabId -> tab instance
        this.currentTabId = null;
        this.isVisible = false;
        
        // URL 变化监听器
        this._currentUrl = location.href;
        this._boundHandleUrlChange = this._handleUrlChange.bind(this);
        
        this.init();
    }
    
    init() {
        // 创建 DOM 结构
        this.createDOM();
        
        // 绑定事件
        this.bindEvents();
        
        // 监听 URL 变化（自动关闭）
        this._attachUrlListeners();
        
        console.log('[PanelModal] Initialized successfully');
    }
    
    createDOM() {
        // 主容器
        this.container = document.createElement('div');
        this.container.className = 'panel-modal';
        
        // 遮罩层
        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-modal-overlay';
        
        // 内容容器（居中弹窗）
        const wrapper = document.createElement('div');
        wrapper.className = 'panel-modal-wrapper';
        
        // ========== 左侧边栏 ==========
        const sidebar = document.createElement('div');
        sidebar.className = 'panel-modal-sidebar';
        
        // 顶部区域（关闭按钮 + 标题）
        const sidebarHeader = document.createElement('div');
        sidebarHeader.className = 'panel-modal-sidebar-header';
        
        // 关闭按钮（左侧顶部）
        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'panel-modal-close';
        this.closeBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        
        // 标题（关闭按钮右侧）
        const sidebarTitle = document.createElement('span');
        sidebarTitle.className = 'panel-modal-sidebar-title';
        sidebarTitle.textContent = 'AI Timeline';
        
        sidebarHeader.appendChild(this.closeBtn);
        sidebarHeader.appendChild(sidebarTitle);
        
        // Tab 栏（可滚动区域）
        this.tabsContainer = document.createElement('div');
        this.tabsContainer.className = 'panel-modal-tabs';
        
        // Footer 底部信息区域
        const footer = document.createElement('div');
        footer.className = 'panel-modal-footer';
        
        // 判断浏览器类型（Edge 或 Chrome）
        const isEdge = /Edg/i.test(navigator.userAgent);
        const storeUrl = isEdge 
            ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
            : 'https://chromewebstore.google.com/detail/fgebdnlceacaiaeikopldglhffljjlhh?utm_source=item-share-cb';
        const reviewUrl = isEdge
            ? 'https://microsoftedge.microsoft.com/addons/detail/ai-timeline%EF%BC%9Agemini%E3%80%81chatgp/ekednjjojnhlajfobalaaihkibbdcbab'
            : 'https://chromewebstore.google.com/detail/ai-timeline%EF%BC%9A%E6%9C%80%E5%BC%BA%E5%A4%A7%E7%9A%84ai%E6%8F%90%E6%95%88%E5%8A%A9%E6%89%8B%EF%BC%9Ach/fgebdnlceacaiaeikopldglhffljjlhh/reviews';
        
        footer.innerHTML = `
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>${chrome.i18n.getMessage('kmvxpz')}</span></div>
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span>${chrome.i18n.getMessage('xpzmkv')}</span><a href="${storeUrl}" target="_blank" class="panel-modal-footer-link">${chrome.i18n.getMessage('pkmzvx')}</a><span> &</span><span class="panel-modal-footer-link panel-modal-feedback-trigger">${chrome.i18n.getMessage('fbklink')}</span><span> ❤️</span></div>
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><span>${chrome.i18n.getMessage('fiveStarReview')}</span><a href="${reviewUrl}" target="_blank" class="panel-modal-footer-link">${chrome.i18n.getMessage('goToReview')} ⭐</a></div>
            <!-- 隐藏：已开源 Star on GitHub（后期可能恢复）
            <div class="panel-modal-footer-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg><span>${chrome.i18n.getMessage('vxpzmk')}</span><a href="https://github.com/houyanchao/AITimeline" target="_blank" class="panel-modal-footer-link">${chrome.i18n.getMessage('mkvxpz')} ⭐</a></div>
            -->
        `;
        
        // 绑定反馈按钮点击事件
        const feedbackTrigger = footer.querySelector('.panel-modal-feedback-trigger');
        if (feedbackTrigger) {
            feedbackTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._showFeedbackModal();
            });
        }
        
        sidebar.appendChild(sidebarHeader);
        sidebar.appendChild(this.tabsContainer);
        sidebar.appendChild(footer);
        
        // ========== 右侧主区域 ==========
        const main = document.createElement('div');
        main.className = 'panel-modal-main';
        
        // 标题栏（右侧顶部）
        const header = document.createElement('div');
        header.className = 'panel-modal-header';
        
        this.titleElement = document.createElement('h2');
        this.titleElement.className = 'panel-modal-title';
        this.titleElement.textContent = 'Panel'; // 默认标题，会在切换 tab 时更新
        
        header.appendChild(this.titleElement);
        
        // 内容区（可滚动）
        this.content = document.createElement('div');
        this.content.className = 'panel-modal-content';
        
        main.appendChild(header);
        main.appendChild(this.content);
        
        // 组装
        wrapper.appendChild(sidebar);
        wrapper.appendChild(main);
        
        this.container.appendChild(this.overlay);
        this.container.appendChild(wrapper);
        
        // 添加到 body
        document.body.appendChild(this.container);
    }
    
    bindEvents() {
        // 点击遮罩层关闭
        this.overlay.addEventListener('click', () => {
            this.hide();
        });
        
        // 点击关闭按钮
        this.closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hide();
        });
    }
    
    /**
     * 监听 URL 变化（自动关闭）
     */
    _attachUrlListeners() {
        try {
            window.addEventListener('popstate', this._boundHandleUrlChange);
            window.addEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to attach URL listeners:', error);
        }
    }
    
    /**
     * 移除 URL 监听
     */
    _detachUrlListeners() {
        try {
            window.removeEventListener('popstate', this._boundHandleUrlChange);
            window.removeEventListener('hashchange', this._boundHandleUrlChange);
        } catch (error) {
            console.error('[PanelModal] Failed to detach URL listeners:', error);
        }
    }
    
    /**
     * URL 变化处理：自动关闭面板
     */
    _handleUrlChange() {
        const newUrl = location.href;
        if (newUrl !== this._currentUrl) {
            this._currentUrl = newUrl;
            
            // URL 变化时自动关闭面板
            if (this.isVisible) {
                this.hide();
            }
        }
    }
    
    /**
     * 注册 tab
     * @param {BaseTab} tab - tab 实例
     */
    registerTab(tab) {
        if (!tab || !tab.id) {
            console.error('[PanelModal] Invalid tab:', tab);
            return;
        }
        
        if (this.tabs.has(tab.id)) {
            return; // 已注册，静默跳过
        }
        
        // 保存 tab
        this.tabs.set(tab.id, tab);
        
        // 创建 tab 按钮
        const tabButton = document.createElement('button');
        tabButton.className = 'panel-tab';
        tabButton.setAttribute('data-tab-id', tab.id);
        tabButton.setAttribute('aria-label', tab.name);
        
        // Tab 图标
        const icon = document.createElement('span');
        icon.className = 'tab-icon';
        
        // 支持 SVG 图标或 emoji
        if (typeof tab.icon === 'string' && tab.icon.trim().startsWith('<')) {
            icon.innerHTML = tab.icon;
        } else {
            icon.textContent = tab.icon;
        }
        
        tabButton.appendChild(icon);
        
        // Tab 文字标签
        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = tab.name;
        tabButton.appendChild(label);
        
        // 点击切换 tab
        tabButton.addEventListener('click', () => {
            this.switchTab(tab.id);
        });
        
        // 添加到 tab 栏
        this.tabsContainer.appendChild(tabButton);
    }
    
    /**
     * 显示面板
     * @param {string} tabId - 要显示的 tab ID（可选）
     */
    show(tabId = null) {
        // ✅ 确保所有可用的 tabs 已注册（按固定顺序）
        if (typeof registerAllTabs === 'function') {
            registerAllTabs();
        }
        
        // 确定要显示的 tab（带 fallback）
        let targetTabId = tabId;
        
        // 如果指定的 tab 不存在，fallback 到当前 tab 或第一个可用的 tab
        if (targetTabId && !this.tabs.has(targetTabId)) {
            console.warn(`[PanelModal] Tab "${targetTabId}" not available, falling back`);
            targetTabId = null;
        }
        
        if (!targetTabId) {
            targetTabId = this.currentTabId && this.tabs.has(this.currentTabId) 
                ? this.currentTabId 
                : this.tabs.keys().next().value;
        }
        
        if (!targetTabId) {
            console.warn('[PanelModal] No tabs registered');
            return;
        }
        
        // 切换到指定 tab
        this.switchTab(targetTabId);
        
        // 显示面板
        this.container.classList.add('visible');
        this.isVisible = true;
        
        // 禁用 body 滚动
        document.body.style.overflow = 'hidden';
    }
    
    /**
     * 切换 tab
     * @param {string} tabId - tab ID
     */
    switchTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) {
            console.error(`[PanelModal] Tab "${tabId}" not found`);
            return;
        }
        
        // 如果已经是当前 tab，不重复切换
        if (this.currentTabId === tabId) {
            return;
        }
        
        // 卸载当前 tab
        if (this.currentTabId) {
            const currentTab = this.tabs.get(this.currentTabId);
            if (currentTab && currentTab.unmounted) {
                currentTab.unmounted();
            }
            
            // 移除当前 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }
        
        // 渲染新 tab 内容
        this.content.innerHTML = '';
        const tabContent = tab.render();
        if (tabContent) {
            this.content.appendChild(tabContent);
        }
        
        // 更新标题
        this.titleElement.textContent = tab.name;
        
        // 更新当前 tab
        this.currentTabId = tabId;
        
        // 添加新 tab 按钮的 active 状态
        const newButton = this.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`);
        if (newButton) {
            newButton.classList.add('active');
        }
        
        // 调用 tab 的 mounted 钩子
        if (tab.mounted) {
            tab.mounted();
        }
    }
    
    /**
     * 隐藏面板
     */
    hide() {
        this.container.classList.remove('visible');
        this.isVisible = false;
        
        // 恢复 body 滚动
        document.body.style.overflow = '';
        
        // 隐藏 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.forceHideAll();
        }
        
        // 卸载当前 tab
        if (this.currentTabId) {
            const tab = this.tabs.get(this.currentTabId);
            if (tab && tab.unmounted) {
                tab.unmounted();
            }
            
            // 移除 tab 按钮的 active 状态
            const currentButton = this.tabsContainer.querySelector(`[data-tab-id="${this.currentTabId}"]`);
            if (currentButton) {
                currentButton.classList.remove('active');
            }
        }
        
        // ✨ 彻底销毁：清空内容和状态
        this.content.innerHTML = '';
        this.currentTabId = null;
        
        console.log('[PanelModal] Panel hidden and destroyed');
    }
    
    /**
     * 显示反馈弹窗
     */
    _showFeedbackModal() {
        // 如果已存在，先移除
        this._hideFeedbackModal();
        
        // 创建反馈弹窗
        const feedbackModal = document.createElement('div');
        feedbackModal.className = 'feedback-modal';
        feedbackModal.innerHTML = `
            <div class="feedback-modal-overlay"></div>
            <div class="feedback-modal-content">
                <div class="feedback-modal-header">
                    <h3 class="feedback-modal-title">${chrome.i18n.getMessage('fbklink')}</h3>
                    <button class="feedback-modal-close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="feedback-modal-body">
                    <div class="feedback-option feedback-option-email">
                        <div class="feedback-option-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                        </div>
                        <div class="feedback-option-info">
                            <div class="feedback-option-label">Email</div>
                            <div class="feedback-option-value">houyanchao@outlook.com</div>
                        </div>
                        <button class="feedback-option-copy" data-email="houyanchao@outlook.com">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            <span>${chrome.i18n.getMessage('mvkxpz')}</span>
                        </button>
                    </div>
                    <a href="https://ai.feishu.cn/share/base/form/shrcnm9dxA0OZVK96buotGs1the" target="_blank" class="feedback-option">
                        <div class="feedback-option-icon feedback-option-icon-feishu">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12.4 5.2c-1.5-1.1-3.5-1.2-5.1-.3L4.5 6.6c-.5.3-.5 1 0 1.3l8.2 5.4c.5.3 1.1.3 1.5 0l5.5-3.6c.5-.3.5-1 0-1.3L12.4 5.2z"/>
                                <path d="M19.8 10.7l-5.5 3.6c-.5.3-1.1.3-1.5 0l-8.2-5.4c-.5-.3-1.1.1-1.1.7v5.9c0 .5.3 1 .7 1.2l7.5 4.1c.5.3 1.1.3 1.5 0l7.5-4.1c.5-.3.7-.7.7-1.2v-5.9c0-.6-.6-1-1.1-.7z" opacity="0.6"/>
                            </svg>
                        </div>
                        <div class="feedback-option-info">
                            <div class="feedback-option-label">${chrome.i18n.getMessage('febhyejd')}</div>
                        </div>
                        <div class="feedback-option-arrow">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"/>
                            </svg>
                        </div>
                    </a>
                </div>
            </div>
        `;
        
        document.body.appendChild(feedbackModal);
        
        // 绑定关闭事件
        const closeBtn = feedbackModal.querySelector('.feedback-modal-close');
        const overlay = feedbackModal.querySelector('.feedback-modal-overlay');
        
        closeBtn.addEventListener('click', () => this._hideFeedbackModal());
        overlay.addEventListener('click', () => this._hideFeedbackModal());
        
        // 绑定复制按钮事件
        const copyBtn = feedbackModal.querySelector('.feedback-option-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const email = copyBtn.getAttribute('data-email');
                try {
                    await navigator.clipboard.writeText(email);
                    // 显示复制成功提示
                    if (window.globalToastManager) {
                        window.globalToastManager.show('success', chrome.i18n.getMessage('xpzmvk'));
                    }
                } catch (err) {
                    console.error('[PanelModal] Failed to copy email:', err);
                    if (window.globalToastManager) {
                        window.globalToastManager.show('error', chrome.i18n.getMessage('kpzmvx'));
                    }
                }
            });
        }
        
        // 点击飞书选项后关闭弹窗
        const feishuOption = feedbackModal.querySelector('.feedback-option:not(.feedback-option-email)');
        if (feishuOption) {
            feishuOption.addEventListener('click', () => {
                // 延迟关闭，让用户看到点击效果
                setTimeout(() => this._hideFeedbackModal(), 100);
            });
        }
        
        // 触发动画
        requestAnimationFrame(() => {
            feedbackModal.classList.add('visible');
        });
    }
    
    /**
     * 隐藏反馈弹窗
     */
    _hideFeedbackModal() {
        const feedbackModal = document.querySelector('.feedback-modal');
        if (feedbackModal) {
            feedbackModal.classList.remove('visible');
            setTimeout(() => {
                feedbackModal.remove();
            }, 200);
        }
    }
    
    /**
     * 销毁
     */
    destroy() {
        // 移除 URL 监听
        this._detachUrlListeners();
        
        // 移除反馈弹窗
        this._hideFeedbackModal();
        
        // 移除 DOM
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        // 清理引用
        this.tabs.clear();
        this.container = null;
        this.overlay = null;
        this.content = null;
        this.tabsContainer = null;
        this.closeBtn = null;
        
        console.log('[PanelModal] Destroyed');
    }
}

// ✅ 自动初始化：创建全局单例
// 脚本加载时立即创建，其他模块可直接使用 window.panelModal
if (typeof window !== 'undefined') {
    window.panelModal = new PanelModal();
    
    // ✅ 注意：所有 Tabs 在 Timeline 初始化后统一注册，确保顺序正确
    // 见 tab-registry.js 中的 registerTimelineTabs()
}
