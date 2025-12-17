// Background Service Worker
// 统一代理调用 OpenAI 兼容接口（如 DeepSeek），避免侧边栏/内容脚本的 CORS 问题。

// 初始化：点击扩展图标时打开侧边栏
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return;
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request?.action !== "callAI") return;

  const mode = request.mode || "resume_parse";
  callAI(request.config, request.prompt, mode)
    .then((response) => sendResponse({ success: true, data: response }))
    .catch((error) =>
      sendResponse({ success: false, error: error?.message || String(error) })
    );

  return true; // 保持消息通道，用于异步响应
});

async function callAI(config, prompt, mode) {
  const { baseUrl, apiKey, model } = config || {};

  if (!baseUrl || !apiKey || !model) {
    throw new Error("模型配置不完整：请检查 Base URL / API Key / 模型ID");
  }

  let url = String(baseUrl).replace(/\/$/, "");
  if (!url.endsWith("/chat/completions")) {
    url += "/chat/completions";
  }

  const systemPrompts = {
    resume_parse: `你是一个“简历解析助手”。用户会提供中文简历文本，你需要提取其中信息并整理为结构化 JSON。

要求：
1) 只输出 JSON（不要输出其它文本，不要 Markdown 代码块）
2) 不要编造不存在的信息
3) 结构要便于自动填写网页表单（可包含：基本信息、联系方式、教育经历、工作经历、项目经历、技能、证书、个人链接、期望、自我介绍等）
4) 可使用中文或英文键名，不做强制限制，但要清晰、一致`,

    form_fill: `你是一个“网页表单自动填写助手”。你将收到一个 JSON，包含：
- fields：页面字段数组（包含 fieldId、kind、label/name/id/placeholder 等以及 options）
- resume：结构化简历 JSON

你的任务：
1) 为每个 field 选择最合适的填写内容（来自 resume），并给出简短理由
2) 只输出 JSON（不要输出其它文本，不要 Markdown 代码块）

输出格式（严格遵守）：
{
  "fills": [
    { "fieldId": "xxx", "value": "...", "reason": "..." }
  ]
}

value 规则：
- kind = "checkbox_group"：value 为字符串数组（要勾选的选项文本）
- kind = "radio_group" / "select"：value 为字符串（要选择的选项文本）
- 其它：value 为字符串
- 若无法判断，请返回 value = ""，并在 reason 说明原因（不要编造）`,
  };

  const system = systemPrompts[mode];
  if (!system) {
    throw new Error(`不支持的 AI 模式：${mode}`);
  }

  const timeoutMs = 120_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(prompt || "") },
        ],
      }),
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("API 请求超时：请检查网络/Key/模型是否可用后重试");
    }
    throw new Error(`网络请求失败：${err?.message || String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `API 请求失败 (${response.status})`;

    try {
      const errorJson = JSON.parse(errorText);
      const msg = errorJson?.error?.message || errorJson?.message || "";
      if (response.status === 401) {
        errorMsg = "API Key 无效，请检查配置";
      } else if (response.status === 403) {
        errorMsg = "API 访问被拒绝，请检查 Key/权限/余额";
      } else if (response.status === 429) {
        errorMsg = "API 请求过于频繁，请稍后重试";
      } else if ([500, 502, 503].includes(response.status)) {
        errorMsg = "API 服务暂时不可用，请稍后重试";
      } else if (msg) {
        errorMsg = `API 错误：${msg}`;
      }
    } catch (_) {
      // ignore
    }

    console.error("[简历填表助手] API 请求失败:", {
      status: response.status,
      url,
      response: errorText,
    });
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("API 返回格式错误：缺少 choices[0].message.content");
  }
  return content;
}
