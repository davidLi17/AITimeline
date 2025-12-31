/**
 * Common Utilities and Configuration
 * 
 * This file contains:
 * - TIMELINE_CONFIG: All timing and behavior constants
 * - TimelineUtils: Safe wrapper functions for common operations
 */

// ==================== Configuration ====================

const TIMELINE_CONFIG = {
    // Active state management
    MIN_ACTIVE_CHANGE_INTERVAL: 120, // ms - minimum interval between active state changes
    
    // UI interaction timings
    TOOLTIP_HIDE_DELAY: 100, // ms - delay before hiding tooltip
    DEBOUNCE_DELAY: 350, // ms - debounce delay for marker recalculation
    LONG_PRESS_DURATION: 550, // ms - duration to trigger long press
    LONG_PRESS_TOLERANCE: 6, // px - movement tolerance during long press
    CLICK_SUPPRESS_DURATION: 350, // ms - suppress clicks after long press
    
    // Resize and layout
    RESIZE_IDLE_DELAY: 140, // ms - settle time before min-gap correction
    RESIZE_IDLE_TIMEOUT: 200, // ms - timeout for requestIdleCallback
    
    // Route detection
    ROUTE_CHECK_INTERVAL: 800, // ms - polling interval for URL changes
    INIT_DELAY: 300, // ms - delay before initializing timeline (deprecated, use INIT_RETRY_DELAYS)
    INIT_RETRY_DELAYS: [500, 500, 1000, 1000, 1000, 1000], // ms - retry delays for initialization (exponential backoff)
    INITIAL_RENDER_DELAY: 100, // ms - delay before first render to ensure DOM stability
    
    // Observers
    OBSERVER_TIMEOUT: 5000, // ms - timeout for mutation observers
    ZERO_TURNS_TIMER: 350, // ms - wait before clearing UI when no turns found
    
    // Virtualization
    VIRTUAL_BUFFER_MIN: 100, // px - minimum buffer for virtualization
    
    // CSS detection
    CSS_VAR_DETECTION_TOLERANCE: 2, // px - tolerance for CSS var support detection
};

// ==================== Utility Functions ====================

