(function initResumeAiClient(root) {
  "use strict";

  function callAI(modelId, prompt, mode) {
    return new Promise((resolve, reject) => {
      root.chrome.runtime.sendMessage(
        { action: "callAI", modelId, prompt, mode },
        (response) => {
          if (root.chrome.runtime.lastError) {
            reject(new Error(root.chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            reject(new Error("AI 响应为空"));
            return;
          }

          if (response.success) {
            resolve(response.data);
            return;
          }

          reject(new Error(response.error || "AI 调用失败"));
        }
      );
    });
  }

  root.ResumeAiClient = Object.freeze({ callAI });
})(typeof globalThis !== "undefined" ? globalThis : this);
