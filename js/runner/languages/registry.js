/**
 * LanguageRegistry - 语言运行器注册表
 * 
 * 管理所有支持的编程语言及其运行器
 */

class LanguageRegistry {
    constructor() {
        this.runners = new Map();
        this.languageConfigs = [
            {
                id: 'javascript',
                name: 'JavaScript',
                enabled: true,
                icon: '🟨',
                runnerClass: 'JavaScriptRunner'
            }
            // 未来可在此添加更多语言支持
        ];
        this.initialize();
    }

    /**
     * 初始化注册所有语言
     */
    initialize() {
        // 注册 JavaScript
        if (window.JavaScriptRunner) {
            this.register('javascript', new window.JavaScriptRunner());
        }
        
        // Python 暂时禁用
        // 原因：Manifest V3 扩展页面不允许加载外部 CDN 脚本（如 Pyodide）
        // 未来方案：使用 Offscreen Document API 或打包 Pyodide
    }

    /**
     * 注册一个语言运行器
     * @param {string} language - 语言标识符
     * @param {Object} runner - 运行器实例
     */
    register(language, runner) {
        this.runners.set(language, runner);
    }

    /**
     * 获取指定语言的运行器
     * @param {string} language - 语言标识符
     * @returns {Object|null}
     */
    getRunner(language) {
        return this.runners.get(language) || null;
    }

    /**
     * 检查语言是否被支持
     * @param {string} language - 语言标识符
     * @returns {boolean}
     */
    isSupported(language) {
        return this.runners.has(language);
    }

    /**
     * 获取所有支持的语言列表
     * @returns {Array}
     */
    getSupportedLanguages() {
        const languages = [];
        this.runners.forEach((runner, language) => {
            languages.push({
                id: language,
                name: runner.displayName || language,
                enabled: true,
                icon: runner.icon || ''
            });
        });
        return languages;
    }

    /**
     * 获取所有语言（包括未来支持的）
     * @returns {Array}
     */
    getAllLanguages() {
        return this.languageConfigs;
    }

    /**
     * 获取语言配置
     * @param {string} language - 语言标识符
     * @returns {Object|null}
     */
    getLanguageConfig(language) {
        return this.languageConfigs.find(c => c.id === language) || null;
    }

    /**
     * 清理所有运行器
     */
    cleanup() {
        this.runners.forEach(runner => {
            if (runner.cleanup) {
                runner.cleanup();
            }
        });
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.LanguageRegistry = LanguageRegistry;
}
