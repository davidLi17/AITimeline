/**
 * Tab Registry
 * 
 * 这个文件提供了便捷函数，用于注册需要特定依赖的 tabs
 * 
 * ✨ 设计理念：
 * - PanelModal 独立初始化（脚本加载时）
 * - 独立的 tabs 可以在 PanelModal 初始化时注册
 * - 依赖其他模块的 tabs 延迟注册（由依赖模块调用）
 */

/**
 * 注册依赖 TimelineManager 的 tabs
 * 由 TimelineManager 初始化时调用
 * 
 * @param {TimelineManager} timelineManager - Timeline 管理器实例
 */
function registerTimelineTabs(timelineManager) {
    if (!window.panelModal) {
        console.error('[TabRegistry] PanelModal not initialized');
        return;
    }
    
    if (!timelineManager) {
        console.error('[TabRegistry] TimelineManager is required');
        return;
    }
    
    try {
        // 注册 Starred Tab（收藏列表）
        const starredTab = new StarredTab(timelineManager);
        window.panelModal.registerTab(starredTab);
        
        console.log('[TabRegistry] Timeline tabs registered');
    } catch (error) {
        console.error('[TabRegistry] Failed to register timeline tabs:', error);
    }
}

// ✅ 未来可以添加其他注册函数
// 例如：registerSettingsTabs()、registerHistoryTabs() 等

/**
 * @deprecated 使用 registerTimelineTabs 代替
 * 保留此函数以保持向后兼容
 */
function initializePanelModalTabs(timelineManager) {
    console.warn('[TabRegistry] initializePanelModalTabs is deprecated, use registerTimelineTabs instead');
    registerTimelineTabs(timelineManager);
}
