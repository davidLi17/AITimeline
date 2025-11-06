/**
 * Grok Adapter
 * 
 * Supports: 
 *   - grok.com/c/xxx (普通对话)
 *   - grok.com/share/xxx (分享页面)
 * Features: Uses element id attribute, KaTeX formula support
 */

class GrokAdapter extends SiteAdapter {
    constructor() {
        super();
    }

    matches(url) {
        return url.includes('grok.com');
    }

    getUserMessageSelector() {
        // 用户消息：有 items-end class 且有 id 属性的元素
        return '.items-end[id]';
    }

    generateTurnId(element, index) {
        // 使用 index 作为唯一标识，与其他 AI 平台保持一致
        return `grok-${index}`;
    }

    extractText(element) {
        // 从 p.break-words 元素中提取文本内容
        const textElement = element.querySelector('p.break-words');
        return textElement?.textContent?.trim() || '';
    }

    isConversationRoute(pathname) {
        // Grok 对话 URL: /c/xxx 或分享页面 /share/xxx
        return pathname.includes('/c/') || pathname.includes('/share/');
    }

    extractConversationId(pathname) {
        try {
            // 提取对话 ID: /c/xxx 或 /share/xxx
            const match = pathname.match(/\/(c|share)\/([^\/]+)/);
            if (match) return match[2];
            
            return null;
        } catch {
            return null;
        }
    }

    findConversationContainer(firstMessage) {
        /**
         * 查找对话容器
         * 
         * 使用 LCA（最近共同祖先）算法查找所有对话记录的最近父容器。
         * 传递 messageSelector 参数，让 ContainerFinder 能够：
         * 1. 查询所有用户消息元素
         * 2. 找到它们的最近共同祖先
         * 3. 确保容器是直接包裹所有对话的最小容器
         * 
         * 优势：比传统的向上遍历更精确，避免找到过于外层的容器
         */
        return ContainerFinder.findConversationContainer(firstMessage, {
            messageSelector: this.getUserMessageSelector()
        });
    }

    getTimelinePosition() {
        // Grok 时间轴位置配置
        return {
            top: '120px',      // 避开顶部导航栏
            right: '22px',     // 右侧边距
            bottom: '120px',   // 避开底部输入框
        };
    }
    
    getStarChatButtonTarget() {
        // Grok 暂不支持收藏整个对话功能
        // 可以根据实际 UI 结构添加
        return null;
    }
    
    getDefaultChatTheme() {
        // Grok 使用页面标题作为默认主题
        return document.title || '';
    }
    
    /**
     * 初始化公式交互功能
     * Grok 使用 KaTeX 格式（与 DeepSeek、ChatGPT 相同）
     * @returns {FormulaManager|null} - 返回 FormulaManager 实例，如果不支持则返回 null
     */
    initFormulaInteraction() {
        // 检查是否存在 FormulaManager 类
        if (typeof FormulaManager === 'undefined') {
            console.warn('FormulaManager is not loaded');
            return null;
        }
        
        // 创建并初始化 FormulaManager
        const formulaManager = new FormulaManager();
        formulaManager.init();
        
        return formulaManager;
    }
    
    /**
     * 检测 Grok 的深色模式
     * Grok 通过 html 元素的 class 控制主题 (dark/light)
     * @returns {boolean}
     */
    detectDarkMode() {
        // 检查 html 的 class 中是否有 dark
        return document.documentElement.classList.contains('dark') || 
               document.body.classList.contains('dark');
    }
}
