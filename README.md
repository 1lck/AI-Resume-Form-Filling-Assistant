# AI 简历填表助手

一个基于 Chrome/Edge Side Panel 的浏览器扩展。

你维护一份标准化简历，扩展负责在网页里扫描表单字段，用大模型只做“字段映射”，再由本地脚本执行确定性填充。默认不会自动提交表单。

<p align="center">
  <img src="icons/icon128.png" alt="AI 简历填表助手 Logo" width="88" />
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" />
  <img alt="Edge Extension" src="https://img.shields.io/badge/Edge-Extension-0078D7?logo=microsoftedge&logoColor=white" />
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-5B6CFF" />
  <img alt="Node Test" src="https://img.shields.io/badge/Test-Node%20--test-339933?logo=nodedotjs&logoColor=white" />
  <img alt="License GPL-3.0" src="https://img.shields.io/badge/License-GPL--3.0-blue" />
</p>

<p align="center">
  <img src="img.png" alt="侧边栏总览" width="48%" />
  <img src="img_1.png" alt="简历配置页" width="48%" />
</p>

<p align="center">
  <img src="img_2.png" alt="模型与功能界面" width="48%" />
  <img src="img_3.png" alt="填表流程界面" width="48%" />
</p>

> [!TIP]
> 适合需要频繁填写网申、招聘官网和报名表单的人。扩展默认只填值，不提交表单。

