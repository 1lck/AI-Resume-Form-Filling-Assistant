// Site Matcher Module - 站点匹配器
// 根据URL匹配对应的站点模板

(function() {
  'use strict';

  class SiteMatcher {
    constructor() {
      this.templates = new Map();
    }

    /**
     * 注册站点模板
     * @param {Object} template 模板对象
     */
    registerTemplate(template) {
      if (!template.siteId) {
        console.warn('[SiteMatcher] 模板缺少 siteId:', template);
        return false;
      }
      this.templates.set(template.siteId, template);
      return true;
    }

    /**
     * 批量注册模板
     * @param {Array} templates 模板数组
     */
    registerTemplates(templates) {
      if (!Array.isArray(templates)) {
        console.warn('[SiteMatcher] registerTemplates 需要数组参数');
        return;
      }
      templates.forEach(template => this.registerTemplate(template));
    }

    /**
     * 根据URL匹配站点模板
     * @param {string} url 当前页面URL
     * @returns {Object|null} 匹配的模板或null
     */
    matchTemplate(url = window.location.href) {
      // 优先级1: 精确匹配 urlPatterns
      for (const [siteId, template] of this.templates) {
        if (template.urlPatterns && Array.isArray(template.urlPatterns)) {
          for (const pattern of template.urlPatterns) {
            if (this._matchPattern(url, pattern)) {
              console.log(`[SiteMatcher] URL模式匹配成功: ${siteId}`, pattern);
              return template;
            }
          }
        }
      }

      // 优先级2: 正则表达式匹配
      for (const [siteId, template] of this.templates) {
        if (template.urlRegex) {
          try {
            const regex = new RegExp(template.urlRegex);
            if (regex.test(url)) {
              console.log(`[SiteMatcher] 正则匹配成功: ${siteId}`, template.urlRegex);
              return template;
            }
          } catch (e) {
            console.warn(`[SiteMatcher] 无效的正则表达式: ${template.urlRegex}`, e);
          }
        }
      }

      // 优先级3: 域名匹配
      const domain = this._extractDomain(url);
      for (const [siteId, template] of this.templates) {
        if (template.domain && template.domain === domain) {
          console.log(`[SiteMatcher] 域名匹配成功: ${siteId}`, domain);
          return template;
        }
      }

      console.log('[SiteMatcher] 未找到匹配的模板');
      return null;
    }

    /**
     * 通配符模式匹配
     * @private
     */
    _matchPattern(url, pattern) {
      // 将通配符模式转换为正则表达式
      const regexPattern = pattern
        .replace(/\./g, '\\.')  // 转义点号
        .replace(/\*/g, '.*')   // * 转为 .*
        .replace(/\?/g, '.');   // ? 转为 .
      
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url);
    }

    /**
     * 提取域名
     * @private
     */
    _extractDomain(url) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname;
      } catch (e) {
        return '';
      }
    }

    /**
     * 获取所有已注册的模板
     * @returns {Array} 模板列表
     */
    getAllTemplates() {
      return Array.from(this.templates.values());
    }

    /**
     * 根据siteId获取模板
     * @param {string} siteId 站点ID
     * @returns {Object|null} 模板对象
     */
    getTemplate(siteId) {
      return this.templates.get(siteId) || null;
    }

    /**
     * 删除模板
     * @param {string} siteId 站点ID
     */
    removeTemplate(siteId) {
      return this.templates.delete(siteId);
    }

    /**
     * 清空所有模板
     */
    clearTemplates() {
      this.templates.clear();
    }
  }

  // 导出到全局
  window.SiteMatcher = SiteMatcher;
  
  // 创建全局实例
  window.siteMatcher = new SiteMatcher();

  console.log('[SiteMatcher] 模块已加载');
})();



