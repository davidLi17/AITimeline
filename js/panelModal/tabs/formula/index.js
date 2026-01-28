/**
 * Formula Tab - 复制 LaTeX 公式设置
 * 
 * 功能：
 * - 提供开关控制公式复制功能
 * - 点击公式即可复制为 LaTeX 格式
 * - 支持选择复制格式（无特殊附加、$ ... $、$$ ... $$ 等）
 */

class FormulaTab extends BaseTab {
    constructor() {
        super();
        this.id = 'formula';
        this.name = chrome.i18n.getMessage('kpxvmz');
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 3H4l5 8-5 8h10"/>
            <path d="M14 15l3 3 5-6"/>
        </svg>`;
    }
    
    /**
     * 渲染设置内容
     */
    render() {
        const container = document.createElement('div');
        container.className = 'formula-settings';
        
        // 生成格式选项的 HTML
        const formatOptionsHtml = FORMULA_FORMATS.map(format => `
            <label class="format-option">
                <input type="radio" name="formula-format" value="${format.id}">
                <span class="format-radio"></span>
                <span class="format-label">${format.label}</span>
            </label>
        `).join('');
        
        container.innerHTML = `
            <div class="setting-section">
                <div class="setting-item">
                    <div class="setting-info">
                        <div class="setting-label">${chrome.i18n.getMessage('zmkvpx')}</div>
                        <div class="setting-hint">
                            ${chrome.i18n.getMessage('vxkpzm')}
                        </div>
                    </div>
                    <label class="ait-toggle-switch">
                        <input type="checkbox" id="formula-toggle">
                        <span class="ait-toggle-slider"></span>
                    </label>
                </div>
            </div>
            
            <div class="setting-section format-section" id="format-section" style="display: none;">
                <div class="format-section-title">${chrome.i18n.getMessage('formulaFormatTitle') || '选择复制格式'}</div>
                <div class="format-options">
                    ${formatOptionsHtml}
                </div>
            </div>
        `;
        
        return container;
    }
    
    /**
     * Tab 激活时加载状态
     */
    async mounted() {
        super.mounted();
        
        const checkbox = document.getElementById('formula-toggle');
        const formatSection = document.getElementById('format-section');
        const formatRadios = document.querySelectorAll('input[name="formula-format"]');
        
        if (!checkbox) return;
        
        // 读取当前状态
        try {
            const result = await chrome.storage.local.get(['formulaEnabled', 'formulaFormat']);
            
            // 默认值为 true（开启）
            const isEnabled = result.formulaEnabled !== false;
            checkbox.checked = isEnabled;
            
            // 显示/隐藏格式选择区域
            if (formatSection) {
                formatSection.style.display = isEnabled ? 'block' : 'none';
            }
            
            // 设置格式选中状态（默认 'none'）
            const currentFormat = result.formulaFormat || 'none';
            formatRadios.forEach(radio => {
                radio.checked = radio.value === currentFormat;
            });
        } catch (e) {
            console.error('[FormulaTab] Failed to load state:', e);
            checkbox.checked = true;
            if (formatSection) {
                formatSection.style.display = 'block';
            }
        }
        
        // 监听开关变化
        this.addEventListener(checkbox, 'change', async (e) => {
            try {
                const enabled = e.target.checked;
                
                // 保存到 Storage
                await chrome.storage.local.set({ formulaEnabled: enabled });
                
                // 显示/隐藏格式选择区域
                if (formatSection) {
                    formatSection.style.display = enabled ? 'block' : 'none';
                }
            } catch (e) {
                console.error('[FormulaTab] Failed to save state:', e);
                checkbox.checked = !checkbox.checked;
            }
        });
        
        // 监听格式选择变化
        formatRadios.forEach(radio => {
            this.addEventListener(radio, 'change', async (e) => {
                try {
                    const formatId = e.target.value;
                    await chrome.storage.local.set({ formulaFormat: formatId });
                } catch (e) {
                    console.error('[FormulaTab] Failed to save format:', e);
                }
            });
        });
    }
    
    /**
     * Tab 卸载时清理
     */
    unmounted() {
        super.unmounted();
    }
}

