/**
 * ChatTimeRecorder - 提问时间记录器
 * 
 * 完全独立的模块，负责：
 * 1. 监听 timeline:nodesChange 事件
 * 2. 检测新增节点并记录时间
 * 3. 渲染时间标签到对话节点上
 * 
 * 与 TimelineManager 通过事件通信，代码完全解耦
 * 
 * 简化设计：不使用内存缓存，每次直接从 storage 读取
 */
class ChatTimeRecorder {
    constructor() {
        // 状态
        this.enabled = false;
        this._pendingRecord = null;
        this._currentAdapter = null;  // 当前事件周期内的 adapter 缓存
        this._labelVisible = true;    // 时间标签是否显示（默认显示）
        
        // 事件处理函数（绑定 this）
        this._boundOnNodesChange = this._onNodesChange.bind(this);
    }

    /**
     * 获取适配器
     * @returns {Object|null}
     */
    _getAdapter() {
        // 优先使用事件周期内缓存的 adapter
        const adapter = this._currentAdapter || window.timelineManager?.adapter || null;
        // 验证 adapter 有效性（必须有 getUserMessageSelector 方法）
        if (adapter && typeof adapter.getUserMessageSelector !== 'function') {
            return null;
        }
        return adapter;
    }

    /**
     * 获取用户消息元素列表
     * @param {Object} adapter
     * @returns {NodeList|Array}
     */
    _getUserTurnElements(adapter) {
        if (!adapter) return [];
        const selector = adapter.getUserMessageSelector();
        if (!selector) return [];
        const container = window.timelineManager?.conversationContainer || document;
        return container.querySelectorAll(selector);
    }

    /**
     * 获取平台特性
     * @returns {Object}
     */
    _getPlatformFeatures() {
        return getCurrentPlatform()?.features || {};
    }

