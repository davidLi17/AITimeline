/**
 * Sidebar Starred Manager - 侧边栏收藏分组管理器
 * 
 * 功能：
 * - 在 AI 平台左侧侧边栏中注入收藏分组
 * - 展示收藏的对话列表（支持2级文件夹）
 * - 支持点击跳转到对应对话
 * - 支持取消收藏
 * 
 * 支持的平台：
 * - Gemini (.chat-history 上方)
 * - ChatGPT (.sidebar-expando-section 上方)
 * - DeepSeek (.ds-scroll-area 上方)
 */

class SidebarStarredManager {
    constructor() {
        // 容器和状态
        this.container = null;
        this.isInjected = false;
        
        // 从 localStorage 恢复展开状态
        this.isExpanded = this._loadExpandState('main', true);
        this.folderExpandStates = this._loadFolderExpandStates();
        
        // DOM 观察器
        this.mutationObserver = null;
        this.retryCount = 0;
        this.maxRetries = 40;  // 最多重试次数（增加到40次，总共20秒）
        this.retryInterval = 500;  // 重试间隔 ms
        
        // 文件夹管理器（延迟初始化）
        this.folderManager = null;
        
        // 存储监听器
        this._storageListener = null;
        
        // 当前平台
        this.platform = null;
    }
    