> [!NOTE]
> 我的开源项目已链接认可 [LINUX DO](https://linux.do) 社区，欢迎在 LINUX DO 开源自荐帖中交流、反馈和共建。

## 🎯 这项目解决什么问题

大多数网申/招聘表单都有几个共同问题：

- 同一份信息要反复填写
- 不同网站字段命名不统一
- 某些页面用了自定义控件、日期面板、单选/多选组，脚本很难稳定处理
- 纯“让 AI 直接操作页面”不够可控，也不方便排查失败原因

这个项目的做法不是让 AI 直接乱填页面，而是拆成两步：

1. 先把你的简历整理成固定 schema
2. 再让 AI 只判断“页面字段应该对应简历里的哪个路径”

映射完成后，真正的写值、触发事件、匹配选项、处理日期控件，都在内容脚本里本地执行。

这让行为更可控，也更容易调试。

## ✨ 核心能力

- 标准简历 schema：内置较完整的简历结构，覆盖基本信息、求职偏好、教育经历、实习、工作、项目、校园经历、证书、语言、补充信息等
- AI 导入简历：支持粘贴原始简历文本，或者上传带文字层的 PDF，自动抽取并整理为标准简历 JSON
- 三种填充模式：
  - 整页填充：覆盖当前页面可识别字段
  - 增量填入：跳过已经有值的字段
  - 选区填入：先框选页面区域，只填选区内字段
- 多控件支持：`input`、`textarea`、`select`、`radio group`、`checkbox group`、`contenteditable`
- 日期控件适配：对部分只读日期输入框和日期面板做了特殊处理
- 字段映射缓存：同一页面结构会复用本地映射缓存，减少重复调用模型
- 运行诊断日志：侧边栏展示关键日志，支持把完整会话自动导出到 `debug-logs/`
- 独立简历配置页：复杂简历字段不挤在侧边栏里，支持打开宽页面编辑
- 多模型配置：内置 DeepSeek，也可以配置任意 OpenAI 兼容接口

## 🧩 适合什么场景

- 校招/社招网申表单
- 企业招聘官网
- 需要频繁重复填写的申请表
- 希望保留人工确认，不想自动提交的人

## 🚫 不做什么

- 不自动提交表单
- 不处理 `input[type="file"]` 的自动上传
- 不内置 OCR，扫描版 PDF 需要你先 OCR
- 不依赖后端服务，不上传到你自己的服务器

## ⚙️ 项目怎么工作

### 1. 标准简历

扩展先维护一份固定 schema 的简历数据，存储在浏览器 `chrome.storage.sync` 中。

这一步的价值是把“原始简历文本”变成“可复用字段目录”，后面的映射和填充都围绕它进行。

### 2. 页面字段扫描

内容脚本会扫描当前页面可填写控件，并尽量提取：

- 字段标签
- placeholder
- 选项列表
- 上下文文本
- 附近标签
- 所在区块语义

项目里专门写了字段标签提取、区块语义判断、日期运行时判断等辅助模块，不是单纯只看 `label`。

### 3. AI 只做字段映射

发送给模型的是：

- 当前页面字段列表
- 已填写的标准简历字段目录
- 允许的 transform 规则

模型只返回“某个页面字段对应哪个 `resumePath`”，例如：

- `personal.email`
- `educations.0.school`
- `internships.0.company`

而不是直接返回一整页最终表单值。

### 4. 本地确定性填充

拿到映射后，扩展会在浏览器里本地完成：

- 取值
- 日期/手机号拆分
- 单选/多选匹配
- 下拉选择
- 输入事件与 change 事件触发

这一步不依赖模型，行为更稳定。

## 🚀 快速开始

### 1. 安装扩展

1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择当前项目目录
5. 点击扩展图标，打开侧边栏

这个项目没有构建步骤，源码目录可以直接加载。

### 2. 配置模型

侧边栏右上角进入设置。

默认内置一套 DeepSeek 配置模板，你也可以改成任意 OpenAI 兼容接口。当前实现调用的是：

- `POST /chat/completions`

常见示例：

- `Base URL`: `https://api.deepseek.com/v1`
- `Model`: `deepseek-chat`
- `API Key`: 你自己的 key

### 3. 准备标准简历

有两种方式：

- 手动填写标准简历
- 粘贴原始简历文本，或上传带文字层的 PDF，让 AI 先导入

如果简历内容较多，推荐点击“打开简历配置页”在独立页面里维护。

### 4. 在网页里执行填充

打开目标表单页后，可在侧边栏选择：

- `开始填充`
- `增量填入`
- `选区填入`

填充完成后，请自己检查并手动提交。

## 🧠 当前实现里值得注意的设计点

### 1. 映射缓存是按“页面结构签名”做的

项目不是简单按 URL 缓存，而是会结合字段种类、标签、placeholder、section 信息等生成签名。

这能避免“同一页面字段已经变了，但还错误复用旧缓存”的问题。

### 2. 侧边栏日志和完整诊断日志分层显示

UI 里只显示关键过程日志，冗长的结构化诊断不会全部堆到面板里。

如果你授权项目目录，完整会话日志会自动导出到：

- `debug-logs/`

适合排查“为什么这个网站没映射上”或“为什么这个日期控件没填进去”。

### 3. 项目偏向校招/中文网申语义

schema 和映射提示词里，对这些内容做了额外强化：

- 教育经历
- 实习经历
- 校园经历
- 学历类型 / 培养方式 / 实验室 / 导师 / 学号等字段

如果你的主要场景是中文招聘站，这一套会比通用型 schema 更顺手。

## 📌 支持与限制

### 已支持

- 文本输入框
- 文本域
- 下拉框
- 单选组
- 多选组
- `contenteditable`
- 部分只读日期输入框与日期面板
- 整页/增量/选区三种填充模式

### 明确限制

- 文件上传字段不能自动写入
- 扫描版 PDF 没有文字层时无法直接导入
- 跨域 `iframe` 内的字段可能无法识别或填写
- 极端自定义控件仍可能需要单站点适配
- 刚重载扩展后，旧页面里可能还挂着旧版 content script；刷新页面一次再试最稳妥

## ✅ 测试

仓库里已经带了一组基于 Node 内置测试运行器的测试，覆盖了这些核心部分：

- schema 结构与归一化
- AI JSON 解析容错
- 字段标签提取
- 页面字段 payload 构造
- 填充模式辅助逻辑
- 诊断日志格式
- 映射缓存版本与签名规则

运行：

```bash
node --test tests/*.js
```

仓库里还带了一个本地联调用表单：

- `output/playwright/test-form.html`

它主要用于验证增量填入和选区填入这两条链路。

## 🗂️ 项目结构

```text
.
├── manifest.json               # Chrome MV3 配置
├── background.js               # 统一代理 OpenAI 兼容接口调用
├── popup.html / popup.js       # 侧边栏 UI、模型设置、填充入口、日志
├── resume-editor.html / .js    # 独立简历配置页
├── content.js                  # 页面扫描、字段映射、实际填充
├── shared/
│   ├── resume-schema.js        # 标准简历 schema
│   ├── diagnostics.js          # 结构化诊断日志格式化
│   ├── field-text.js           # 字段标签抽取与评分
│   ├── field-semantics.js      # 区块语义判断
│   ├── fill-runtime.js         # 填充值与日期运行时适配
│   ├── log-export.js           # 调试日志导出
│   └── content-bridge.js       # content script 版本/能力握手
├── libs/pdfjs/                 # PDF 文本提取
├── tests/                      # Node 测试
└── output/playwright/          # 本地联调与截图产物
```

## 🧪 关于模板模块

仓库里还保留了一组问卷/考试站点模板相关模块：

- `modules/scanner-enhanced.js`
- `modules/site-matcher.js`
- `modules/template-manager.js`
- `templates/wjx.json`
- `templates/tencent.json`

它们更像一条早期或实验性质的能力线，用于问卷星、腾讯问卷这类站点的题目模板扫描；不是当前“标准简历自动填表”主流程的核心依赖。

## 🔒 隐私与安全

请默认按“简历数据是敏感信息”来理解这个项目。

- 你的 `API Key`、模型配置、标准简历会保存在浏览器扩展存储里
- 用于字段映射和简历导入的内容会发送到你配置的模型接口
- 发送内容可能包含：简历文本、页面 URL、页面标题、字段标签、选项和上下文文本
- 项目默认不会自动提交表单

如果你不希望任何简历内容离开本地，就不要配置在线模型接口。

## 🛠️ 适合怎么继续演进

如果你准备把这个项目继续开源维护，后续最值得做的方向大概是：

- 增加更多招聘站点和控件适配样例
- 补一套可复现的端到端联调脚本
- 把模板模块和主流程的关系进一步梳理清楚
- 增加英文 README 或双语文档

## 🤝 贡献

欢迎提 Issue 和 PR。

如果你要反馈某个站点无法填写，最好同时提供：

- 目标站点页面类型
- 失败字段示例
- 侧边栏关键日志
- `debug-logs/` 导出的诊断文件

这样更容易定位问题。

## 📮 联系方式

如果你想直接交流使用问题、反馈兼容性案例，或者讨论合作，可以扫码联系我：

<p align="center">
  <img src="dbf0e3aad4a61c39dd6d22c06c7f415a.jpg" alt="微信二维码" width="260" />
</p>

## 📄 License

[GPL-3.0](LICENSE)
