/**
 * DataSync Tab - 数据导入导出
 * 
 * 功能：
 * - 导出：将 Storage 数据导出为 JSON 文件
 * - 导入：从 JSON 文件导入数据（支持覆盖/合并）
 */

class DataSyncTab extends BaseTab {
    constructor() {
        super();
        this.id = 'data-sync';
        this.name = chrome.i18n.getMessage('dataSyncTabName') || '数据同步';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 3l4 4-4 4"/>
            <path d="M20 7H4"/>
            <path d="M8 21l-4-4 4-4"/>
            <path d="M4 17h16"/>
        </svg>`;
        
        // Toast 主题颜色配置（跟随项目主题变量）
        this.toastColors = {
            light: {
                backgroundColor: '#0d0d0d',
                textColor: '#ffffff',
                borderColor: '#0d0d0d'
            },
            dark: {
                backgroundColor: '#262626',
                textColor: '#f5f5f5',
                borderColor: '#404040'
            }
        };
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'data-sync-tab';
        
        container.innerHTML = `
            <div class="sync-section">
                <div class="sync-title">${chrome.i18n.getMessage('exportTitle') || '导出数据'}</div>
                <div class="sync-hint">${chrome.i18n.getMessage('exportHint') || '将本插件在本浏览器的数据导出为 JSON 文件，用于备份或迁移到其他浏览器。'}</div>
                <button class="sync-btn export-btn" id="export-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                        <line x1="12" y1="12" x2="12" y2="18"/>
                        <polyline points="9,15 12,18 15,15"/>
                    </svg>
                    ${chrome.i18n.getMessage('exportBtn') || '导出数据'}
                </button>
            </div>
            
            <div class="sync-divider"></div>
            
            <div class="sync-section">
                <div class="sync-title">${chrome.i18n.getMessage('importTitle') || '导入数据'}</div>
                <div class="sync-hint">${chrome.i18n.getMessage('importHint') || '从 JSON 文件导入数据，支持覆盖或合并两种模式。'}</div>
                
                <div class="import-options">
                    <label class="import-option">
                        <input type="radio" name="import-mode" value="merge" checked>
                        <span class="option-radio"></span>
                        <span class="option-content">
                            <span class="option-label">${chrome.i18n.getMessage('importModeMerge') || '合并'}</span>
                            <span class="option-desc">${chrome.i18n.getMessage('importModeMergeDesc') || '保留现有数据，与导入数据合并'}</span>
                        </span>
                    </label>
                    <label class="import-option">
                        <input type="radio" name="import-mode" value="overwrite">
                        <span class="option-radio"></span>
                        <span class="option-content">
                            <span class="option-label">${chrome.i18n.getMessage('importModeOverwrite') || '覆盖'}</span>
                            <span class="option-desc">${chrome.i18n.getMessage('importModeOverwriteDesc') || '清空现有数据，使用导入数据替换'}</span>
                        </span>
                    </label>
                </div>
                
                <button class="sync-btn import-btn" id="import-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14,2 14,8 20,8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <polyline points="9,15 12,12 15,15"/>
                    </svg>
                    ${chrome.i18n.getMessage('importBtn') || '选择文件导入'}
                </button>
                <input type="file" id="import-file-input" accept=".json" style="display: none;">
            </div>
            
            <div class="sync-status" id="sync-status" style="display: none;"></div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        const exportBtn = document.getElementById('export-btn');
        const importBtn = document.getElementById('import-btn');
        const fileInput = document.getElementById('import-file-input');
        
        // 导出按钮点击
        if (exportBtn) {
            this.addEventListener(exportBtn, 'click', () => this.handleExport());
        }
        
        // 导入按钮点击
        if (importBtn) {
            this.addEventListener(importBtn, 'click', () => fileInput?.click());
        }
        
        // 文件选择
        if (fileInput) {
            this.addEventListener(fileInput, 'change', (e) => this.handleImport(e));
        }
    }
    