    /**
     * 初始化，设置事件监听
     */
    async init() {
        // 检查当前平台是否启用 chatTimes 功能
        const features = this._getPlatformFeatures();
        this.enabled = features?.chatTimes === true;
        
        if (!this.enabled) {
            return;
        }
        
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            // 读取时间标签显示设置（默认开启）
            const result = await chrome.storage.local.get('chatTimeLabelEnabled');
            this._labelVisible = result.chatTimeLabelEnabled !== false;
            
            // 更新 lastVisit
            await ChatTimeStorageManager.updateLastVisit(conversationKey);
            
            // stableNodeId=true 的平台，清理临时 ID（如 gemini-0）
            if (features?.stableNodeId === true) {
                await ChatTimeStorageManager.cleanupTempIds(conversationKey);
            }
        } catch (e) {
            // 上下文失效时静默处理
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to update lastVisit:', e);
            }
        }
        
        // 设置事件监听
        window.addEventListener('timeline:nodesChange', this._boundOnNodesChange);
        
        // 初始渲染（页面已有节点时）
        this._renderTimeLabels();
    }

    /**
     * 检查功能是否启用
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * 获取会话标识键
     * @returns {string}
     */
    getConversationKey() {
        const url = location.href;
        return url.replace(/^https?:\/\//, '').split('?')[0].split('#')[0];
    }

    /**
     * 节点变化事件处理
     * @private
     */
    async _onNodesChange(event) {
        if (!this.enabled) return;
        
        // 优先从事件 detail 中获取 adapter，并缓存供后续方法使用
        const adapter = event.detail?.adapter || window.timelineManager?.adapter;
        if (!adapter) return;
        this._currentAdapter = adapter;
        
        // 获取最新的用户回合元素
        const userTurnElements = this._getUserTurnElements(adapter);
        if (!userTurnElements || userTurnElements.length === 0) return;
        
        // ✅ 核心判断：AI 正在生成 = 用户刚发送了消息
        if (!adapter.isAIGenerating()) {
            // AI 未在生成：页面刷新/恢复/浏览旧对话
            // 只渲染已有时间，不记录新时间
            this._renderTimeLabels();
            return;
        }
        
        // 检查最后一个节点是否未被记录过
        const lastIndex = userTurnElements.length - 1;
        const lastElement = userTurnElements[lastIndex];
        if (!lastElement) return;
        
        const lastNodeId = adapter.generateTurnId(lastElement, lastIndex);
        
        // 从 storage 读取判断是否已记录
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            const recordedNodes = data.nodes || {};
            
            if (recordedNodes[String(lastNodeId)]) {
                // 节点已被记录过，只渲染
                this._renderTimeLabels();
                return;
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to check recorded nodes:', e);
            }
            return;
        }
        
        // 判断是否为新对话（第一个节点 + AI 正在生成）
        const isNewConversation = (userTurnElements.length === 1);
        
        // 检查平台是否使用稳定的节点 ID
        const features = this._getPlatformFeatures();
        const usesStableId = features?.stableNodeId || false;
        const isTempId = lastNodeId.endsWith(`-${lastIndex}`);
        
        // 直接用当前 ID（可能是临时 ID）记录时间
        const timestamp = Date.now();
        const newNode = { nodeId: lastNodeId, index: lastIndex };
        this._recordNodes([newNode], timestamp, isNewConversation);
        
        // 根据配置决定时间显示时机
        const showOn = features?.chatTimesShowOn || 'immediate';
        if (showOn === 'afterGeneration') {
            // 等待 AI 生成完成后再渲染时间标签
            this._waitForGenerationComplete(adapter);
        }
        
        if (usesStableId && isTempId) {
            // 使用稳定 ID 的平台，但还没有真正的 ID
            // 保存待处理记录，等待 ID 变化后迁移
            this._pendingRecord = {
                index: lastIndex,
                tempId: lastNodeId
            };
            // 设置轮询检查 ID 变化
            this._pollForRealId(adapter, lastIndex);
        }
    }

    /**
     * 轮询检查真实 ID（用于 Gemini 等平台的延迟 ID 分配）
     * @private
     */
    _pollForRealId(adapter, expectedIndex, retryCount = 0) {
        if (!this._pendingRecord || retryCount > 10) {
            this._pendingRecord = null;
            return;
        }
        
        setTimeout(() => {
            if (!this._pendingRecord) return;
            
            const userTurnElements = this._getUserTurnElements(adapter);
            const lastElement = userTurnElements?.[expectedIndex];
            if (!lastElement) {
                this._pendingRecord = null;
                return;
            }
            
            const nodeId = adapter.generateTurnId(lastElement, expectedIndex);
            const hasRealId = !nodeId.endsWith(`-${expectedIndex}`);
            
            if (hasRealId) {
                // 获取到真正的 ID，迁移数据
                const pending = this._pendingRecord;
                this._migrateNodeId(pending.tempId, nodeId);
                this._pendingRecord = null;
            } else {
                // 继续轮询
                this._pollForRealId(adapter, expectedIndex, retryCount + 1);
            }
        }, 500);
    }
    
    /**
     * 迁移节点 ID（从临时 ID 迁移到真实 ID）
     * @private
     */
    async _migrateNodeId(tempId, realId) {
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            const migrated = await ChatTimeStorageManager.migrateNodeId(conversationKey, tempId, realId);
            if (migrated) {
                // 检查是否需要延迟渲染
                const features = this._getPlatformFeatures();
                const showOn = features?.chatTimesShowOn || 'immediate';
                if (showOn === 'immediate') {
                    // 重新渲染时间标签
                    this._renderTimeLabels();
                }
                // afterGeneration 和 delayed 由各自的逻辑处理
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to migrate node ID:', e);
            }
        }
    }

    /**
     * 记录节点时间
     * @private
     */
    async _recordNodes(newNodes, customTimestamp, isNewConversation = false) {
        if (!this.enabled || !newNodes || newNodes.length === 0) return;
        
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        try {
            // 新对话时，先设置 createTime
            if (isNewConversation) {
                await ChatTimeStorageManager.setCreateTime(conversationKey);
            }
            
            const timestamp = customTimestamp || Date.now();
            const nodesToRecord = newNodes.map(n => ({ nodeId: String(n.nodeId), timestamp }));
            
            if (nodesToRecord.length === 0) return;
            
            // batchSetNodeTimes 内部会跳过已存在的节点
            const addedCount = await ChatTimeStorageManager.batchSetNodeTimes(conversationKey, nodesToRecord);
            if (addedCount > 0) {
                // 检查是否需要延迟渲染
                const features = this._getPlatformFeatures();
                const showOn = features?.chatTimesShowOn || 'immediate';
                if (showOn === 'immediate') {
                    // 立即渲染时间标签
                    this._renderTimeLabels();
                }
                // afterGeneration 和 delayed 由 _onNodesChange 中的逻辑处理
            }
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to record node times:', e);
            }
        }
    }

    /**
     * 渲染所有节点的时间标签
     * @private
     */
    async _renderTimeLabels() {
        if (!this.enabled) return;
        
        // 如果设置为不显示时间标签，直接返回（但时间记录仍会保存）
        if (!this._labelVisible) return;
        
        const adapter = this._getAdapter();
        if (!adapter) return;
        
        const userTurnElements = this._getUserTurnElements(adapter);
        if (!userTurnElements || userTurnElements.length === 0) return;
        
        // 从 storage 读取时间数据
        const conversationKey = this.getConversationKey();
        if (!conversationKey) return;
        
        let nodeTimestamps = {};
        try {
            const data = await ChatTimeStorageManager.getByConversation(conversationKey);
            nodeTimestamps = data.nodes || {};
        } catch (e) {
            if (!e.message?.includes('Extension context invalidated')) {
                console.error('[ChatTimeRecorder] Failed to load node times:', e);
            }
            return;
        }
        
        userTurnElements.forEach((element, index) => {
            const nodeId = adapter.generateTurnId(element, index);
            const timestamp = nodeTimestamps[String(nodeId)];
            
            if (!timestamp) return;
            
            // 检查是否已经有时间标签（在 element 层级查找）
            const existingLabel = element.querySelector('.ait-node-time-label');
            if (existingLabel) {
                // 更新已有标签
                existingLabel.textContent = this.formatNodeTime(timestamp);
                return;
            }
            
            // 确保 element 有相对定位（时间标签相对于 element 定位）
            const computedStyle = window.getComputedStyle(element);
            if (computedStyle.position === 'static') {
                element.style.position = 'relative';
            }
            
            // 创建时间标签
            const timeLabel = document.createElement('div');
            timeLabel.className = 'ait-node-time-label';
            timeLabel.textContent = this.formatNodeTime(timestamp);
            
            // 应用平台自定义位置
            const position = adapter.getTimeLabelPosition();
            if (position.top) timeLabel.style.top = position.top;
            if (position.right) timeLabel.style.right = position.right;
            if (position.left) timeLabel.style.left = position.left;
            if (position.bottom) timeLabel.style.bottom = position.bottom;
            
            // 插入到 element（消息元素）层级，不受内部 overflow 影响
            element.insertBefore(timeLabel, element.firstChild);
        });
    }

    /**
     * 等待 AI 生成完成后渲染时间标签
     * 用于 chatTimesShowOn: 'afterGeneration' 的平台（如 DeepSeek）
     * @private
     */
    _waitForGenerationComplete(adapter) {
        // 清除之前的定时器
        if (this._labelRefreshTimer) {
            clearInterval(this._labelRefreshTimer);
            this._labelRefreshTimer = null;
        }
        
        this._labelRefreshTimer = setInterval(() => {
            // 检查 AI 是否还在生成
            const stillGenerating = adapter.isAIGenerating();
            
            if (!stillGenerating) {
                // AI 生成完成，停止检查
                clearInterval(this._labelRefreshTimer);
                this._labelRefreshTimer = null;
                // 生成完成后渲染时间标签
                this._renderTimeLabels();
            }
        }, 1000);
    }

    /**
     * 格式化时间显示
     * @param {number} timestamp
     * @returns {string}
     */
    formatNodeTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const isThisYear = date.getFullYear() === now.getFullYear();
        
        if (isToday) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (isThisYear) {
            return date.toLocaleDateString('zh-CN', { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
        
        return date.toLocaleDateString('zh-CN', { 
            year: 'numeric',
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    /**
     * 重置状态（会话切换时调用）
     */
    async reset() {
        this._pendingRecord = null;
        
        // 清理定时器，防止会话切换后旧定时器继续运行
        if (this._labelRefreshTimer) {
            clearInterval(this._labelRefreshTimer);
            this._labelRefreshTimer = null;
        }
        
        // 更新新会话的 lastVisit
        if (this.enabled) {
            const conversationKey = this.getConversationKey();
            if (conversationKey) {
                try {
                    await ChatTimeStorageManager.updateLastVisit(conversationKey);
                } catch (e) {
                    if (!e.message?.includes('Extension context invalidated')) {
                        console.error('[ChatTimeRecorder] Failed to update lastVisit:', e);
                    }
                }
            }
        }
    }

    /**
     * 更新时间标签显示状态
     * @param {boolean} visible - 是否显示时间标签
     */
    updateLabelVisibility(visible) {
        this._labelVisible = visible;
        
        if (visible) {
            // 显示：重新渲染时间标签
            this._renderTimeLabels();
        } else {
            // 隐藏：移除所有时间标签
            const labels = document.querySelectorAll('.ait-node-time-label');
            labels.forEach(label => label.remove());
            
            // 清理等待生成完成的定时器（避免空跑）
            if (this._labelRefreshTimer) {
                clearInterval(this._labelRefreshTimer);
                this._labelRefreshTimer = null;
            }
        }
    }

    /**
     * 销毁，清理状态和事件监听
     */
    destroy() {
        // 移除事件监听
        window.removeEventListener('timeline:nodesChange', this._boundOnNodesChange);
        
        // 清理定时器
        if (this._labelRefreshTimer) {
            clearInterval(this._labelRefreshTimer);
            this._labelRefreshTimer = null;
        }
        
        // 清理状态
        this._pendingRecord = null;
        this.enabled = false;
    }
}

// 创建全局单例
window.chatTimeRecorder = null;

/**
 * 初始化 ChatTimeRecorder（由 TimelineManager 调用）
 */
function initChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.destroy();
    }
    window.chatTimeRecorder = new ChatTimeRecorder();
    window.chatTimeRecorder.init();
}

/**
 * 销毁 ChatTimeRecorder（由 TimelineManager 调用）
 */
function destroyChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.destroy();
        window.chatTimeRecorder = null;
    }
}

/**
 * 重置 ChatTimeRecorder（会话切换时调用）
 */
function resetChatTimeRecorder() {
    if (window.chatTimeRecorder) {
        window.chatTimeRecorder.reset();
    }
}

// 导出到全局
window.ChatTimeRecorder = ChatTimeRecorder;
window.initChatTimeRecorder = initChatTimeRecorder;
window.destroyChatTimeRecorder = destroyChatTimeRecorder;
window.resetChatTimeRecorder = resetChatTimeRecorder;