    /**
     * 从 localStorage 加载展开状态
     */
    _loadExpandState(key, defaultValue) {
        try {
            const stored = localStorage.getItem(`ait-sidebar-starred-expand-${key}`);
            return stored !== null ? stored === 'true' : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }
    
    /**
     * 保存展开状态到 localStorage
     */
    _saveExpandState(key, value) {
        try {
            localStorage.setItem(`ait-sidebar-starred-expand-${key}`, String(value));
        } catch (e) {
            // 忽略存储错误
        }
    }
    
    /**
     * 从 localStorage 加载所有文件夹展开状态
     */
    _loadFolderExpandStates() {
        try {
            const stored = localStorage.getItem('ait-sidebar-starred-folder-states');
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    }
    
    /**
     * 保存所有文件夹展开状态到 localStorage
     */
    _saveFolderExpandStates() {
        try {
            localStorage.setItem('ait-sidebar-starred-folder-states', JSON.stringify(this.folderExpandStates));
        } catch (e) {
            // 忽略存储错误
        }
    }
    
    /**
     * 初始化侧边栏收藏模块
     * @param {string} platform - 平台标识（如 'gemini'）
     */
    async init(platform) {
        this.platform = platform;
        
        // 检查平台是否支持侧边栏收藏功能
        const platformInfo = getCurrentPlatform();
        if (!platformInfo || platformInfo.features?.sidebarStarred !== true) {
            return;
        }
        
        // 延迟初始化 FolderManager
        if (typeof FolderManager !== 'undefined' && typeof StorageAdapter !== 'undefined') {
            this.folderManager = new FolderManager(StorageAdapter);
        }
        
        // 尝试注入
        await this.tryInject();
        
        // 设置 DOM 观察器，监听侧边栏变化
        this.setupMutationObserver();
        
        // 监听存储变化
        this.setupStorageListener();
    }
    
    /**
     * 尝试注入收藏分组到侧边栏
     */
    async tryInject() {
        const target = this.getSidebarTarget();
        
        if (!target) {
            // 如果找不到目标，安排重试
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                setTimeout(() => this.tryInject(), this.retryInterval);
            }
            return;
        }
        
        // 重置重试计数
        this.retryCount = 0;
        
        // 检查是否已注入
        if (this.isInjected && this.container && document.body.contains(this.container)) {
            return;
        }
        
        // 注入收藏分组
        await this.inject(target);
    }
    
    /**
     * 获取侧边栏注入目标
     * @returns {Element|null}
     */
    getSidebarTarget() {
        if (this.platform === 'gemini') {
            return this.getGeminiSidebarTarget();
        }
        if (this.platform === 'chatgpt') {
            return this.getChatGPTSidebarTarget();
        }
        if (this.platform === 'deepseek') {
            return this.getDeepSeekSidebarTarget();
        }
        return null;
    }
    
    /**
     * 获取 Gemini 侧边栏目标
     * Gemini 的侧边栏结构可能有多种形式，使用多种选择器尝试
     */
    getGeminiSidebarTarget() {
        // 只查找 .chat-history 元素，找不到就不插入
        const chatHistory = document.querySelector('.chat-history');
        if (chatHistory) {
            return { container: chatHistory.parentElement, insertBefore: chatHistory };
        }
        return null;
    }
    
    /**
     * 获取 ChatGPT 侧边栏目标
     * ChatGPT 的侧边栏结构：nav 元素内包含对话列表
     * 目标：在 class 包含 "sidebar-expando-section" 的元素上方插入
     */
    getChatGPTSidebarTarget() {
        // 只查找 class 包含 "sidebar-expando-section" 的元素，找不到就不插入
        const expandoSection = document.querySelector('[class*="sidebar-expando-section"]');
        if (expandoSection) {
            return { container: expandoSection.parentElement, insertBefore: expandoSection };
        }
        return null;
    }
    
    /**
     * 获取 DeepSeek 侧边栏目标
     * 目标：在 class="ds-scroll-area" 的元素上方插入
     */
    getDeepSeekSidebarTarget() {
        // 只查找 .ds-scroll-area 元素，找不到就不插入
        const scrollArea = document.querySelector('.ds-scroll-area');
        if (scrollArea) {
            return { container: scrollArea.parentElement, insertBefore: scrollArea };
        }
        return null;
    }
    
    /**
     * 注入收藏分组
     * @param {Object} target - { container, insertBefore }
     */
    async inject(target) {
        // 创建收藏分组容器
        this.container = document.createElement('div');
        this.container.className = 'ait-sidebar-starred';
        this.container.setAttribute('data-ait-sidebar-starred', 'true');
        
        // ChatGPT 使用 Tailwind CSS，可能覆盖我们的样式，使用内联样式确保优先级
        if (this.platform === 'chatgpt') {
            this.container.style.cssText = `
                margin: 8px 8px 16px 8px !important;
                border-radius: 12px !important;
                background: rgba(255, 125, 3, 0.08) !important;
                border: 1px solid rgba(255, 125, 3, 0.15) !important;
                overflow: visible !important;
                height: auto !important;
                min-height: auto !important;
                max-height: none !important;
                display: block !important;
            `;
        }
        
        // 渲染内容
        await this.render();
        
        // 插入到目标位置
        if (target.insertBefore && target.insertBefore.parentNode) {
            target.insertBefore.parentNode.insertBefore(this.container, target.insertBefore);
        } else if (target.container) {
            // 作为第一个子元素插入
            target.container.insertBefore(this.container, target.container.firstChild);
        }
        
        this.isInjected = true;
    }
    
    /**
     * 渲染收藏分组内容（支持2级文件夹）
     */
    async render() {
        if (!this.container) return;
        
        // 获取文件夹树状结构
        let tree = { folders: [], uncategorized: [] };
        if (this.folderManager) {
            tree = await this.folderManager.getStarredByFolder();
        } else {
            // 没有 folderManager，使用扁平列表
            const starred = await this.getStarredItems();
            tree.uncategorized = starred.map(item => ({
                ...item,
                theme: item.question || item.theme || '未命名'
            }));
        }
        
        // 过滤出当前平台的收藏（递归过滤文件夹内容）
        const filterByPlatform = (items) => items.filter(item => this.isPlatformUrl(item.url));
        
        const filteredTree = {
            folders: tree.folders.map(folder => ({
                ...folder,
                items: filterByPlatform(folder.items),
                children: (folder.children || []).map(child => ({
                    ...child,
                    items: filterByPlatform(child.items)
                })).filter(child => child.items.length > 0)  // 移除空的子文件夹
            })).filter(folder => folder.items.length > 0 || folder.children.length > 0),  // 移除空文件夹
            uncategorized: filterByPlatform(tree.uncategorized)
        };
        
        // 统计当前平台的总收藏数
        let totalCount = filteredTree.uncategorized.length;
        for (const folder of filteredTree.folders) {
            totalCount += folder.items.length;
            for (const child of (folder.children || [])) {
                totalCount += child.items.length;
            }
        }
        
        // 构建 HTML
        this.container.innerHTML = '';
        
        // 标题栏
        const header = document.createElement('div');
        header.className = 'ait-sidebar-starred-header';
        
        // 展开/折叠图标
        const toggle = document.createElement('div');
        toggle.className = `ait-sidebar-starred-toggle ${this.isExpanded ? 'expanded' : ''}`;
        toggle.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 6 15 12 9 18"></polyline>
            </svg>
        `;
        
        // 标题（包含数量）
        const title = document.createElement('div');
        title.className = 'ait-sidebar-starred-title';
        title.innerHTML = `
            <svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span>${chrome.i18n.getMessage('vnkxpm') || '收藏'}</span>
            <span class="ait-sidebar-starred-count">${totalCount}</span>
        `;
        
        // "查看全部"按钮（放在标题栏右侧）
        const viewAllBtn = document.createElement('span');
        viewAllBtn.className = 'ait-sidebar-starred-view-all';
        viewAllBtn.textContent = chrome.i18n.getMessage('zxvkpm') || '查看全部';
        viewAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openPanelModal();
        });
        
        header.appendChild(toggle);
        header.appendChild(title);
        header.appendChild(viewAllBtn);
        
        // 点击标题栏（非"查看全部"区域）切换展开/折叠
        header.addEventListener('click', (e) => {
            if (!e.target.closest('.ait-sidebar-starred-view-all')) {
                this.toggleExpand();
            }
        });
        
        this.container.appendChild(header);
        
        // 列表容器
        const list = document.createElement('div');
        list.className = `ait-sidebar-starred-list ${this.isExpanded ? 'expanded' : ''}`;
        
        if (totalCount === 0) {
            // 空状态
            list.innerHTML = `
                <div class="ait-sidebar-starred-empty">
                    ${chrome.i18n.getMessage('jwvnkp') || '暂无数据'}
                </div>
            `;
        } else {
            // 先渲染默认文件夹（未分类）
            if (filteredTree.uncategorized.length > 0) {
                this.renderDefaultFolder(list, filteredTree.uncategorized);
            }
            
            // 渲染文件夹
            for (const folder of filteredTree.folders) {
                this.renderFolder(list, folder, 0);
            }
        }
        
        this.container.appendChild(list);
    }
    
    /**
     * 渲染默认文件夹（未分类）
     */
    renderDefaultFolder(container, items) {
        const folderId = 'default';
        const isExpanded = this.folderExpandStates[folderId] === true;
        
        const folderEl = document.createElement('div');
        folderEl.className = 'ait-sidebar-folder';
        folderEl.dataset.folderId = folderId;
        
        // 文件夹头部
        const folderHeader = document.createElement('div');
        folderHeader.className = 'ait-sidebar-folder-header';
        folderHeader.innerHTML = `
            <span class="ait-sidebar-folder-toggle ${isExpanded ? 'expanded' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 6 15 12 9 18"></polyline>
                </svg>
            </span>
            <span class="ait-sidebar-folder-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
            </span>
            <span class="ait-sidebar-folder-name">${chrome.i18n.getMessage('pkxvmz') || '默认文件夹'}</span>
            <span class="ait-sidebar-folder-count">${items.length}</span>
        `;
        
        folderHeader.addEventListener('click', () => this.toggleFolderExpand(folderId));
        folderEl.appendChild(folderHeader);
        
        // 文件夹内容
        const folderContent = document.createElement('div');
        folderContent.className = `ait-sidebar-folder-content ${isExpanded ? 'expanded' : ''}`;
        
        for (const item of items) {
            folderContent.appendChild(this.renderItem(item));
        }
        
        folderEl.appendChild(folderContent);
        container.appendChild(folderEl);
    }
    
    /**
     * 渲染文件夹（支持2级）
     * @param {HTMLElement} container - 容器
     * @param {Object} folder - 文件夹数据
     * @param {number} level - 层级（0=根，1=子）
     */
    renderFolder(container, folder, level = 0) {
        const folderId = folder.id;
        const isExpanded = this.folderExpandStates[folderId] === true;
        
        // 计算该文件夹的总收藏数（包括子文件夹）
        let folderTotalCount = folder.items.length;
        for (const child of (folder.children || [])) {
            folderTotalCount += child.items.length;
        }
        
        const folderEl = document.createElement('div');
        folderEl.className = `ait-sidebar-folder ait-sidebar-folder-level-${level}`;
        folderEl.dataset.folderId = folderId;
        
        // 文件夹头部
        const folderHeader = document.createElement('div');
        folderHeader.className = 'ait-sidebar-folder-header';
        folderHeader.innerHTML = `
            <span class="ait-sidebar-folder-toggle ${isExpanded ? 'expanded' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 6 15 12 9 18"></polyline>
                </svg>
            </span>
            <span class="ait-sidebar-folder-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
            </span>
            <span class="ait-sidebar-folder-name">${this.escapeHtml(folder.name)}</span>
            <span class="ait-sidebar-folder-count">${folderTotalCount}</span>
        `;
        
        folderHeader.addEventListener('click', () => this.toggleFolderExpand(folderId));
        folderEl.appendChild(folderHeader);
        
        // 文件夹内容
        const folderContent = document.createElement('div');
        folderContent.className = `ait-sidebar-folder-content ${isExpanded ? 'expanded' : ''}`;
        
        // 渲染当前文件夹的收藏项
        for (const item of folder.items) {
            folderContent.appendChild(this.renderItem(item));
        }
        
        // 渲染子文件夹（2级）
        if (folder.children && folder.children.length > 0) {
            for (const child of folder.children) {
                this.renderFolder(folderContent, child, level + 1);
            }
        }
        
        folderEl.appendChild(folderContent);
        container.appendChild(folderEl);
    }
    
    /**
     * 切换文件夹展开/折叠
     */
    toggleFolderExpand(folderId) {
        this.folderExpandStates[folderId] = !this.folderExpandStates[folderId];
        
        // 保存状态到 localStorage
        this._saveFolderExpandStates();
        
        const folderEl = this.container?.querySelector(`[data-folder-id="${folderId}"]`);
        if (folderEl) {
            // 使用 :scope > 只查找直接子元素，避免匹配到嵌套子文件夹的元素
            const header = folderEl.querySelector(':scope > .ait-sidebar-folder-header');
            const toggle = header?.querySelector('.ait-sidebar-folder-toggle');
            const content = folderEl.querySelector(':scope > .ait-sidebar-folder-content');
            
            if (toggle) {
                toggle.classList.toggle('expanded', this.folderExpandStates[folderId]);
            }
            if (content) {
                content.classList.toggle('expanded', this.folderExpandStates[folderId]);
            }
        }
    }
    
    /**
     * 渲染单个收藏项
     * @param {Object} item - 收藏项数据
     */
    renderItem(item) {
        const el = document.createElement('div');
        el.className = 'ait-sidebar-starred-item';
        el.dataset.turnId = item.turnId || '';  // 用于查找元素
        
        // 检查是否是当前对话（高亮）
        if (this.isCurrentConversation(item.url)) {
            el.classList.add('active');
        }
        
        // 完整标题（用于 tooltip）
        const fullTitle = item.theme || item.question || '未命名';
        // 截断标题（用于显示）
        const displayTitle = fullTitle.length > 20 ? fullTitle.substring(0, 20) + '...' : fullTitle;
        
        // 标题
        const titleEl = document.createElement('span');
        titleEl.className = 'ait-sidebar-starred-item-title';
        titleEl.textContent = displayTitle;
        el.appendChild(titleEl);
        
        // 取消收藏按钮（五角星，hover 时显示）
        const unstarBtn = document.createElement('span');
        unstarBtn.className = 'ait-sidebar-starred-item-unstar';
        unstarBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="1">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
        `;
        unstarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleUnstar(item);
        });
        el.appendChild(unstarBtn);
        