    /**
     * 导出数据
     */
    async handleExport() {
        try {
            this.showStatus('loading', chrome.i18n.getMessage('exportingData') || '正在导出...');
            
            // 获取所有存储数据
            const data = await this.getAllStorageData();
            
            // 添加元数据
            const exportData = {
                _meta: {
                    version: '1.0',
                    exportTime: new Date().toISOString(),
                    source: 'AIChatTimeline'
                },
                data: data
            };
            
            // 创建并下载文件
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ai-timeline-backup-${this.formatDate(new Date())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 使用全局 toast 提示（颜色跟随主题）
            if (window.globalToastManager) {
                window.globalToastManager.success(
                    chrome.i18n.getMessage('exportSuccess') || '导出成功',
                    null,
                    { color: this.toastColors }
                );
            }
        } catch (error) {
            console.error('[DataSyncTab] Export failed:', error);
            // 使用全局 toast 提示（颜色跟随主题）
            if (window.globalToastManager) {
                window.globalToastManager.error(
                    chrome.i18n.getMessage('exportFailed') || '导出失败',
                    null,
                    { color: this.toastColors }
                );
            }
        }
    }
    
    /**
     * 导入数据
     */
    async handleImport(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        
        // 重置 input，允许重复选择同一文件
        e.target.value = '';
        
        try {
            this.showStatus('loading', chrome.i18n.getMessage('importingData') || '正在导入...');
            
            // 读取文件
            const text = await file.text();
            const importData = JSON.parse(text);
            
            // 验证数据格式
            if (!importData.data || typeof importData.data !== 'object') {
                throw new Error('Invalid data format');
            }
            
            // 获取导入模式
            const modeRadio = document.querySelector('input[name="import-mode"]:checked');
            const mode = modeRadio?.value || 'merge';
            
            if (mode === 'overwrite') {
                // 覆盖模式：直接替换
                await this.overwriteData(importData.data);
            } else {
                // 合并模式：智能合并
                await this.mergeData(importData.data);
            }
            
            // 使用 popConfirm 展示导入成功，提醒用户刷新
            if (window.globalPopconfirmManager) {
                const confirmed = await window.globalPopconfirmManager.show({
                    title: chrome.i18n.getMessage('importSuccess') || '导入成功',
                    content: chrome.i18n.getMessage('importSuccessHint') || '数据已成功导入，需要刷新页面后生效',
                    confirmText: chrome.i18n.getMessage('refreshPage') || '刷新页面',
                    cancelText: chrome.i18n.getMessage('refreshLater') || '稍后刷新',
                    confirmTextType: 'default'
                });
                
                if (confirmed) {
                    location.reload();
                }
            }
        } catch (error) {
            console.error('[DataSyncTab] Import failed:', error);
            this.showStatus('error', (chrome.i18n.getMessage('importFailed') || '导入失败') + ': ' + error.message);
        }
    }
    
    /**
     * 获取所有存储数据
     */
    async getAllStorageData() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                resolve(items);
            });
        });
    }
    
    /**
     * 覆盖模式：清空并写入新数据
     */
    async overwriteData(newData) {
        return new Promise((resolve, reject) => {
            // 先清空
            chrome.storage.local.clear(() => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                // 再写入
                chrome.storage.local.set(newData, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve();
                    }
                });
            });
        });
    }
    
    /**
     * 合并模式：智能合并数据
     * 
     * 合并规则：
     * - chatTimelineStars → 按 key 字段合并，导入覆盖
     * - chatTimelinePins → 按 key 字段合并，导入覆盖
     * - prompts（提示词）→ 按 id 字段合并，导入覆盖
     * - folders（文件夹）→ 按 id 字段合并，导入覆盖
     * - *PlatformSettings → 对象按 key 合并
     * - 其他类型 → 新值覆盖
     */
    async mergeData(newData) {
        const existingData = await this.getAllStorageData();
        const mergedData = { ...existingData };
        
        for (const [key, newValue] of Object.entries(newData)) {
            const existingValue = existingData[key];
            
            // 本地不存在，直接使用新值
            if (existingValue === undefined) {
                mergedData[key] = newValue;
                continue;
            }
            
            // 根据 key 类型选择合并策略
            mergedData[key] = this.mergeByKey(key, existingValue, newValue);
        }
        
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(mergedData, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }
    
    /**
     * 根据 key 类型选择合并策略
     */
    mergeByKey(key, existing, newValue) {
        // chatTimelineStars - 按 key 字段合并
        if (key === 'chatTimelineStars') {
            return this.mergeArrayByField(existing, newValue, 'key');
        }
        
        // chatTimelinePins - 按 key 字段合并
        if (key === 'chatTimelinePins') {
            return this.mergeArrayByField(existing, newValue, 'key');
        }
        
        // prompts（提示词）- 按 id 字段合并
        if (key === 'prompts') {
            return this.mergeArrayByField(existing, newValue, 'id');
        }
        
        // folders（文件夹）- 按 id 字段合并
        if (key === 'folders') {
            return this.mergeArrayByField(existing, newValue, 'id');
        }
        
        // *PlatformSettings - 对象按 key 合并
        if (key.endsWith('PlatformSettings')) {
            return { ...existing, ...newValue };
        }
        
        // 其他类型 - 新值覆盖
        return newValue;
    }
    
    /**
     * 按指定字段合并数组（导入数据覆盖现有数据）
     * @param {Array} existing - 现有数据
     * @param {Array} newArr - 导入数据
     * @param {string} field - 唯一标识字段名
     * @returns {Array} 合并后的数组
     */
    mergeArrayByField(existing, newArr, field) {
        if (!Array.isArray(existing) || !Array.isArray(newArr)) {
            return newArr;
        }
        
        const map = new Map();
        
        // 先添加现有数据
        for (const item of existing) {
            const key = item[field];
            if (key !== undefined) {
                map.set(key, item);
            }
        }
        
        // 导入数据覆盖（相同 key 的会被覆盖）
        for (const item of newArr) {
            const key = item[field];
            if (key !== undefined) {
                map.set(key, item);
            }
        }
        
        return Array.from(map.values());
    }
    
    /**
     * 格式化日期
     */
    formatDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}${m}${d}-${h}${min}`;
    }
    
    /**
     * 显示状态消息
     */
    showStatus(type, message) {
        const statusEl = document.getElementById('sync-status');
        if (!statusEl) return;
        
        statusEl.className = `sync-status ${type}`;
        statusEl.textContent = message;
        statusEl.style.display = 'block';
    }
    
    /**
     * 隐藏状态消息
     */
    hideStatus() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}
