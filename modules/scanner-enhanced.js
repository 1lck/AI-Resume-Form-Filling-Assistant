// Scanner Enhanced Module - 增强扫描器
// 使用站点模板进行题目扫描

(function () {
  "use strict";

  class EnhancedScanner {
    constructor() {
      this.questions = [];
    }

    /**
     * 使用模板扫描题目
     * @param {Object} template 站点模板
     * @returns {Object} 扫描结果 { success: boolean, questions: Array, count: number }
     */
    scanWithTemplate(template) {
      console.log("[EnhancedScanner] 开始使用模板扫描:", template.siteName);

      this.questions = [];
      const selectors = template.selectors;

      try {
        // 获取所有题目容器
        const questionElements = document.querySelectorAll(
          selectors.questionContainer
        );

        if (questionElements.length === 0) {
          console.warn("[EnhancedScanner] 未找到题目容器");
          return { success: false, questions: [], count: 0 };
        }

        console.log(
          `[EnhancedScanner] 找到 ${questionElements.length} 个题目容器`
        );

        // 遍历每个题目
        questionElements.forEach((element, index) => {
          const question = this._parseQuestionWithTemplate(
            element,
            index,
            template
          );
          if (question) {
            this.questions.push(question);
          }
        });

        console.log(
          `[EnhancedScanner] 扫描完成，解析成功 ${this.questions.length} 道题`
        );

        return {
          success: this.questions.length > 0,
          questions: this.questions,
          count: this.questions.length,
        };
      } catch (error) {
        console.error("[EnhancedScanner] 扫描失败:", error);
        return {
          success: false,
          questions: [],
          count: 0,
          error: error.message,
        };
      }
    }

    /**
     * 使用模板解析单个题目
     * @private
     */
    _parseQuestionWithTemplate(element, index, template) {
      const selectors = template.selectors;
      const questionTypes = selectors.questionTypes;

      // 确定题目类型
      let questionType = null;
      let typeSelectors = null;

      if (selectors.questionTypes.detectByAttribute) {
        // 通过属性判断类型
        const attrName = selectors.questionTypes.detectByAttribute;
        const typeValue = element.getAttribute(attrName);

        // 查找匹配的类型
        for (const [type, config] of Object.entries(questionTypes)) {
          if (type === "detectByAttribute") continue;
          if (config.typeValue === typeValue) {
            questionType = type;
            typeSelectors = config;
            break;
          }
        }
      } else {
        // 通过选择器判断类型
        for (const [type, config] of Object.entries(questionTypes)) {
          if (type === "detectByAttribute") continue;
          if (element.matches(config.container)) {
            questionType = type;
            typeSelectors = config;
            break;
          }
        }
      }

      if (!questionType) {
        console.warn("[EnhancedScanner] 无法确定题目类型:", element);
        return null;
      }

      // 构建题目对象
      const question = {
        index: index,
        type: questionType,
        text: "",
        options: [],
        inputs: [],
        answered: false,
        element: element,
      };

      // 提取题目文本
      const titleElement = element.querySelector(typeSelectors.title);
      if (titleElement) {
        question.text = this._cleanText(titleElement.textContent);
      }

      // 根据类型提取选项或输入框
      if (questionType === "single" || questionType === "multiple") {
        question.options = this._parseOptions(element, typeSelectors, template);
      } else if (questionType === "fill") {
        question.inputs = this._parseInputs(element, typeSelectors);
      }

      console.log(
        `[EnhancedScanner] 题目${index + 1} [${questionType}]:`,
        question.text.substring(0, 30) + "..."
      );

      return question;
    }

    /**
     * 解析选项
     * @private
     */
    _parseOptions(container, typeSelectors, template) {
      const options = [];
      const optionElements = container.querySelectorAll(
        typeSelectors.optionItem
      );

      optionElements.forEach((optionEl, idx) => {
        // 查找input元素
        const input = optionEl.querySelector(typeSelectors.optionInput);
        if (!input) return;

        // 查找label文本
        const labelEl = optionEl.querySelector(typeSelectors.optionLabel);
        let optionText = labelEl ? labelEl.textContent.trim() : "";

        // 提取选项字母
        let optionLabel = String.fromCharCode(65 + idx); // 默认A, B, C...

        if (typeSelectors.optionLabelPattern && optionText) {
          const pattern = new RegExp(typeSelectors.optionLabelPattern);
          const match = optionText.match(pattern);
          if (match && match[1]) {
            optionLabel = match[1];
            // 移除前缀
            optionText = optionText.substring(match[0].length).trim();
          }
        }

        // 生成精确选择器
        const selector = this._generateSelector(input, template);

        options.push({
          label: optionLabel,
          text: optionText,
          selector: selector,
          element: input,
        });
      });

      return options;
    }

    /**
     * 解析输入框
     * @private
     */
    _parseInputs(container, typeSelectors) {
      const inputs = [];
      const inputElements = container.querySelectorAll(typeSelectors.inputs);

      inputElements.forEach((input) => {
        const selector = this._generateSelector(input);
        inputs.push({
          selector: selector,
          element: input,
        });
      });

      return inputs;
    }

    /**
     * 生成元素的精确CSS选择器
     * @private
     */
    _generateSelector(element, template) {
      // 优先级1: ID选择器
      if (element.id) {
        return `#${element.id}`;
      }

      // 优先级2: name属性选择器
      if (element.name) {
        const tagName = element.tagName.toLowerCase();
        if (element.type) {
          return `${tagName}[name="${element.name}"][type="${element.type}"]`;
        }
        return `${tagName}[name="${element.name}"]`;
      }

      // 优先级3: 唯一属性选择器
      const uniqueAttrs = ["data-id", "data-index", "data-value"];
      for (const attr of uniqueAttrs) {
        if (element.hasAttribute(attr)) {
          const value = element.getAttribute(attr);
          return `${element.tagName.toLowerCase()}[${attr}="${value}"]`;
        }
      }

      // 优先级4: class + nth-child
      if (element.className) {
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element) + 1;
          const className = element.className.split(" ")[0];
          return `.${className}:nth-child(${index})`;
        }
      }

      // 后备: 生成完整路径
      return this._getFullPath(element);
    }

    /**
     * 获取元素的完整路径
     * @private
     */
    _getFullPath(element) {
      const path = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector = `#${current.id}`;
          path.unshift(selector);
          break;
        }

        if (current.className) {
          const classList = current.className.trim().split(/\s+/);
          if (classList.length > 0 && classList[0]) {
            selector += `.${classList[0]}`;
          }
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (e) => e.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }

        path.unshift(selector);
        current = parent;

        // 限制路径深度
        if (path.length > 5) break;
      }

      return path.join(" > ");
    }

    /**
     * 清理文本
     * @private
     */
    _cleanText(text) {
      return text
        .replace(/\s+/g, " ")
        .replace(/[\r\n]+/g, " ")
        .trim()
        .substring(0, 1000);
    }

    /**
     * 获取扫描结果
     */
    getQuestions() {
      return this.questions;
    }
  }

  // 导出到全局
  window.EnhancedScanner = EnhancedScanner;

  console.log("[EnhancedScanner] 模块已加载");
})();
