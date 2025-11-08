/**
 * Formula Manager - 公式交互管理器
 * 
 * 负责处理 AI 回复中的数学公式（KaTeX）交互
 * 功能：
 * - Hover 高亮效果
 * - Tooltip 提示（显示"复制公式"）
 * - 点击复制 LaTeX 源码（纯文本，不包装 Markdown）
 * - 复制成功反馈
 * - 动态监听新增公式
 */

class FormulaManager {
    constructor() {
        this.tooltip = null;
        this.copyFeedback = null;
        this.currentHoverElement = null;
        this.tooltipTimer = null;
        this.feedbackTimer = null;
        this.mutationObserver = null;
        this.periodicCheckInterval = null;
        this.debounceTimer = null;
        this.isEnabled = false;
        
        // ✅ 监听状态变量（避免闭包问题）
        this._mutationCount = 0;
        this._lastScanTime = 0;
        
        // 绑定事件处理器
        this.handleMouseEnter = this.handleMouseEnter.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }

    /**
     * 初始化公式管理器
     */
    init() {
        if (this.isEnabled) return;
        this.isEnabled = true;

        // 创建 tooltip 元素
        this.createTooltip();
        
        // 创建复制成功反馈元素
        this.createCopyFeedback();
        
        // 处理现有公式
        this.scanAndAttachFormulas();
        
        // 监听新增公式
        this.observeNewFormulas();
    }

    /**
     * 创建 tooltip 元素
     */
    createTooltip() {
        if (this.tooltip) return;
        
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'timeline-tooltip-base formula-tooltip';
        this.tooltip.setAttribute('data-placement', 'top');
        this.tooltip.textContent = chrome.i18n.getMessage('copyLatexFormula');
        
        // 设置颜色（根据当前主题模式）
        const isDarkMode = document.documentElement.classList.contains('dark');
        const backgroundColor = isDarkMode ? '#ffffff' : '#0d0d0d';
        const textColor = isDarkMode ? '#1f2937' : '#ffffff';
        const borderColor = isDarkMode ? '#e5e7eb' : '#0d0d0d';
        
        this.tooltip.style.backgroundColor = backgroundColor;
        this.tooltip.style.color = textColor;
        this.tooltip.style.borderColor = borderColor;
        // 设置CSS变量（用于箭头）
        this.tooltip.style.setProperty('--timeline-tooltip-bg', backgroundColor);
        this.tooltip.style.setProperty('--timeline-tooltip-text', textColor);
        this.tooltip.style.setProperty('--timeline-tooltip-border', borderColor);
        
        document.body.appendChild(this.tooltip);
    }

    /**
     * 创建复制成功反馈元素
     */
    createCopyFeedback() {
        if (this.copyFeedback) return;
        
        this.copyFeedback = document.createElement('div');
        this.copyFeedback.className = 'timeline-copy-feedback';
        this.copyFeedback.textContent = '✓ 已复制';
        document.body.appendChild(this.copyFeedback);
    }

    /**
     * 为公式元素添加事件监听
     */
    attachFormulaListeners(formulaElement) {
        // 避免重复添加
        if (formulaElement.hasAttribute('data-latex-source')) return;
        
        // 检查元素是否在 DOM 中且可见
        if (!formulaElement.isConnected) return;
        
        // 前置提取逻辑：使用独立的 LatexExtractor
        let latexCode = LatexExtractor.extract(formulaElement);
        if (!latexCode) {
            // 无法提取公式，不添加交互功能
            return;
        }
        
        // 特殊处理：如果是维基百科的 mwe-math-element，清理格式
        if (formulaElement.classList.contains('mwe-math-element') || formulaElement.closest('.mwe-math-element')) {
            // 如果开头是 {\displaystyle，则删除它，同时删除结尾的 }
            if (latexCode.startsWith('{\\displaystyle')) {
                latexCode = latexCode.replace(/^\{\\displaystyle\s*/, '').replace(/\}\s*$/, '').trim();
            }
        }
        
        // 存储 LaTeX 源码到元素属性（同时作为已处理标记）
        formulaElement.setAttribute('data-latex-source', latexCode);
        
        formulaElement.addEventListener('mouseenter', this.handleMouseEnter);
        formulaElement.addEventListener('mouseleave', this.handleMouseLeave);
        formulaElement.addEventListener('click', this.handleClick);
        
        // 添加样式类（用于 CSS 控制）
        formulaElement.classList.add('formula-interactive');
    }

    /**
     * 鼠标进入公式区域
     */
    handleMouseEnter(e) {
        const formulaElement = e.currentTarget;
        this.currentHoverElement = formulaElement;
        
        // 添加 hover 样式
        formulaElement.classList.add('formula-hover');
        
        // 显示 tooltip - 使用全局管理器
        if (typeof window.globalTooltipManager !== 'undefined') {
            // 使用全局管理器
            const formulaId = formulaElement.getAttribute('data-formula-id') || 
                             'formula-' + Date.now();
            
            window.globalTooltipManager.show(
                formulaId,
                'formula',
                formulaElement,
                chrome.i18n.getMessage('copyLatexFormula'),
                { placement: 'top' }
            );
        } else {
            // 降级：使用旧逻辑
            this.showTooltip(formulaElement);
        }
    }

