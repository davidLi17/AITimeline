/**
 * Timeline Constants
 * 
 * 存放时间轴相关的静态常量配置
 */

// ==================== 平台信息 ====================

/**
 * 支持的平台信息
 * 每个平台包含：域名列表、平台名称、品牌颜色、logo 路径
 */
const SITE_INFO = [
    {
        sites: ['chatgpt.com', 'chat.openai.com'],
        name: 'ChatGPT',
        color: '#0D0D0D',
        logoPath: 'images/logo/chatgpt.webp'
    },
    {
        sites: ['gemini.google.com'],
        name: 'Gemini',
        color: '#4285F4',
        logoPath: 'images/logo/gemini.webp'
    },
    {
        sites: ['doubao.com'],
        name: '豆包',
        color: '#7C3AED',
        logoPath: 'images/logo/doubao.webp'
    },
    {
        sites: ['chat.deepseek.com'],
        name: 'DeepSeek',
        color: '#3B82F6',
        logoPath: 'images/logo/deepseek.webp'
    },
    {
        sites: ['yiyan.baidu.com'],
        name: '文心一言',
        color: '#EF4444',
        logoPath: 'images/logo/wenxin.webp'
    },
    {
        sites: ['tongyi.com'],
        name: '通义千问',
        color: '#F59E0B',
        logoPath: 'images/logo/tongyi.webp'
    },
    {
        sites: ['kimi.com', 'kimi.moonshot.cn'],
        name: 'Kimi',
        color: '#8B5CF6',
        logoPath: 'images/logo/kimi.webp'
    },
    {
        sites: ['yuanbao.tencent.com'],
        name: '元宝',
        color: '#10B981',
        logoPath: 'images/logo/yuanbao.webp'
    },
    {
        sites: ['grok.com'],
        name: 'Grok',
        color: '#000000',
        logoPath: 'images/logo/grok.webp'
    }
];

/**
 * 获取完整的 siteNameMap
 * 将数组结构的 SITE_INFO 转换为域名映射对象，并将 logoPath 转换为完整的 chrome.runtime URL
 * 
 * @returns {Object} 域名到平台信息的映射对象，格式：{ 'domain': { name, color, logo } }
 */
function getSiteNameMap() {
    const map = {};
    for (const platform of SITE_INFO) {
        const info = {
            name: platform.name,
            color: platform.color,
            logo: chrome.runtime.getURL(platform.logoPath)
        };
        // 为每个域名创建映射
        for (const site of platform.sites) {
            map[site] = info;
        }
    }
    return map;
}

