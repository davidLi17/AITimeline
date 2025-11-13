/**
 * Starred Tab - 收藏列表（支持2级文件夹）
 * 从 timeline-manager.js 完整迁移而来，并添加文件夹功能
 */

class StarredTab extends BaseTab {
    constructor(timelineManager) {
        super();
        this.id = 'starred';
        this.name = chrome.i18n.getMessage('starredList') || '收藏列表';
        this.icon = '⭐';
        
        // 引用 timeline manager（用于访问收藏数据和方法）
        this.timelineManager = timelineManager;
        
        // 文件夹管理器
        this.folderManager = new FolderManager(StorageAdapter);
        
        // DOM 元素
        this.listContainer = null;
        
        // 存储监听器
        this.storageListener = null;
        
        // 文件夹展开/折叠状态
        this.folderStates = {}; // { folderId: isExpanded }
    }
    
    /**
     * 渲染收藏列表内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'starred-tab-container';
        
        // 顶部操作栏
        const toolbar = document.createElement('div');
        toolbar.className = 'starred-toolbar';
        
        // 新建文件夹按钮
        const addFolderBtn = document.createElement('button');
        addFolderBtn.className = 'starred-toolbar-btn';
        addFolderBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
        `;
        addFolderBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager.show(
                'add-folder-btn',
                'button',
                addFolderBtn,
                chrome.i18n.getMessage('createFolder'),
                { placement: 'top' }
            );
        });
        addFolderBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        addFolderBtn.addEventListener('click', () => this.handleCreateFolder());
        
        toolbar.appendChild(addFolderBtn);
        container.appendChild(toolbar);
        
        // 列表容器
        this.listContainer = document.createElement('div');
        this.listContainer.className = 'starred-list-tree';
        
        container.appendChild(this.listContainer);
        
        return container;
    }
    
    /**
     * Tab 被激活时更新列表并监听存储变化
     */
    async mounted() {
        // 清空文件夹状态（不记录上次状态）
        this.folderStates = {};
        
        await this.updateList();
        
        // 监听存储变化
        this.storageListener = async () => {
            if (window.panelModal && window.panelModal.currentTabId === 'starred') {
                await this.updateList();
            }
        };
        
        try {
            StorageAdapter.addChangeListener(this.storageListener);
        } catch (e) {
            console.error('[StarredTab] Failed to add storage listener:', e);
        }
    }
    
    /**
     * Tab 被卸载时清理事件
     */
    unmounted() {
        // 清理 tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.hide();
        }
        
