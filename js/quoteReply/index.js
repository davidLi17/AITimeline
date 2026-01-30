/**
 * Quote Reply - 主入口
 * 
 * 引用回复功能初始化
 * 选中文字后显示"引用回复"按钮，点击后将选中文字以引用格式插入输入框
 * 
 * 支持平台：
 * - 所有 features.quoteReply === true 的平台
 * 
 * 限制条件：
 * - 仅在对话页面生效，首页等非对话页面不显示
 */

(function() {
    'use strict';
    
    // 配置
    const ROUTE_CHECK_INTERVAL = 500; // URL 轮询检测间隔（ms）
    
    let manager = null;
    let isSupported = false;
    let adapterRegistry = null;
    let currentAdapter = null;
    let currentUrl = location.href;
    let routeCheckIntervalId = null;
    let unsubscribeDomObserver = null;
    
    // 检查当前平台是否支持引用回复功能
    function isQuoteReplySupported() {
        try {
            if (typeof getCurrentPlatform === 'undefined') return false;
            const platform = getCurrentPlatform();
            if (!platform) return false;
            
            return platform.features?.quoteReply === true;
        } catch (e) {
            return false;
        }
    }
    
    // 检查是否在对话页面
    function isConversationPage() {
        try {
            if (!adapterRegistry) {
                if (typeof SiteAdapterRegistry === 'undefined') return false;
                adapterRegistry = new SiteAdapterRegistry();
            }
            
            if (!currentAdapter) {
                currentAdapter = adapterRegistry.detectAdapter();
            }
            
            if (!currentAdapter) return false;
            
            return currentAdapter.isConversationRoute(location.pathname);
        } catch (e) {
            return false;
        }
    }
    
    // 检查功能是否启用（默认开启）
    async function isQuoteReplyEnabled() {
        try {
            const result = await chrome.storage.local.get('quoteReplyEnabled');
            return result.quoteReplyEnabled !== false;
        } catch (e) {
            return true;
        }
    }
    
    // 根据页面状态启用/禁用功能
    async function updateQuoteReplyState() {
        if (!manager || !isSupported) return;
        
        const enabled = await isQuoteReplyEnabled();
        const onConversationPage = isConversationPage();
        
        if (enabled && onConversationPage) {
            if (!manager.isEnabled) {
                manager.enable();
            }
        } else {
            if (manager.isEnabled) {
                manager.disable();
            }
        }
    }
    
    // 处理 URL 变化
    function handleUrlChange() {
        // 检测 URL 是否真的变化了
        if (location.href === currentUrl) return;
        currentUrl = location.href;
        updateQuoteReplyState();
    }
    
    // 监听 URL 变化（SPA 路由切换）
    function setupUrlChangeListener() {
        // 监听 popstate（浏览器前进/后退）
        window.addEventListener('popstate', handleUrlChange);
        
        // 监听 hashchange
        window.addEventListener('hashchange', handleUrlChange);
        
        // 使用 DOMObserverManager 监听 body DOM 变化（与时间轴保持一致）
        // DOM 变化通常伴随着路由变化，这比轮询更及时
        if (window.DOMObserverManager && !unsubscribeDomObserver) {
            unsubscribeDomObserver = window.DOMObserverManager.getInstance().subscribeBody('quote-reply-page', {
                callback: handleUrlChange,
                filter: { hasAddedNodes: true, hasRemovedNodes: true },
                debounce: 200
            });
        }
        
        // 轮询检测 URL 变化（后备方案）
        routeCheckIntervalId = setInterval(() => {
            if (location.href !== currentUrl) {
                handleUrlChange();
            }
        }, ROUTE_CHECK_INTERVAL);
    }
    
    // 初始化
    const initQuoteReply = async () => {
        try {
            // 检查平台是否支持
            isSupported = isQuoteReplySupported();
            if (!isSupported) {
                return;
            }
            
            // 检查依赖
            if (typeof QuoteReplyManager === 'undefined') {
                console.error('[QuoteReply] QuoteReplyManager not loaded');
                return;
            }
            
            // 创建管理器（但不立即启用）
            manager = new QuoteReplyManager();
            
            // 设置 URL 变化监听
            setupUrlChangeListener();
            
            // 根据当前页面状态决定是否启用
            await updateQuoteReplyState();
            
            // 保存到全局
            window.quoteReplyManager = manager;
            
            // 监听设置变化
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && changes.quoteReplyEnabled !== undefined) {
                    updateQuoteReplyState();
                }
            });
            
            // 暴露控制接口
            window.AIChatTimelineQuoteReply = {
                enable: () => {
                    if (manager && isSupported && isConversationPage()) {
                        manager.enable();
                    }
                },
                disable: () => {
                    if (manager) {
                        manager.disable();
                    }
                },
                isEnabled: () => manager?.isEnabled ?? false,
                updateState: updateQuoteReplyState
            };
            
        } catch (error) {
            console.error('[QuoteReply] Initialization failed:', error);
        }
    };
    
    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuoteReply);
    } else {
        initQuoteReply();
    }
    
})();
