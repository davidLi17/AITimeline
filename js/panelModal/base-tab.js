/**
 * Base Tab Class
 * 所有 tab 需要继承此类
 */

class BaseTab {
    constructor() {
        /**
         * Tab 唯一标识
         * @type {string}
         */
        this.id = '';
        
        /**
         * Tab 显示名称（用于 tooltip）
         * @type {string}
         */
        this.name = '';
        
        /**
         * Tab 图标（emoji 或 SVG）
         * @type {string}
         */
        this.icon = '';
    }
    
    /**
     * 渲染 tab 内容
     * 子类必须实现此方法
     * @returns {HTMLElement} 返回要显示的 DOM 元素
     */
    render() {
        throw new Error('Tab must implement render() method');
    }
    
    /**
     * Tab 被激活时调用
     * 子类可选实现
     */
    mounted() {
        // 子类可以覆盖此方法
    }
    
    /**
     * Tab 被切换走时调用
     * 子类可选实现
     */
    unmounted() {
        // 子类可以覆盖此方法
    }
}