const TimelineUtils = {
    /**
     * Safely clear a timeout
     */
    clearTimerSafe(timer) {
        try {
            if (timer) {
                clearTimeout(timer);
            }
        } catch {}
        return null;
    },

    /**
     * Safely clear an interval
     */
    clearIntervalSafe(intervalId) {
        try {
            if (intervalId) {
                clearInterval(intervalId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely cancel a requestAnimationFrame
     */
    clearRafSafe(rafId) {
        try {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely cancel a requestIdleCallback
     */
    clearIdleCallbackSafe(ricId) {
        try {
            if (ricId && typeof cancelIdleCallback === 'function') {
                cancelIdleCallback(ricId);
            }
        } catch {}
        return null;
    },

    /**
     * Safely disconnect an observer
     */
    disconnectObserverSafe(observer) {
        try {
            if (observer) {
                observer.disconnect();
            }
        } catch {}
    },

    /**
     * Safely remove a DOM element
     */
    removeElementSafe(element) {
        try {
            if (element) {
                element.remove();
            }
        } catch {}
    },

    /**
     * Safely remove an event listener
     */
    removeEventListenerSafe(target, event, handler, options) {
        try {
            if (target && handler) {
                target.removeEventListener(event, handler, options);
            }
        } catch {}
    },

    /**
     * Safely add a CSS class
     */
    addClassSafe(element, className) {
        try {
            if (element) {
                element.classList.add(className);
            }
        } catch {}
    },

    /**
     * Safely remove a CSS class
     */
    removeClassSafe(element, className) {
        try {
            if (element) {
                element.classList.remove(className);
            }
        } catch {}
    },

    /**
     * Safely toggle a CSS class
     */
    toggleClassSafe(element, className, force) {
        try {
            if (element) {
                element.classList.toggle(className, force);
            }
        } catch {}
    },

    /**
     * Safely set an attribute
     */
    setAttributeSafe(element, name, value) {
        try {
            if (element) {
                element.setAttribute(name, value);
            }
        } catch {}
    },
};

// ==================== Storage Adapter ====================

/**
 * Storage Adapter - 跨网站存储
 * 
 * 使用 chrome.storage.local（跨网站、本地存储，5MB 容量）
 * 降级到 localStorage（仅当前网站）
 * 
 * 注意：v4.1.0 之前使用 chrome.storage.sync，已迁移至 local
 */
const StorageAdapter = {
    /**
     * 检查是否支持 chrome.storage
     */
    isChromeStorageAvailable() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    },

    /**
     * 从 chrome.storage.sync 迁移数据到 chrome.storage.local
     * 迁移完成后清空 sync，下次检查时 sync 为空则跳过
     * @returns {Promise<void>}
     */
    async migrateFromSyncToLocal() {
        try {
            // 检查 chrome.storage 是否可用
            if (!this.isChromeStorageAvailable()) return;
            
            // 检查 sync 是否可用（用于读取旧数据）
            if (!chrome.storage.sync) return;
            
            // 从 sync 读取所有数据
            const syncData = await new Promise((resolve) => {
                chrome.storage.sync.get(null, (items) => {
                    resolve(items || {});
                });
            });
            
            // 如果 sync 中没有数据，跳过
            const syncKeys = Object.keys(syncData);
            if (syncKeys.length === 0) return;
            
            // 复制到 local
            await new Promise((resolve) => {
                chrome.storage.local.set(syncData, () => {
                    resolve();
                });
            });
            
            // 清空 sync（迁移完成标志）
            await new Promise((resolve) => {
                chrome.storage.sync.clear(() => {
                    resolve();
                });
            });
            
            console.log('[StorageAdapter] Migrated', syncKeys.length, 'keys from sync to local:', syncKeys);
        } catch (e) {
            console.error('[StorageAdapter] Migration failed:', e);
        }
    },

    /**
     * 获取存储的值
     * @param {string} key - 存储键名
     * @returns {Promise<any>} - 返回存储的值
     */
    async get(key) {
        try {
            if (this.isChromeStorageAvailable()) {
                // 使用 chrome.storage.local（跨网站、本地存储）
                return new Promise((resolve) => {
                    chrome.storage.local.get([key], (result) => {
                        resolve(result[key]);
                    });
                });
            } else {
                // 降级到 localStorage（仅当前网站）
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : undefined;
            }
        } catch (e) {
            return undefined;
        }
    },

    /**
     * 设置存储的值
     * @param {string} key - 存储键名
     * @param {any} value - 要存储的值
     * @returns {Promise<void>}
     */
    async set(key, value) {
        try {
            if (this.isChromeStorageAvailable()) {
                // 使用 chrome.storage.local（跨网站、本地存储）
                return new Promise((resolve) => {
                    chrome.storage.local.set({ [key]: value }, () => {
                        resolve();
                    });
                });
            } else {
                // 降级到 localStorage（仅当前网站）
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 删除存储的值
     * @param {string} key - 存储键名
     * @returns {Promise<void>}
     */
    async remove(key) {
        try {
            if (this.isChromeStorageAvailable()) {
                // 使用 chrome.storage.local（跨网站、本地存储）
                return new Promise((resolve) => {
                    chrome.storage.local.remove([key], () => {
                        resolve();
                    });
                });
            } else {
                // 降级到 localStorage（仅当前网站）
                localStorage.removeItem(key);
            }
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 获取所有匹配前缀的键值对
     * @param {string} prefix - 键名前缀
     * @returns {Promise<Object>} - 返回匹配的键值对对象
     */
    async getAllByPrefix(prefix) {
        try {
            if (this.isChromeStorageAvailable()) {
                // 使用 chrome.storage.local（跨网站、本地存储）
                return new Promise((resolve) => {
                    chrome.storage.local.get(null, (items) => {
                        const result = {};
                        Object.keys(items).forEach(key => {
                            if (key.startsWith(prefix)) {
                                result[key] = items[key];
                            }
                        });
                        resolve(result);
                    });
                });
            } else {
                // 降级到 localStorage（仅当前网站）
                const result = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(prefix)) {
                        try {
                            result[key] = JSON.parse(localStorage.getItem(key));
                        } catch {
                            result[key] = localStorage.getItem(key);
                        }
                    }
                }
                return result;
            }
        } catch (e) {
            return {};
        }
    },

    /**
     * 监听存储变化
     * @param {Function} callback - 回调函数 (changes, areaName) => {}
     */
    addChangeListener(callback) {
        try {
            if (this.isChromeStorageAvailable()) {
                chrome.storage.onChanged.addListener(callback);
            } else {
                // localStorage 的 storage 事件只能监听其他标签页的变化
                // 需要包装 callback 以适配 storage 事件格式
                const storageHandler = (e) => {
                    if (e.storageArea === localStorage) {
                        try {
                            callback({
                                [e.key]: {
                                    oldValue: e.oldValue ? JSON.parse(e.oldValue) : undefined,
                                    newValue: e.newValue ? JSON.parse(e.newValue) : undefined
                                }
                            }, 'local');
                        } catch (err) {
                            // Silently fail
                        }
                    }
                };
                // 保存原始 handler 的引用以便后续移除
                callback._storageHandler = storageHandler;
                window.addEventListener('storage', storageHandler);
            }
        } catch (e) {
            // Silently fail
        }
    },

    /**
     * 移除存储变化监听器
     * @param {Function} callback - 之前添加的回调函数
     */
    removeChangeListener(callback) {
        try {
            if (this.isChromeStorageAvailable()) {
                chrome.storage.onChanged.removeListener(callback);
            } else {
                // 移除 localStorage 的 storage 事件监听器
                if (callback._storageHandler) {
                    window.removeEventListener('storage', callback._storageHandler);
                    delete callback._storageHandler;
                }
            }
        } catch (e) {
            // Silently fail
        }
    }
};

// ==================== 收藏/标记数组存储 ====================

/**
 * StarPinStorage - 收藏和标记的数组存储管理器
 * 
 * 存储结构：
 * - aitStars: 收藏数组
 * - aitPins: 标记数组
 * 
 * 每个元素的唯一标识：urlWithoutProtocol + ':' + nodeId
 */
const StarPinStorage = {
    STARS_KEY: 'aitStars',
    PINS_KEY: 'aitPins',
    
    /**
     * 生成唯一标识
     */
    _makeId(urlWithoutProtocol, nodeId) {
        return `${urlWithoutProtocol}:${nodeId}`;
    },
    
    /**
     * 解析唯一标识
     */
    _parseId(id) {
        const lastColonIndex = id.lastIndexOf(':');
        if (lastColonIndex === -1) return null;
        const urlWithoutProtocol = id.substring(0, lastColonIndex);
        const nodeIdStr = id.substring(lastColonIndex + 1);
        // 尝试解析为数字
        const parsed = parseInt(nodeIdStr, 10);
        const nodeId = (String(parsed) === nodeIdStr) ? parsed : nodeIdStr;
        return { urlWithoutProtocol, nodeId };
    },

    // ==================== 收藏操作 ====================
    
    /**
     * 获取所有收藏
     */
    async getAllStars() {
        try {
            const data = await StorageAdapter.get(this.STARS_KEY);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    },
    
    /**
     * 保存所有收藏
     */
    async _saveAllStars(stars) {
        await StorageAdapter.set(this.STARS_KEY, stars);
    },
    
    /**
     * 添加或更新收藏
     */
    async addStar(item) {
        try {
            const stars = await this.getAllStars();
            const id = this._makeId(item.urlWithoutProtocol, item.nodeId ?? item.index);
            
            // 查找是否已存在
            const existingIndex = stars.findIndex(s => 
                this._makeId(s.urlWithoutProtocol, s.nodeId ?? s.index) === id
            );
            
            if (existingIndex >= 0) {
                // 更新现有项
                stars[existingIndex] = { ...stars[existingIndex], ...item };
            } else {
                // 添加新项
                stars.push(item);
            }
            
            await this._saveAllStars(stars);
            return true;
        } catch (e) {
            console.error('[StarPinStorage] Failed to add star:', e);
            return false;
        }
    },
    
    /**
     * 删除收藏
     */
    async removeStar(urlWithoutProtocol, nodeId) {
        try {
            const stars = await this.getAllStars();
            const id = this._makeId(urlWithoutProtocol, nodeId);
            
            const newStars = stars.filter(s => 
                this._makeId(s.urlWithoutProtocol, s.nodeId ?? s.index) !== id
            );
            
            await this._saveAllStars(newStars);
            return true;
        } catch (e) {
            console.error('[StarPinStorage] Failed to remove star:', e);
            return false;
        }
    },
    
    /**
     * 检查是否已收藏
     */
    async hasStar(urlWithoutProtocol, nodeId) {
        try {
            const stars = await this.getAllStars();
            const id = this._makeId(urlWithoutProtocol, nodeId);
            return stars.some(s => 
                this._makeId(s.urlWithoutProtocol, s.nodeId ?? s.index) === id
            );
        } catch (e) {
            return false;
        }
    },
    
    /**
     * 获取指定 URL 的所有收藏的 nodeId
     */
    async getStarNodeIds(urlWithoutProtocol) {
        try {
            const stars = await this.getAllStars();
            return stars
                .filter(s => s.urlWithoutProtocol === urlWithoutProtocol)
                .map(s => s.nodeId ?? s.index);
        } catch (e) {
            return [];
        }
    },

    // ==================== 标记操作 ====================
    
    /**
     * 获取所有标记
     */
    async getAllPins() {
        try {
            const data = await StorageAdapter.get(this.PINS_KEY);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    },
    
    /**
     * 保存所有标记
     */
    async _saveAllPins(pins) {
        await StorageAdapter.set(this.PINS_KEY, pins);
    },
    
    /**
     * 添加标记
     */
    async addPin(item) {
        try {
            const pins = await this.getAllPins();
            const id = this._makeId(item.urlWithoutProtocol, item.nodeId ?? item.index);
            
            // 查找是否已存在
            const existingIndex = pins.findIndex(p => 
                this._makeId(p.urlWithoutProtocol, p.nodeId ?? p.index) === id
            );
            
            if (existingIndex >= 0) {
                // 更新现有项
                pins[existingIndex] = { ...pins[existingIndex], ...item };
            } else {
                // 添加新项
                pins.push(item);
            }
            
            await this._saveAllPins(pins);
            return true;
        } catch (e) {
            console.error('[StarPinStorage] Failed to add pin:', e);
            return false;
        }
    },
    
    /**
     * 删除标记
     */
    async removePin(urlWithoutProtocol, nodeId) {
        try {
            const pins = await this.getAllPins();
            const id = this._makeId(urlWithoutProtocol, nodeId);
            
            const newPins = pins.filter(p => 
                this._makeId(p.urlWithoutProtocol, p.nodeId ?? p.index) !== id
            );
            
            await this._saveAllPins(newPins);
            return true;
        } catch (e) {
            console.error('[StarPinStorage] Failed to remove pin:', e);
            return false;
        }
    },
    
    /**
     * 检查是否已标记
     */
    async hasPin(urlWithoutProtocol, nodeId) {
        try {
            const pins = await this.getAllPins();
            const id = this._makeId(urlWithoutProtocol, nodeId);
            return pins.some(p => 
                this._makeId(p.urlWithoutProtocol, p.nodeId ?? p.index) === id
            );
        } catch (e) {
            return false;
        }
    },
    
    /**
     * 获取指定 URL 的所有标记的 nodeId
     */
    async getPinNodeIds(urlWithoutProtocol) {
        try {
            const pins = await this.getAllPins();
            return pins
                .filter(p => p.urlWithoutProtocol === urlWithoutProtocol)
                .map(p => p.nodeId ?? p.index);
        } catch (e) {
            return [];
        }
    },

    // ==================== 数据迁移 ====================
    
    /**
     * 从旧的单条存储格式迁移到数组格式
     * 迁移完成后删除旧数据
     */
    async migrateFromLegacy() {
        try {
            if (!StorageAdapter.isChromeStorageAvailable()) return;
            
            // 检查是否有旧格式的数据
            const allItems = await new Promise((resolve) => {
                chrome.storage.local.get(null, (items) => {
                    resolve(items || {});
                });
            });
            
            const starKeys = Object.keys(allItems).filter(k => k.startsWith('chatTimelineStar:'));
            const pinKeys = Object.keys(allItems).filter(k => k.startsWith('chatTimelinePin:'));
            
            // 如果没有旧数据，跳过
            if (starKeys.length === 0 && pinKeys.length === 0) return;
            
            // 迁移收藏
            if (starKeys.length > 0) {
                const existingStars = await this.getAllStars();
                const existingIds = new Set(existingStars.map(s => 
                    this._makeId(s.urlWithoutProtocol, s.nodeId ?? s.index)
                ));
                
                const newStars = [...existingStars];
                
                starKeys.forEach(key => {
                    const item = allItems[key];
                    if (!item || !item.urlWithoutProtocol) return;
                    
                    const nodeId = item.nodeId ?? item.index;
                    const id = this._makeId(item.urlWithoutProtocol, nodeId);
                    
                    // 避免重复
                    if (!existingIds.has(id)) {
                        newStars.push({
                            url: item.url,
                            urlWithoutProtocol: item.urlWithoutProtocol,
                            nodeId: nodeId,
                            question: item.question || '',
                            timestamp: item.timestamp || Date.now(),
                            folderId: item.folderId || null,
                            isFullChat: nodeId === -1
                        });
                        existingIds.add(id);
                    }
                });
                
                await this._saveAllStars(newStars);
            }
            
            // 迁移标记
            if (pinKeys.length > 0) {
                const existingPins = await this.getAllPins();
                const existingIds = new Set(existingPins.map(p => 
                    this._makeId(p.urlWithoutProtocol, p.nodeId ?? p.index)
                ));
                
                const newPins = [...existingPins];
                
                pinKeys.forEach(key => {
                    const item = allItems[key];
                    if (!item || !item.urlWithoutProtocol) return;
                    
                    const nodeId = item.nodeId ?? item.index;
                    const id = this._makeId(item.urlWithoutProtocol, nodeId);
                    
                    // 避免重复
                    if (!existingIds.has(id)) {
                        newPins.push({
                            url: item.url,
                            urlWithoutProtocol: item.urlWithoutProtocol,
                            nodeId: nodeId,
                            question: item.question || '',
                            timestamp: item.timestamp || Date.now(),
                            isFullChat: false
                        });
                        existingIds.add(id);
                    }
                });
                
                await this._saveAllPins(newPins);
            }
            
            // 删除旧数据
            const keysToRemove = [...starKeys, ...pinKeys];
            await new Promise((resolve) => {
                chrome.storage.local.remove(keysToRemove, () => {
                    resolve();
                });
            });
            
            console.log('[StarPinStorage] Migrated', starKeys.length, 'stars and', pinKeys.length, 'pins to array format');
        } catch (e) {
            console.error('[StarPinStorage] Migration failed:', e);
        }
    }
};

// ==================== 执行迁移 ====================
// 在脚本加载时立即执行迁移检查（异步，不阻塞）
(async () => {
    await StorageAdapter.migrateFromSyncToLocal();
    await StarPinStorage.migrateFromLegacy();
})();

