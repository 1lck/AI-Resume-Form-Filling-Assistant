// Template Manager Module - 模板管理器
// 负责模板的存储、加载、更新等操作

(function () {
  "use strict";

  class TemplateManager {
    constructor() {
      this.STORAGE_KEY = "siteTemplates";
      this.STATS_KEY = "templateStats";
      this.builtInTemplates = [];
    }

    /**
     * 初始化：加载内置模板和用户模板
     */
    async init() {
      console.log("[TemplateManager] 初始化中...");

      // 加载内置模板
      await this.loadBuiltInTemplates();

      // 加载用户自定义模板
      await this.loadCustomTemplates();

      console.log("[TemplateManager] 初始化完成");
    }

    /**
     * 加载内置模板
     */
    async loadBuiltInTemplates() {
      try {
        // 加载问卷星模板
        const wjxTemplate = await this._fetchTemplate("/templates/wjx.json");
        if (wjxTemplate) {
          this.builtInTemplates.push(wjxTemplate);
          window.siteMatcher.registerTemplate(wjxTemplate);
          console.log("[TemplateManager] 内置模板加载成功: 问卷星");
        }

        // 加载腾讯问卷模板
        const tencentTemplate = await this._fetchTemplate(
          "/templates/tencent.json"
        );
        if (tencentTemplate) {
          this.builtInTemplates.push(tencentTemplate);
          window.siteMatcher.registerTemplate(tencentTemplate);
          console.log("[TemplateManager] 内置模板加载成功: 腾讯问卷");
        }

        // TODO: 加载更多内置模板
        // const examTemplate = await this._fetchTemplate('/templates/exam.json');
      } catch (error) {
        console.error("[TemplateManager] 加载内置模板失败:", error);
      }
    }

    /**
     * 加载用户自定义模板
     */
    async loadCustomTemplates() {
      try {
        const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
        const templates = result[this.STORAGE_KEY] || {};

        for (const [siteId, template] of Object.entries(templates)) {
          window.siteMatcher.registerTemplate(template);
        }

        const count = Object.keys(templates).length;
        console.log(`[TemplateManager] 加载自定义模板: ${count}个`);
      } catch (error) {
        console.error("[TemplateManager] 加载自定义模板失败:", error);
      }
    }

    /**
     * 获取模板文件
     * @private
     */
    async _fetchTemplate(path) {
      try {
        const response = await fetch(chrome.runtime.getURL(path));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        console.error(`[TemplateManager] 获取模板失败 ${path}:`, error);
        return null;
      }
    }

    /**
     * 保存自定义模板
     * @param {Object} template 模板对象
     */
    async saveTemplate(template) {
      if (!template.siteId) {
        throw new Error("模板必须包含 siteId");
      }

      try {
        // 读取现有模板
        const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
        const templates = result[this.STORAGE_KEY] || {};

        // 添加/更新模板
        template.lastUpdated = new Date().toISOString().split("T")[0];
        templates[template.siteId] = template;

        // 保存
        await chrome.storage.sync.set({ [this.STORAGE_KEY]: templates });

        // 注册到匹配器
        window.siteMatcher.registerTemplate(template);

        console.log(`[TemplateManager] 模板已保存: ${template.siteId}`);
        return true;
      } catch (error) {
        console.error("[TemplateManager] 保存模板失败:", error);
        throw error;
      }
    }

    /**
     * 删除模板
     * @param {string} siteId 站点ID
     */
    async deleteTemplate(siteId) {
      try {
        const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
        const templates = result[this.STORAGE_KEY] || {};

        delete templates[siteId];

        await chrome.storage.sync.set({ [this.STORAGE_KEY]: templates });
        window.siteMatcher.removeTemplate(siteId);

        console.log(`[TemplateManager] 模板已删除: ${siteId}`);
        return true;
      } catch (error) {
        console.error("[TemplateManager] 删除模板失败:", error);
        throw error;
      }
    }

    /**
     * 获取所有模板（包括内置和自定义）
     */
    async getAllTemplates() {
      const result = await chrome.storage.sync.get([this.STORAGE_KEY]);
      const customTemplates = result[this.STORAGE_KEY] || {};

      return {
        builtIn: this.builtInTemplates,
        custom: Object.values(customTemplates),
      };
    }

    /**
     * 导出模板为JSON
     * @param {string} siteId 站点ID
     */
    async exportTemplate(siteId) {
      const template = window.siteMatcher.getTemplate(siteId);
      if (!template) {
        throw new Error(`模板不存在: ${siteId}`);
      }

      const json = JSON.stringify(template, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${siteId}_template.json`;
      a.click();

      URL.revokeObjectURL(url);
      console.log(`[TemplateManager] 模板已导出: ${siteId}`);
    }

    /**
     * 导入模板
     * @param {File} file JSON文件
     */
    async importTemplate(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const template = JSON.parse(e.target.result);

            // 验证模板格式
            if (!template.siteId || !template.selectors) {
              throw new Error("模板格式不正确");
            }

            await this.saveTemplate(template);
            resolve(template);
          } catch (error) {
            reject(error);
          }
        };

        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(file);
      });
    }

    /**
     * 更新模板统计信息
     * @param {string} siteId 站点ID
     * @param {string} result 'success' | 'fail'
     */
    async updateStats(siteId, result) {
      try {
        const statsResult = await chrome.storage.sync.get([this.STATS_KEY]);
        const stats = statsResult[this.STATS_KEY] || {};

        if (!stats[siteId]) {
          stats[siteId] = {
            useCount: 0,
            successCount: 0,
            failCount: 0,
            successRate: 0,
            lastUsed: null,
          };
        }

        stats[siteId].useCount++;
        if (result === "success") {
          stats[siteId].successCount++;
        } else if (result === "fail") {
          stats[siteId].failCount++;
        }

        stats[siteId].successRate =
          stats[siteId].successCount / stats[siteId].useCount;
        stats[siteId].lastUsed = new Date().toISOString();

        await chrome.storage.sync.set({ [this.STATS_KEY]: stats });

        console.log(`[TemplateManager] 统计已更新: ${siteId}`, result);
      } catch (error) {
        console.error("[TemplateManager] 更新统计失败:", error);
      }
    }

    /**
     * 获取模板统计信息
     * @param {string} siteId 站点ID
     */
    async getStats(siteId) {
      const result = await chrome.storage.sync.get([this.STATS_KEY]);
      const stats = result[this.STATS_KEY] || {};
      return stats[siteId] || null;
    }

    /**
     * 获取所有统计信息
     */
    async getAllStats() {
      const result = await chrome.storage.sync.get([this.STATS_KEY]);
      return result[this.STATS_KEY] || {};
    }
  }

  // 导出到全局
  window.TemplateManager = TemplateManager;

  // 创建全局实例
  window.templateManager = new TemplateManager();

  console.log("[TemplateManager] 模块已加载");
})();
