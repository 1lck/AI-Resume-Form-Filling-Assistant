# Date Picker Support Design

## Goal

为 `AI-Resume-Form-Filling-Assistant` 增加日期字段自动填写能力，覆盖两类场景：

- 原生日期输入：`input[type="date"|"month"|"datetime-local"]`
- 常见前端日期面板组件：可输入或需点开面板选择年月日的日期控件

本次只做单值日期/年月，不包含日期范围、纯年份、纯时间范围等扩展场景。

## Current State

当前 [content.js](/Users/apple/Documents/Git_Project/AI-Resume-Form-Filling-Assistant/.worktrees/date-picker-support/content.js) 会把大多数 `input` 统一识别为 `text`，并在 `fillOne()` 中通过 `setValueWithEvents()` 直接写 `.value`。这对原生日期输入有时有效，但对依赖框架内部状态、键盘确认或面板点击的日期控件不可靠。

## Requirements

- 保持现有非日期字段行为不变
- 自动识别日期类字段，而不是要求站点定制
- 优先支持出生日期、出生年月、开始日期、结束日期等常见简历字段
- AI 输出仍保持字符串，不引入复杂对象结构
- 填充结果必须做回读校验，失败时返回明确原因

## Proposed Design

### 1. Introduce `date_like` fields

扫描阶段为疑似日期字段构建更丰富的元信息：

- `field.kind = "date_like"`
- `runtime.dateMode = "date" | "month" | "datetime-local"`
- `runtime.inputType`
- `runtime.hints`: 来自 `label/name/id/placeholder/class` 的日期线索
- `runtime.framework`: 可能的组件类型，例如 `native`、`ant`、`element`、`mui`、`flatpickr`、`generic`

强命中条件：

- `input[type="date"|"month"|"datetime-local"]`

弱命中条件：

- 标签、占位符、`name`、`id` 命中 `生日`、`出生日期`、`出生年月`、`date`、`month`、`dob`、`birthday`
- 祖先节点类名/属性命中 `ant-picker`、`el-date-editor`、`el-picker`、`datepicker`、`calendar`、`flatpickr`、`Mui`

### 2. Normalize date values before fill

新增日期值标准化逻辑，将 AI 或记忆库返回的字符串统一整理为目标格式：

- `date` => `YYYY-MM-DD`
- `month` => `YYYY-MM`
- `datetime-local` => `YYYY-MM-DDTHH:mm`

标准化失败时直接返回错误，避免把自然语言原样写入日期组件。

同时更新 [background.js](/Users/apple/Documents/Git_Project/AI-Resume-Form-Filling-Assistant/.worktrees/date-picker-support/background.js) 中 `form_fill` 提示词，明确要求日期字段输出标准化格式字符串。

### 3. Multi-strategy date fill pipeline

为 `date_like` 字段新增 `fillDateLikeField(runtime, value)`，按顺序执行：

1. 原生写入
   - 直接用原生 setter 写标准值
   - 派发 `input`、`change`、`blur`
   - 回读当前值验证
2. 可输入框架控件写入
   - `focus/click`
   - 全选清空
   - 写入标准字符串
   - 派发 `InputEvent`、`change`
   - 触发 `Enter` / `Tab`
   - 回读当前值验证
3. 面板点击回退
   - 打开控件
   - 找到关联日期面板
   - 按目标年月日点击对应单元格
   - 回读输入框/隐藏值验证
4. 失败返回
   - 若以上都失败，返回明确失败原因，不伪装成功

### 4. Verification strategy

新增轻量本地夹具页面，覆盖：

- 原生 `date`
- 原生 `month`
- 一个模拟的弹层日期组件

通过脚本化或页面内自检函数验证：

- 扫描阶段能识别为 `date_like`
- 填充阶段能得到标准值
- 面板回退在模拟组件上可用

## Out of Scope

- 日期范围选择器
- 只选年份
- 纯时间选择器
- 站点级定制适配表
- 保证所有第三方组件 100% 命中

## Risks

- 打包仓库缺少现成测试框架，验证主要依赖本地夹具与手动扩展加载
- 不同组件的弹层 DOM 差异大，第一版只能优先覆盖常见结构
- 自定义组件可能显示格式与提交格式不同，需要更严格回读校验

## Rollout Plan

1. 先接入原生日期输入支持并验证
2. 再补通用 `date_like` 识别与值标准化
3. 再增加面板点击回退与夹具验证
4. 最后手动加载扩展做端到端检查
