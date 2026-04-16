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

  const mode = request.mode || "resume_import";
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
    resume_import: `你是一个“标准化简历整理助手”。

用户会提供原始简历文本，以及一个固定 JSON 模板。你的任务是把简历内容提取并填入该模板。

要求：
1) 只输出 JSON（不要输出其它文本，不要 Markdown 代码块）
2) 只能使用模板已有字段，不要新增字段
3) 不要编造不存在的信息；没有信息就保留空字符串
4) 若遇到列表槽位，按时间从近到远填写
5) 日期尽量规范化`,

    field_mapping: `你是一个“网页表单字段映射助手”。

你将收到一个 JSON，包含：
- fields：当前页面识别到的表单字段
- fields 中的单个 field 可能额外带有 sectionKey、sectionLabel、sectionEvidence、nearbyLabels，用于表示扫描阶段推断出的区块和邻近标签
- resumeFields：预先定义好的标准简历字段目录（含 path、label、sectionLabel、itemLabel、hasValue、valuePreview 等）

你的任务：
1) 为每个页面 field 选择最合适的 resumePath
2) 只做“字段映射”，不要生成最终填写值
3) 若字段需要简单转换，可返回 transform
4) 若没有合适字段，resumePath 返回空字符串
5) 只输出 JSON（不要输出其它文本，不要 Markdown 代码块）

映射原则：
1) 优先综合 field 的 label、context、options、sectionLabel、sectionEvidence、nearbyLabels、所在区块语义，与 resumeFields 的 label、sectionLabel、itemLabel、path、valuePreview 一起判断
2) 当多个候选语义接近时，优先选择 sectionLabel / itemLabel 更一致、且 hasValue=true 的 resumePath
3) 对同一区块内重复出现的“起止时间”字段，通常前一个映射开始时间，后一个映射结束时间
4) 如果 field.label 为空但 sectionLabel / nearbyLabels 不为空，必须充分利用这些扫描线索，不要把它当成完全无信息字段

校招场景优先级：
1) 含“实习”“实习经历”“实习公司”“实习岗位”等语义时，优先映射到 internships.*，不要优先映射到 workExperiences.*
2) 含“学生组织”“社团”“校园经历”“志愿服务”“科研助理”“班干部”“校园活动”等语义时，优先映射到 campusExperiences.*
3) 含“学历类型”“培养方式”“实验室”“领域方向”“导师”“学号”“班级”“学制”等语义时，优先映射到 educations.*
4) 含“学校名称”“学院”“专业”“学历”“GPA”“排名”“论文”“毕业状态”等教育语义时，也优先映射到 educations.*

保守规则：
1) 如果页面字段只是状态性复选框，例如“没有实习经历”“无实习经历”“暂无项目经历”，只有在 resumeFields 中存在明确语义等价的布尔字段时才映射；否则返回空字符串
2) 不要仅因为字段都出现在同一块区域，就把教育字段映射到 personal.* 或 additional.*
3) 没有足够语义证据时，宁可不映射，也不要勉强猜测

输出格式（严格遵守）：
{
  "mappings": [
    {
      "fieldId": "f_1",
      "resumePath": "personal.email",
      "reason": "该字段是邮箱",
      "transform": { "type": "none" }
    }
  ]
}

允许的 transform：
- { "type": "none" }
- { "type": "date_part", "part": "year" | "month" | "day" }
- { "type": "phone_part", "part": "countryCode" | "nationalNumber" }
- { "type": "boolean_choice", "trueValue": "...", "falseValue": "..." }
- { "type": "join", "separator": ", " }

不要返回未列出的 transform。`,
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