        // 移除存储监听器
        if (this.storageListener) {
            try {
                StorageAdapter.removeChangeListener(this.storageListener);
            } catch (e) {
                console.error('[StarredTab] Failed to remove storage listener:', e);
            }
            this.storageListener = null;
        }
    }
    
    /**
     * 更新收藏列表（树状结构）
     */
    async updateList() {
        if (!this.listContainer) return;
        
        // 隐藏tooltip
        if (window.globalTooltipManager) {
            window.globalTooltipManager.forceHideAll();
        }
        
        // 获取分组数据
        const tree = await this.folderManager.getStarredByFolder();
        
        // 清空列表
        this.listContainer.innerHTML = '';
        
        // 检查是否有任何数据
        const hasData = tree.folders.length > 0 || tree.uncategorized.length > 0;
        
        if (!hasData) {
            this.listContainer.innerHTML = `<div class="timeline-starred-empty">${chrome.i18n.getMessage('noStarredItems')}</div>`;
            return;
        }
        
        // 判断是否只有默认文件夹
        const onlyDefaultFolder = tree.folders.length === 0;
        
        // 始终先渲染默认文件夹（虚拟）
        this.renderUncategorized(tree.uncategorized, this.listContainer, onlyDefaultFolder);
        
        // 渲染文件夹树
        for (const folder of tree.folders) {
            this.renderFolder(folder, this.listContainer);
        }
    }
    
    /**
     * 渲染单个文件夹（递归渲染子文件夹）
     * @param {Object} folder - 文件夹数据
     * @param {HTMLElement} container - 容器元素
     * @param {number} level - 层级（0=根，1=子）
     */
    renderFolder(folder, container, level = 0) {
        const isExpanded = this.folderStates[folder.id] === true; // 默认收起
        
        const folderElement = document.createElement('div');
        folderElement.className = `folder-item folder-level-${level}`;
        folderElement.dataset.folderId = folder.id;
        
        // 文件夹头部
        const folderHeader = document.createElement('div');
        folderHeader.className = 'folder-header';
        
        // 展开/折叠图标
        const toggleIcon = document.createElement('span');
        toggleIcon.className = `folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggleIcon.addEventListener('click', () => this.toggleFolder(folder.id));
        
        // 文件夹图标和名称
        const folderInfo = document.createElement('div');
        folderInfo.className = 'folder-info';
        folderInfo.innerHTML = `
            <span class="folder-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
            </span>
            <span class="folder-name">${this.escapeHtml(folder.name)}</span>
            <span class="folder-count">(${folder.items.length + (folder.children || []).reduce((sum, child) => sum + child.items.length, 0)})</span>
        `;
        // 点击文件夹名称也可以展开/收起
        folderInfo.style.cursor = 'pointer';
        folderInfo.addEventListener('click', () => this.toggleFolder(folder.id));
        
        // 操作按钮
        const folderActions = document.createElement('div');
        folderActions.className = 'folder-actions';
        
        // 新建子文件夹按钮（只在根文件夹显示）
        if (level === 0) {
            const addChildBtn = document.createElement('button');
            addChildBtn.className = 'folder-action-btn';
            addChildBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    <line x1="12" y1="11" x2="12" y2="17"/>
                    <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
            `;
            addChildBtn.addEventListener('mouseenter', () => {
                window.globalTooltipManager.show(
                    `add-child-btn-${folder.id}`,
                    'button',
                    addChildBtn,
                    chrome.i18n.getMessage('createSubfolder'),
                    { placement: 'top' }
                );
            });
            addChildBtn.addEventListener('mouseleave', () => {
                window.globalTooltipManager.hide();
            });
            addChildBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCreateFolder(folder.id);
            });
            folderActions.appendChild(addChildBtn);
        }
        
        // 编辑按钮
        const editBtn = document.createElement('button');
        editBtn.className = 'folder-action-btn';
        editBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        `;
        editBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager.show(
                `edit-btn-${folder.id}`,
                'button',
                editBtn,
                chrome.i18n.getMessage('edit'),
                { placement: 'top' }
            );
        });
        editBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleEditFolder(folder.id, folder.name);
        });
        folderActions.appendChild(editBtn);
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'folder-action-btn';
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                <line x1="10" y1="11" x2="10" y2="17"/>
                <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
        `;
        deleteBtn.addEventListener('mouseenter', () => {
            window.globalTooltipManager.show(
                `delete-btn-${folder.id}`,
                'button',
                deleteBtn,
                chrome.i18n.getMessage('delete'),
                { placement: 'top' }
            );
        });
        deleteBtn.addEventListener('mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDeleteFolder(folder.id);
        });
        folderActions.appendChild(deleteBtn);
        
        folderHeader.appendChild(toggleIcon);
        folderHeader.appendChild(folderInfo);
        folderHeader.appendChild(folderActions);
        folderElement.appendChild(folderHeader);
        
        // 文件夹内容（可折叠）
        const folderContent = document.createElement('div');
        folderContent.className = `folder-content ${isExpanded ? 'expanded' : ''}`;
        
        // 渲染当前文件夹的收藏项
        for (const item of folder.items) {
            folderContent.appendChild(this.renderStarredItem(item));
        }
        
        // 递归渲染子文件夹
        if (folder.children && folder.children.length > 0) {
            for (const childFolder of folder.children) {
                this.renderFolder(childFolder, folderContent, level + 1);
            }
        }
        
        folderElement.appendChild(folderContent);
        container.appendChild(folderElement);
    }
    
    /**
     * 渲染默认文件夹（虚拟，不存储）
     * @param {Array} items - 未分类的收藏项
     * @param {HTMLElement} container - 容器元素
     * @param {boolean} onlyDefaultFolder - 是否只有默认文件夹（如果是，则默认展开）
     */
    renderUncategorized(items, container, onlyDefaultFolder = false) {
        
        // 如果只有默认文件夹且有收藏项，则默认展开
        const shouldAutoExpand = onlyDefaultFolder && items.length > 0;
        const isExpanded = shouldAutoExpand || this.folderStates['default'] === true;
        
        const defaultFolder = document.createElement('div');
        defaultFolder.className = 'folder-item default-folder';
        defaultFolder.dataset.folderId = 'default';
        
        // 文件夹头部
        const header = document.createElement('div');
        header.className = 'folder-header';
        
        // 展开/折叠图标
        const toggleIcon = document.createElement('span');
        toggleIcon.className = `folder-toggle ${isExpanded ? 'expanded' : ''}`;
        toggleIcon.addEventListener('click', () => this.toggleFolder('default'));
        
        // 文件夹信息
        const folderInfo = document.createElement('div');
        folderInfo.className = 'folder-info';
        folderInfo.innerHTML = `
            <span class="folder-icon">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                </svg>
            </span>
            <span class="folder-name">${chrome.i18n.getMessage('defaultFolder')}</span>
            <span class="folder-count">(${items.length})</span>
        `;
        // 点击文件夹名称也可以展开/收起
        folderInfo.style.cursor = 'pointer';
        folderInfo.addEventListener('click', () => this.toggleFolder('default'));
        
        header.appendChild(toggleIcon);
        header.appendChild(folderInfo);
        defaultFolder.appendChild(header);
        
        // 文件夹内容
        const content = document.createElement('div');
        content.className = `folder-content ${isExpanded ? 'expanded' : ''}`;
        
        
        for (const item of items) {
            content.appendChild(this.renderStarredItem(item));
        }
        
        defaultFolder.appendChild(content);
        container.appendChild(defaultFolder);
    }
    
    /**
     * 渲染单个收藏项
     */
    renderStarredItem(item) {
        
        const itemElement = document.createElement('div');
        itemElement.className = 'timeline-starred-item';
        itemElement.dataset.turnId = item.turnId;
        
        // 获取网站信息
        const siteInfo = this.getSiteInfo(item.url);
        
        // 网站logo和标签
        const siteTag = document.createElement('div');
        siteTag.className = 'timeline-starred-item-tag';
        
        if (siteInfo.logo) {
            const logo = document.createElement('img');
            logo.src = siteInfo.logo;
            logo.className = 'timeline-starred-item-logo';
            logo.alt = siteInfo.name;
            siteTag.appendChild(logo);
        } else {
            siteTag.textContent = siteInfo.name;
        }
        
        itemElement.appendChild(siteTag);
        
        // 问题文本
        const question = document.createElement('div');
        question.className = 'timeline-starred-item-question';
        
        const questionText = document.createElement('div');
        questionText.className = 'timeline-starred-item-question-text';
        questionText.textContent = item.theme;
        questionText.title = item.theme;
        
        // 点击跳转
        questionText.addEventListener('click', () => {
            window.open(item.url, '_blank');
            if (window.panelModal) {
                window.panelModal.hide();
            }
        });
        
        question.appendChild(questionText);
        itemElement.appendChild(question);
        
        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'timeline-starred-item-actions';
        
        // 移动按钮
        const moveBtn = this.createActionButton('move', chrome.i18n.getMessage('move'), () => this.handleMoveStarred(item.turnId));
        actions.appendChild(moveBtn);
        
        // 编辑按钮
        const editBtn = this.createActionButton('edit', chrome.i18n.getMessage('edit'), () => this.handleEditStarred(item.turnId, item.theme));
        actions.appendChild(editBtn);
        
        // 复制内容按钮
        const copyContentBtn = this.createActionButton('copy', chrome.i18n.getMessage('copyContent') || '复制内容', () => this.handleCopy(item.theme));
        actions.appendChild(copyContentBtn);
        
        // 复制链接按钮
        const copyLinkBtn = this.createActionButton('link', chrome.i18n.getMessage('copyLink'), () => this.handleCopy(item.url));
        actions.appendChild(copyLinkBtn);
        
        // 取消收藏按钮
        const starBtn = this.createActionButton('star', chrome.i18n.getMessage('unstar'), () => this.handleUnstar(item.turnId, item.url));
        actions.appendChild(starBtn);
        
        itemElement.appendChild(actions);
        
        return itemElement;
    }
    
    /**
     * 创建操作按钮
     */
    createActionButton(type, title, onClick) {
        const button = document.createElement('button');
        button.className = `timeline-starred-item-${type}`;
        
        // 添加 tooltip（使用 GlobalTooltipManager）
        button.addEventListener('mouseenter', () => {
            window.globalTooltipManager.show(
                `starred-item-${type}-btn`,
                'button',
                button,
                title,
                { placement: 'top' }
            );
        });
        button.addEventListener('mouseleave', () => {
            window.globalTooltipManager.hide();
        });
        
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        
        // 添加 SVG 图标
        let svgHTML = '';
        switch (type) {
            case 'move':
                // 转移图标（双向箭头）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="17 1 21 5 17 9"/>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                    <polyline points="7 23 3 19 7 15"/>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>`;
                break;
            case 'edit':
                // 编辑图标（铅笔）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>`;
                break;
            case 'copy':
                // 复制内容图标（双文档）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>`;
                break;
            case 'link':
                // 复制链接图标（链接符号）
                svgHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>`;
                break;
            case 'star':
                // 取消收藏图标（实心五角星）
                svgHTML = `<svg viewBox="0 0 24 24" fill="rgb(255, 125, 3)" stroke="rgb(255, 125, 3)" stroke-width="0.5">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>`;
                break;
        }
        
        if (svgHTML) {
            button.innerHTML = svgHTML;
        }
        
        return button;
    }
    
    /**
     * 切换文件夹展开/折叠
     */
    toggleFolder(folderId) {
        // 保持与 renderFolder 逻辑一致：默认收起，只有明确为 true 才展开
        const isExpanded = this.folderStates[folderId] === true;
        this.folderStates[folderId] = !isExpanded;
        
        const folderElement = this.listContainer.querySelector(`[data-folder-id="${folderId}"]`);
        if (folderElement) {
            const toggle = folderElement.querySelector('.folder-toggle');
            const content = folderElement.querySelector('.folder-content');
            
            if (toggle && content) {
                if (this.folderStates[folderId]) {
                    toggle.classList.add('expanded');
                    content.classList.add('expanded');
                } else {
                    toggle.classList.remove('expanded');
                    content.classList.remove('expanded');
                }
            }
        }
    }
    
    /**
     * 处理创建文件夹
     */
    async handleCreateFolder(parentId = null) {
        try {
            const parentPath = parentId ? await this.folderManager.getFolderPath(parentId) : '';
            const title = parentId 
                ? chrome.i18n.getMessage('createSubfolderIn').replace('{folderName}', parentPath)
                : chrome.i18n.getMessage('createNewFolder');
            
            const name = await window.globalInputModal.show({
                title: title,
                defaultValue: '',
                placeholder: chrome.i18n.getMessage('folderNamePlaceholder'),
                required: true,
                requiredMessage: chrome.i18n.getMessage('folderNameRequired'),
                maxLength: 10
            });
            
            if (!name || !name.trim()) {
                return;
            }
            
            // 检查名称是否已存在
            const exists = await this.folderManager.isFolderNameExists(name.trim(), parentId);
            if (exists) {
                window.globalToastManager.error(chrome.i18n.getMessage('folderNameExists'));
                return;
            }
            
            await this.folderManager.createFolder(name.trim(), parentId);
            window.globalToastManager.success(chrome.i18n.getMessage('folderCreated'));
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Create folder failed:', error);
            if (error.message) {
                window.globalToastManager.error(error.message);
            }
        }
    }
    
    /**
     * 处理编辑文件夹
     */
    async handleEditFolder(folderId, currentName) {
        try {
            const newName = await window.globalInputModal.show({
                title: chrome.i18n.getMessage('editFolderName'),
                defaultValue: currentName,
                placeholder: chrome.i18n.getMessage('newNamePlaceholder'),
                required: true,
                requiredMessage: '文件夹名称不能为空',
                maxLength: 10
            });
            
            if (!newName || !newName.trim() || newName.trim() === currentName) {
                return;
            }
            
            // 获取父ID以检查同级名称
            const folders = await this.folderManager.getFolders();
            const folder = folders.find(f => f.id === folderId);
            const parentId = folder ? folder.parentId : null;
            
            // 检查名称是否已存在
            const exists = await this.folderManager.isFolderNameExists(newName.trim(), parentId, folderId);
            if (exists) {
                window.globalToastManager.error('文件夹名称已存在');
                return;
            }
            
            await this.folderManager.updateFolder(folderId, newName.trim());
            window.globalToastManager.success(chrome.i18n.getMessage('folderUpdated'));
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Edit folder failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('editFailed'));
        }
    }
    
    /**
     * 处理删除文件夹
     */
    async handleDeleteFolder(folderId) {
        try {
            // 获取文件夹信息
            const tree = await this.folderManager.getStarredByFolder();
            let folderData = tree.folders.find(f => f.id === folderId);
            
            if (!folderData) {
                // 可能是子文件夹
                for (const parent of tree.folders) {
                    if (parent.children) {
                        folderData = parent.children.find(c => c.id === folderId);
                        if (folderData) break;
                    }
                }
            }
            
            if (!folderData) {
                window.globalToastManager.error(chrome.i18n.getMessage('folderNotFound'));
                return;
            }
            
            const totalItems = folderData.items.length + 
                (folderData.children || []).reduce((sum, child) => sum + child.items.length, 0);
            
            if (totalItems > 0) {
                const message = chrome.i18n.getMessage('confirmDeleteFolder')
                    .replace('{folderName}', folderData.name)
                    .replace('{count}', totalItems);
                const confirmed = confirm(message);
                if (!confirmed) return;
            }
            
            await this.folderManager.deleteFolder(folderId, null);
            window.globalToastManager.success(chrome.i18n.getMessage('folderDeleted'));
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Delete folder failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('deleteFailed'));
        }
    }
    
    /**
     * 处理移动收藏项
     */
    async handleMoveStarred(turnId) {
        try {
            const folders = await this.folderManager.getFolders();
            
            if (folders.length === 0) {
                window.globalToastManager.info(chrome.i18n.getMessage('createFolderFirst'));
                return;
            }
            
            // TODO: 显示文件夹选择对话框（可以使用简单的prompt或自定义modal）
            // 这里先用简单的方式
            let options = '请选择目标文件夹（输入序号）：\n0. 未分类\n';
            folders.forEach((folder, index) => {
                const prefix = folder.parentId ? '  └─ ' : '';
                options += `${index + 1}. ${prefix}${folder.name}\n`;
            });
            
            const choice = prompt(options);
            if (choice === null) return;
            
            const index = parseInt(choice);
            if (isNaN(index) || index < 0 || index > folders.length) {
                window.globalToastManager.error(chrome.i18n.getMessage('invalidSelection'));
                return;
            }
            
            const targetFolderId = index === 0 ? null : folders[index - 1].id;
            await this.folderManager.moveStarredToFolder(turnId, targetFolderId);
            window.globalToastManager.success(chrome.i18n.getMessage('moved'));
            await this.updateList();
        } catch (error) {
            console.error('[StarredTab] Move starred failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('moveFailed'));
        }
    }
    
    /**
     * 处理编辑收藏项
     */
    async handleEditStarred(turnId, currentTheme) {
        try {
            const newTheme = await window.globalInputModal.show({
                title: chrome.i18n.getMessage('editStarredContent') || '编辑收藏标题',
                defaultValue: currentTheme,
                placeholder: chrome.i18n.getMessage('themePlaceholder') || '请输入',
                required: true,
                requiredMessage: chrome.i18n.getMessage('themeRequired') || '标题不能为空'
            });
            
            if (!newTheme || !newTheme.trim()) {
                return;
            }
            
            // turnId 格式：url:index
            const key = `chatTimelineStar:${turnId}`;
            const item = await StorageAdapter.get(key);
            
            if (item) {
                // 更新 question 字段（原有字段名）
                item.question = newTheme.trim();
                await StorageAdapter.set(key, item);
                window.globalToastManager.success(chrome.i18n.getMessage('updated'));
                // 列表会通过 storage listener 自动刷新
            }
        } catch (error) {
            console.error('[StarredTab] Edit starred failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('editFailed') || '编辑失败');
        }
    }
    
    /**
     * 处理复制（内容或链接）
     */
    async handleCopy(text) {
        try {
            await navigator.clipboard.writeText(text);
            window.globalToastManager.success(chrome.i18n.getMessage('copied'));
        } catch (err) {
            // Fallback: 使用传统方法
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                window.globalToastManager.success(chrome.i18n.getMessage('copied'));
            } catch (e) {
                console.error('[StarredTab] Copy failed:', e);
                window.globalToastManager.error(chrome.i18n.getMessage('copyFailed') || '复制失败');
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }
    
    /**
     * 处理取消收藏
     */
    async handleUnstar(turnId, url) {
        try {
            // turnId 格式：url:index
            const key = `chatTimelineStar:${turnId}`;
            await StorageAdapter.remove(key);
            
            // 显示成功提示
            window.globalToastManager.success(chrome.i18n.getMessage('unstarSuccess') || '已取消收藏');
            
            // 自动刷新列表（通过 storage listener）
        } catch (error) {
            console.error('[StarredTab] Unstar failed:', error);
            window.globalToastManager.error(chrome.i18n.getMessage('unstarFailed') || '取消收藏失败');
        }
    }
    
    /**
     * 获取网站信息
     */
    getSiteInfo(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            const siteNameMap = {
                'chatgpt.com': { name: 'ChatGPT', color: '#10a37f', logo: chrome.runtime.getURL('images/logo/chatgpt.webp') },
                'gemini.google.com': { name: 'Gemini', color: '#1a73e8', logo: chrome.runtime.getURL('images/logo/gemini.webp') },
                'chat.deepseek.com': { name: 'DeepSeek', color: '#0084ff', logo: chrome.runtime.getURL('images/logo/deepseek.webp') },
                'x.com': { name: 'Grok', color: '#000000', logo: chrome.runtime.getURL('images/logo/grok.webp') }
            };
            
            return siteNameMap[hostname] || { name: hostname, color: '#666', logo: null };
        } catch (e) {
            return { name: 'Unknown', color: '#666', logo: null };
        }
    }
    
    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