    /**
     * 鼠标离开公式区域
     */
    handleMouseLeave(e) {
        const formulaElement = e.currentTarget;
        
        // 移除 hover 样式
        formulaElement.classList.remove('formula-hover');
        
        // 隐藏 tooltip
        if (typeof window.globalTooltipManager !== 'undefined') {
            window.globalTooltipManager.hide();
        } else {
            this.hideTooltip();
        }
        
        if (this.currentHoverElement === formulaElement) {
            this.currentHoverElement = null;
        }
    }

    /**
     * 点击公式复制（复制纯 LaTeX 源码，不包装 Markdown）
     */
    async handleClick(e) {
        const formulaElement = e.currentTarget;
        
        // 直接从属性读取 LaTeX 源码（已在 attachFormulaListeners 中提取并存储）
        const latexCode = formulaElement.getAttribute('data-latex-source');
        
        if (!latexCode) {
            // 防御性检查（理论上不应该发生）
            console.warn('Formula element missing data-latex-source attribute', formulaElement);
            this.showCopyFeedback('⚠ 无法获取公式', formulaElement, true);
            return;
        }

        // 检查 Clipboard API 是否可用
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            console.error('Clipboard API 不可用');
            this.showCopyFeedback('⚠ 浏览器不支持', formulaElement, true);
            return;
        }

