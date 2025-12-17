// Template Manager UI Script

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[TemplateUI] 页面加载完成");

  // DOM元素
  const backBtn = document.getElementById("backBtn");
  const builtInList = document.getElementById("builtInList");

  // 初始化模板管理器
  await window.templateManager.init();

  // 加载模板列表
  await loadTemplates();

  // 事件监听
  backBtn.addEventListener("click", () => {
    window.location.href = "popup.html";
  });

  // 加载模板列表
  async function loadTemplates() {
    try {
      const templates = await window.templateManager.getAllTemplates();

      // 只渲染内置模板
      const builtIn = templates.builtIn || [];
      renderTemplateList(builtInList, builtIn);
    } catch (error) {
      console.error("[TemplateUI] 加载模板失败:", error);
      showError("加载模板失败: " + error.message);
    }
  }

  // 渲染模板列表
  function renderTemplateList(container, templates) {
    container.innerHTML = "";

    if (templates.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p>暂无模板</p>
        </div>
      `;
      return;
    }

    templates.forEach((template) => {
      const card = createTemplateCard(template);
      container.appendChild(card);
    });
  }

  // 创建模板卡片
  function createTemplateCard(template) {
    const card = document.createElement("div");
    card.className = "template-card";

    card.innerHTML = `
      <div class="template-header">
        <div class="template-info">
          <h3 class="template-name">
            ${template.siteName}
            <span class="template-badge">内置</span>
          </h3>
          <div class="template-meta">
            <span>版本: ${template.version}</span>
            <span>更新: ${template.lastUpdated}</span>
          </div>
        </div>
      </div>

      ${
        template.description
          ? `<p class="template-description">${template.description}</p>`
          : ""
      }

      <div class="template-urls">
        ${
          template.urlPatterns
            ? template.urlPatterns
                .map((url) => `<span class="url-tag">${url}</span>`)
                .join("")
            : ""
        }
      </div>
    `;

    return card;
  }

  // 工具函数
  function showLoading(message) {
    // 可以使用 layer.load() 或自定义loading
    console.log("[Loading]", message);
  }

  function hideLoading() {
    console.log("[Loading] Hide");
  }

  function showSuccess(message) {
    alert("✓ " + message);
  }

  function showError(message) {
    alert("✗ " + message);
  }
});
