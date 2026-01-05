/**
 * Runner Tab - 代码运行器 UI 组件
 */

class RunnerTab extends BaseTab {
    constructor() {
        super('runner');
        this.runnerManager = null;
        this.currentLanguage = 'javascript';
        this.isRunning = false;
        this.outputLines = [];
    }

    async initialize() {
        await super.initialize();
        this.runnerManager = window.Runner.getManager();
        this.render();
        this.attachEventListeners();
    }

    render() {
        const languages = this.runnerManager.getAllLanguages();
        
        this.container.innerHTML = `
            <div class="runner-container">
                <!-- 头部：语言切换和操作按钮 -->
                <div class="runner-header">
                    <div class="runner-language-tabs">
                        ${languages.map(lang => `
                            <button 
                                class="runner-tab ${lang.id === this.currentLanguage ? 'active' : ''} ${!lang.enabled ? 'disabled' : ''}"
                                data-language="${lang.id}"
                                ${!lang.enabled ? 'disabled' : ''}
                                title="${lang.comingSoon ? '即将推出' : lang.name}">
                                <span class="runner-tab-icon">${lang.icon || ''}</span>
                                <span class="runner-tab-name">${lang.name}</span>
                                ${lang.comingSoon ? '<span class="runner-tab-badge">Soon</span>' : ''}
                            </button>
                        `).join('')}
                    </div>
                    <div class="runner-actions">
                        <button class="runner-btn runner-btn-primary" data-action="run">
                            <span class="runner-btn-icon">▶</span>
                            <span class="runner-btn-text">${chrome.i18n.getMessage('runnerExecute') || '运行'}</span>
                        </button>
                        <button class="runner-btn runner-btn-secondary" data-action="clear">
                            <span class="runner-btn-icon">🗑</span>
                            <span class="runner-btn-text">${chrome.i18n.getMessage('runnerClear') || '清空'}</span>
                        </button>
                    </div>
                </div>

                <!-- 代码编辑区 -->
                <div class="runner-editor-wrapper">
                    <div class="runner-editor-header">
                        <span class="runner-editor-label">${chrome.i18n.getMessage('runnerCodeEditor') || '代码编辑器'}</span>
                        <span class="runner-editor-hint">${chrome.i18n.getMessage('runnerHint') || '在这里输入代码，支持 async/await'}</span>
                    </div>
                    <textarea 
                        class="runner-editor" 
                        placeholder="${this.getPlaceholder()}"
                        spellcheck="false"></textarea>
                </div>

                <!-- 输出区域 -->
                <div class="runner-output-wrapper">
                    <div class="runner-output-header">
                        <span class="runner-output-label">
                            <span class="runner-output-icon">📤</span>
                            ${chrome.i18n.getMessage('runnerOutput') || '输出'}
                        </span>
                        <span class="runner-status"></span>
                    </div>
                    <div class="runner-output"></div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // 语言切换
        this.container.querySelectorAll('.runner-tab:not(.disabled)').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const language = e.currentTarget.dataset.language;
                this.switchLanguage(language);
            });
        });

        // 运行按钮
        const runBtn = this.container.querySelector('[data-action="run"]');
        runBtn.addEventListener('click', () => this.runCode());

        // 清空按钮
        const clearBtn = this.container.querySelector('[data-action="clear"]');
        clearBtn.addEventListener('click', () => this.clearAll());

        // 代码编辑器快捷键
        const editor = this.container.querySelector('.runner-editor');
        editor.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter 运行代码
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.runCode();
            }
            
            // Tab 键插入空格
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                const value = editor.value;
                editor.value = value.substring(0, start) + '  ' + value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 2;
            }
        });
    }

    switchLanguage(language) {
        if (this.isRunning) {
            this.showToast('代码正在运行中，请稍候...', 'warning');
            return;
        }

        this.currentLanguage = language;
        this.runnerManager.setCurrentLanguage(language);

        // 更新 UI
        this.container.querySelectorAll('.runner-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.language === language);
        });

        // 更新占位符
        const editor = this.container.querySelector('.runner-editor');
        editor.placeholder = this.getPlaceholder();

        // 清空编辑器和输出
        this.clearAll();
    }

    async runCode() {
        if (this.isRunning) {
            this.showToast('代码正在运行中...', 'warning');
            return;
        }

        const editor = this.container.querySelector('.runner-editor');
        const code = editor.value.trim();

        if (!code) {
            this.showToast('请输入代码', 'warning');
            return;
        }

        // 清空输出
        this.clearOutput();
        this.outputLines = [];

        // 更新状态
        this.setRunning(true);
        this.updateStatus('运行中...', 'running');

        try {
            const result = await this.runnerManager.run(code, this.currentLanguage, {
                onStart: () => {
                    this.setRunning(true);
                },
                onOutput: (output) => {
                    this.appendOutput(output);
                },
                onComplete: (result) => {
                    this.setRunning(false);
                    if (result.success) {
                        this.updateStatus(`✓ 执行成功 (${result.duration}ms)`, 'success');
                    } else {
                        this.updateStatus(`✗ 执行失败`, 'error');
                    }
                },
                onError: (error) => {
                    this.setRunning(false);
                    this.updateStatus(`✗ ${error.message || '执行错误'}`, 'error');
                }
            });
        } catch (error) {
            this.setRunning(false);
            this.updateStatus(`✗ ${error.message}`, 'error');
        }
    }

    appendOutput(output) {
        const outputContainer = this.container.querySelector('.runner-output');
        
        if (output.level === 'clear') {
            this.clearOutput();
            return;
        }

        const line = document.createElement('div');
        line.className = `runner-output-line runner-output-${output.level}`;
        
        const prefix = this.getOutputPrefix(output.level);
        const content = output.data ? output.data.join(' ') : '';
        
        line.innerHTML = `
            <span class="runner-output-prefix">${prefix}</span>
            <span class="runner-output-content">${this.escapeHtml(content)}</span>
        `;
        
        outputContainer.appendChild(line);
        
        // 自动滚动到底部
        outputContainer.scrollTop = outputContainer.scrollHeight;
        
        this.outputLines.push(output);
    }

    getOutputPrefix(level) {
        const prefixes = {
            log: '>',
            error: '✗',
            warn: '⚠',
            info: 'ℹ'
        };
        return prefixes[level] || '>';
    }

    clearOutput() {
        const outputContainer = this.container.querySelector('.runner-output');
        outputContainer.innerHTML = '';
        this.outputLines = [];
    }

    clearAll() {
        // 清空编辑器
        const editor = this.container.querySelector('.runner-editor');
        editor.value = '';
        
        // 清空输出
        this.clearOutput();
        
        // 重置状态
        this.updateStatus('', '');
    }

    setRunning(running) {
        this.isRunning = running;
        
        const runBtn = this.container.querySelector('[data-action="run"]');
        const editor = this.container.querySelector('.runner-editor');
        
        if (running) {
            runBtn.disabled = true;
            runBtn.classList.add('running');
            runBtn.querySelector('.runner-btn-text').textContent = '运行中...';
            editor.disabled = true;
        } else {
            runBtn.disabled = false;
            runBtn.classList.remove('running');
            runBtn.querySelector('.runner-btn-text').textContent = chrome.i18n.getMessage('runnerExecute') || '运行';
            editor.disabled = false;
        }
    }

    updateStatus(message, type) {
        const statusEl = this.container.querySelector('.runner-status');
        statusEl.textContent = message;
        statusEl.className = `runner-status runner-status-${type}`;
    }

    getPlaceholder() {
        const placeholders = {
            javascript: '// 输入 JavaScript 代码\nconsole.log("Hello, World!");',
            python: '# 输入 Python 代码\nprint("Hello, World!")',
            html: '<!-- 输入 HTML 代码 -->\n<h1>Hello, World!</h1>'
        };
        return placeholders[this.currentLanguage] || '';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(message, type = 'info') {
        if (window.ToastManager) {
            window.ToastManager.show(message, type);
        }
    }

    async cleanup() {
        if (this.runnerManager) {
            this.runnerManager.stop();
        }
        await super.cleanup();
    }
}

// 导出
if (typeof window !== 'undefined') {
    window.RunnerTab = RunnerTab;
}