        try {
            // 直接复制纯 LaTeX 源码，不包装任何格式
            await navigator.clipboard.writeText(latexCode);
            
            // 显示成功反馈
            this.showCopyFeedback(chrome.i18n.getMessage('latexFormulaCopied'), formulaElement, false);
            
            // 隐藏 tooltip
            this.hideTooltip();
        } catch (err) {
            console.error('复制公式失败:', err);
            this.showCopyFeedback('⚠ 复制失败', formulaElement, true);
        }
    }


    /**
     * 显示 tooltip
     */
    showTooltip(formulaElement) {
        if (!this.tooltip) return;

        // 检查元素是否还在 DOM 中
        if (!formulaElement.isConnected) return;

        // 清除之前的隐藏定时器
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        // ✅ 先临时显示 tooltip（opacity 0），以便获取准确尺寸
        this.tooltip.style.visibility = 'hidden';
        this.tooltip.style.opacity = '0';
        this.tooltip.classList.add('visible');

        // 计算位置
        const rect = formulaElement.getBoundingClientRect();
        
        // 检查是否获取到有效的位置
        if (rect.width === 0 && rect.height === 0) {
            this.tooltip.classList.remove('visible');
            return;
        }
        
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        // 默认显示在上方
        let top = rect.top - tooltipRect.height - 12;
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        
        // 边界检查：如果上方空间不足，显示在下方
        if (top < 10) {
            top = rect.bottom + 12;
            this.tooltip.setAttribute('data-placement', 'bottom');
        } else {
            this.tooltip.setAttribute('data-placement', 'top');
        }
        
        // 左右边界检查
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        // 设置位置
        this.tooltip.style.left = `${left}px`;
        this.tooltip.style.top = `${top}px`;
        
        // ✅ 恢复可见性并显示
        this.tooltip.style.visibility = '';
        this.tooltip.style.opacity = '';
    }

    /**
     * 隐藏 tooltip
     */
    hideTooltip() {
        if (!this.tooltip) return;

        // 延迟隐藏，避免闪烁
        this.tooltipTimer = setTimeout(() => {
            this.tooltip.classList.remove('visible');
        }, 100);
    }

    /**
     * 显示复制反馈（使用全局 Toast 管理器）
     */
    showCopyFeedback(message, formulaElement, isError = false) {
        // 检查元素是否还在 DOM 中
        if (!formulaElement.isConnected) return;

        if (typeof window.globalToastManager !== 'undefined') {
            // 使用全局 Toast 管理器
            if (isError) {
                window.globalToastManager.error(message, formulaElement, {
                    duration: 2000
                });
            } else {
                window.globalToastManager.success(message, formulaElement, {
                    duration: 2000
                    // ✅ 使用默认的 ✓ 图标
                });
            }
        } else {
            // 降级：旧逻辑
            if (!this.copyFeedback) return;
            
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
            
            this.copyFeedback.textContent = message;
            
            if (isError) {
                this.copyFeedback.style.backgroundColor = '#ef4444';
            } else {
                this.copyFeedback.style.backgroundColor = 'var(--timeline-tooltip-bg)';
            }
            
            const rect = formulaElement.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            
            const feedbackRect = this.copyFeedback.getBoundingClientRect();
            const top = rect.top - feedbackRect.height - 8;
            const left = rect.left + rect.width / 2 - feedbackRect.width / 2;
            
            if (top < 10) {
                this.copyFeedback.style.top = `${rect.bottom + 8}px`;
            } else {
                this.copyFeedback.style.top = `${top}px`;
            }
            
            if (left < 10) {
                this.copyFeedback.style.left = '10px';
            } else if (left + feedbackRect.width > window.innerWidth - 10) {
                this.copyFeedback.style.left = `${window.innerWidth - feedbackRect.width - 10}px`;
            } else {
                this.copyFeedback.style.left = `${left}px`;
            }
            
            this.copyFeedback.classList.add('visible');
            
            this.feedbackTimer = setTimeout(() => {
                this.copyFeedback.classList.remove('visible');
            }, 2000);
        }
    }

    /**
     * 监听新增的公式元素 - 智能防抖方案
     */
    observeNewFormulas() {
        if (this.mutationObserver) return;

        // ✅ 使用实例变量避免闭包混乱
        this._mutationCount = 0;
        this._lastScanTime = Date.now();

        this.mutationObserver = new MutationObserver((mutations) => {
            // ✅ 快速过滤：如果没有添加节点，直接跳过
            const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
            if (!hasAddedNodes) return;
            
            // 累计变化次数
            this._mutationCount += mutations.length;
            
            // 清除旧的防抖定时器
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }
            
            // 智能延迟：根据变化频率调整
            let delay;
            if (this._mutationCount < 20) {
                delay = 400;
            } else if (this._mutationCount < 50) {
                delay = 600;
            } else {
                delay = 1000;
            }
            
            this.debounceTimer = setTimeout(() => {
                // ✅ 检查是否已被销毁
                if (!this.isEnabled) return;
                
                this.scanAndAttachFormulas();
                this._mutationCount = 0;
                this._lastScanTime = Date.now();
                this.debounceTimer = null;
            }, delay);
        });

        // 监听整个文档的变化
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 轻量级兜底机制
        this.periodicCheckInterval = setInterval(() => {
            // ✅ 检查是否已被销毁
            if (!this.isEnabled) return;
            
            const timeSinceLastScan = Date.now() - this._lastScanTime;
            
            if (timeSinceLastScan > 5000) {
                this.scanAndAttachFormulas();
                this._lastScanTime = Date.now();
            }
        }, 5000);
    }

    /**
     * 扫描并附加所有未处理的公式
     */
    scanAndAttachFormulas() {
        if (!this.isEnabled) return;
        
        // 扫描 KaTeX 公式（ChatGPT, Gemini, DeepSeek, Grok）
        const katexFormulas = document.querySelectorAll('.katex:not([data-latex-source])');
        katexFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描豆包的 .math-inline 公式
        const doubaoFormulas = document.querySelectorAll('.math-inline:not([data-latex-source])');
        doubaoFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描维基百科的 .mwe-math-element 公式
        const wikiFormulas = document.querySelectorAll('.mwe-math-element:not([data-latex-source])');
        wikiFormulas.forEach(formula => this.attachFormulaListeners(formula));
        
        // 扫描 MathJax 公式 - 查找 script[type="math/tex"] 的兄弟元素
        const mathJaxScripts = document.querySelectorAll('script[type^="math/tex"]');
        mathJaxScripts.forEach(script => {
            if (!script.parentElement) return;
            
            // 查找兄弟元素中的 .MathJax_SVG 或 .MathJax
            const mathJaxElement = script.parentElement.querySelector('.MathJax_SVG:not([data-latex-source]), .MathJax:not([data-latex-source])');
            if (mathJaxElement) {
                this.attachFormulaListeners(mathJaxElement);
            }
        });
    }

    /**
     * 销毁公式管理器
     */
    destroy() {
        // ✅ 先设置为 false，阻止所有异步回调继续执行
        this.isEnabled = false;

        // 断开 MutationObserver
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        // 清除定期检查定时器
        if (this.periodicCheckInterval) {
            clearInterval(this.periodicCheckInterval);
            this.periodicCheckInterval = null;
        }

        // 清除防抖定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        // 清除所有其他定时器
        if (this.tooltipTimer) {
            clearTimeout(this.tooltipTimer);
            this.tooltipTimer = null;
        }

        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
            this.feedbackTimer = null;
        }

        // 移除所有公式的事件监听
        const formulas = document.querySelectorAll('.katex[data-latex-source], .math-inline[data-latex-source], .mwe-math-element[data-latex-source], .MathJax_SVG[data-latex-source], .MathJax[data-latex-source]');
        formulas.forEach(formula => {
            formula.removeEventListener('mouseenter', this.handleMouseEnter);
            formula.removeEventListener('mouseleave', this.handleMouseLeave);
            formula.removeEventListener('click', this.handleClick);
            formula.removeAttribute('data-latex-source');
            formula.classList.remove('formula-interactive', 'formula-hover');
        });

        // 移除 UI 元素
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        if (this.copyFeedback) {
            this.copyFeedback.remove();
            this.copyFeedback = null;
        }

        // 重置状态变量
        this.currentHoverElement = null;
        this._mutationCount = 0;
        this._lastScanTime = 0;
    }
}