        // 鼠标悬停时显示 tooltip
        const tooltipId = `sidebar-starred-item-${item.turnId || Date.now()}`;
        el.addEventListener('mouseenter', () => {
            if (window.globalTooltipManager) {
                window.globalTooltipManager.show(tooltipId, 'button', el, fullTitle, {
                    placement: 'right',
                    maxWidth: 300
                });
            }
        });
        el.addEventListener('mouseleave', () => {
            if (window.globalTooltipManager) {
                window.globalTooltipManager.hide();
            }
        });
        
        // 点击跳转
        el.addEventListener('click', () => this.navigateTo(item));
        
        return el;
    }
    
    /**
     * 处理取消收藏
     * @param {Object} item - 收藏项数据
     */
    async handleUnstar(item) {
        // 使用 popconfirm 弹出确认对话框
        if (!window.globalPopconfirmManager) {
            console.error('[SidebarStarred] globalPopconfirmManager not available');
            return;
        }
        
        const confirmed = await window.globalPopconfirmManager.show({
            title: chrome.i18n.getMessage('qdyqxsc') || '确定要取消收藏吗？',
            confirmText: chrome.i18n.getMessage('vkmzpx') || '确定',
            cancelText: chrome.i18n.getMessage('pxvkmz') || '取消',
            confirmTextType: 'danger'
        });
        
        if (!confirmed) return;
        
        try {
            // 构建 storage key
            const turnId = item.turnId;
            if (!turnId) {
                console.error('[SidebarStarred] Item has no turnId:', item);
                return;
            }
            
            // 查找对应的 DOM 元素，添加淡出动画
            const itemEl = this.container?.querySelector(`[data-turn-id="${turnId}"]`);
            if (itemEl) {
                itemEl.classList.add('removing');
                // 等待动画完成后再删除
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            
            const key = `chatTimelineStar:${turnId}`;
            await StarStorageManager.remove(key);
            
            // 显示成功提示
            if (window.globalToastManager) {
                window.globalToastManager.success(
                    chrome.i18n.getMessage('pzmvkx') || '已取消收藏',
                    null,
                    { color: { light: { backgroundColor: '#0d0d0d', textColor: '#ffffff' }, dark: { backgroundColor: '#ffffff', textColor: '#1f2937' } } }
                );
            }
            
            // 列表会通过 storage listener 自动刷新
        } catch (error) {
            console.error('[SidebarStarred] Unstar failed:', error);
        }
    }
    
    /**
     * 获取收藏项列表
     */
    async getStarredItems() {
        if (typeof StarStorageManager === 'undefined') {
            return [];
        }
        
        try {
            const items = await StarStorageManager.getAll();
            // 按时间倒序
            items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return items;
        } catch (e) {
            console.error('[SidebarStarred] Failed to get starred items:', e);
            return [];
        }
    }
    
    /**
     * 判断 URL 是否属于当前平台
     */
    isPlatformUrl(url) {
        if (!url) return false;
        
        if (this.platform === 'gemini') {
            return url.includes('gemini.google.com');
        }
        
        if (this.platform === 'chatgpt') {
            return url.includes('chatgpt.com') || url.includes('chat.openai.com');
        }
        
        if (this.platform === 'deepseek') {
            return url.includes('chat.deepseek.com');
        }
        
        return false;
    }
    
    /**
     * 判断是否是当前正在查看的对话
     */
    isCurrentConversation(url) {
        if (!url) return false;
        
        const currentUrl = location.href;
        
        // 标准化 URL：忽略协议、尾部斜杠、query string 和 hash
        const normalizeUrl = (u) => {
            try {
                const urlObj = new URL(u);
                // 只比较 host + pathname
                return urlObj.host + urlObj.pathname.replace(/\/$/, '');
            } catch (e) {
                // URL 解析失败，使用简单处理
                return u.replace(/^https?:\/\//, '').replace(/[?#].*$/, '').replace(/\/$/, '');
            }
        };
        return normalizeUrl(currentUrl) === normalizeUrl(url);
    }
    
    /**
     * 跳转到收藏的对话
     */
    async navigateTo(item) {
        const url = item.url;
        if (!url) return;
        
        // 获取 nodeKey 用于定位到具体节点
        const nodeKey = item.nodeId !== undefined ? item.nodeId : item.index;
        const needsScroll = nodeKey !== undefined && nodeKey !== -1;
        
        // 判断是否是当前页面
        const isSamePage = location.href === url || 
            location.href.replace(/^https?:\/\//, '') === url.replace(/^https?:\/\//, '');
        
        if (isSamePage) {
            // 当前页面，滚动到目标位置
            if (needsScroll && window.timelineManager) {
                const tm = window.timelineManager;
                const marker = this.findMarkerByNodeKey(tm, nodeKey);
                if (marker && marker.element) {
                    tm.smoothScrollTo(marker.element);
                }
            }
        } else {
            // 不同页面，设置导航数据后跳转
            if (needsScroll && window.timelineManager) {
                await window.timelineManager.setNavigateDataForUrl(url, nodeKey);
            }
            location.href = url;
        }
    }
    
    /**
     * 根据 nodeKey 查找 marker
     */
    findMarkerByNodeKey(tm, nodeKey) {
        if (nodeKey === null || nodeKey === undefined) return null;
        
        // 优先使用 adapter 的查找方法
        if (tm.adapter?.findMarkerByStoredIndex) {
            return tm.adapter.findMarkerByStoredIndex(nodeKey, tm.markers, tm.markerMap);
        }
        
        // 默认逻辑
        if (tm.adapter?.generateTurnIdFromIndex) {
            const turnId = tm.adapter.generateTurnIdFromIndex(nodeKey);
            const marker = tm.markerMap?.get(turnId);
            if (marker) return marker;
        }
        
        // Fallback
        if (typeof nodeKey === 'number' && nodeKey >= 0 && nodeKey < tm.markers.length) {
            return tm.markers[nodeKey];
        }
        
        return null;
    }
    
    /**
     * 打开 PanelModal 的收藏标签
     */
    openPanelModal() {
        if (window.panelModal) {
            window.panelModal.show('starred');
        }
    }
    
    /**
     * 切换展开/折叠
     */
    toggleExpand() {
        this.isExpanded = !this.isExpanded;
        
        // 保存状态到 localStorage
        this._saveExpandState('main', this.isExpanded);
        
        const toggle = this.container?.querySelector('.ait-sidebar-starred-toggle');
        const list = this.container?.querySelector('.ait-sidebar-starred-list');
        
        if (toggle) {
            toggle.classList.toggle('expanded', this.isExpanded);
        }
        if (list) {
            list.classList.toggle('expanded', this.isExpanded);
        }
    }
    
    /**
     * 设置 DOM 观察器
     */
    setupMutationObserver() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
        
        this.mutationObserver = new MutationObserver((mutations) => {
            // 检查容器是否还在 DOM 中
            if (this.container && !document.body.contains(this.container)) {
                this.isInjected = false;
                this.tryInject();
            }
        });
        
        // 观察 body 的子元素变化
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
    
    /**
     * 设置存储监听器
     */
    setupStorageListener() {
        if (this._storageListener) {
            chrome.storage.onChanged.removeListener(this._storageListener);
        }
        
        this._storageListener = (changes, areaName) => {
            if (areaName !== 'local') return;
            
            // 检查收藏数据或文件夹数据是否变化
            if (changes.chatTimelineStars || changes.folders) {
                this.render();
            }
        };
        
        chrome.storage.onChanged.addListener(this._storageListener);
    }
    
    /**
     * 更新收藏列表
     */
    async update() {
        if (this.isInjected && this.container) {
            await this.render();
        }
    }
    
    /**
     * 清理
     */
    destroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        
        if (this._storageListener) {
            chrome.storage.onChanged.removeListener(this._storageListener);
            this._storageListener = null;
        }
        
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.container = null;
        this.isInjected = false;
    }
    
    /**
     * HTML 转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全局实例
window.sidebarStarredManager = new SidebarStarredManager();
