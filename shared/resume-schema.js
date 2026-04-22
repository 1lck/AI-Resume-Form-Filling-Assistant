(function () {
  "use strict";

  if (window.ResumeSchema) return;

  const SELECT_ALIAS_GROUPS = [
    { values: ["男", "male", "man", "m"] },
    { values: ["女", "female", "woman", "f"] },
    { values: ["非二元", "nonbinary", "non-binary"] },
    { values: ["不方便透露", "prefernottosay", "notspecified"] },
    { values: ["未婚", "single"] },
    { values: ["已婚", "married"] },
    { values: ["高中", "highschool"] },
    { values: ["大专", "associate"] },
    { values: ["本科", "bachelor", "undergraduate"] },
    { values: ["硕士", "master", "masters"] },
    { values: ["mba"] },
    { values: ["博士", "phd", "doctorate"] },
    { values: ["其他", "other"] },
    { values: ["全职", "fulltime", "full-time"] },
    { values: ["兼职", "parttime", "part-time"] },
    { values: ["实习", "internship", "intern"] },
    { values: ["合同", "contract", "contractor"] },
    { values: ["自由职业", "freelance"] },
    { values: ["是", "yes", "true", "1"] },
    { values: ["否", "no", "false", "0"] },
    { values: ["现场办公", "onsite", "on-site"] },
    { values: ["混合办公", "hybrid"] },
    { values: ["远程办公", "remote"] },
    { values: ["灵活", "flexible"] },
    { values: ["已毕业", "graduated"] },
    { values: ["预计毕业", "expected"] },
    { values: ["在读", "enrolled", "current"] },
    { values: ["肄业", "dropped"] },
    { values: ["身份证", "identitycard", "idcard"] },
    { values: ["护照", "passport"] },
    { values: ["居留许可", "residencepermit"] },
    { values: ["大学专科", "associate"] },
    { values: ["大学本科", "bachelor", "undergraduate"] },
    { values: ["硕士研究生", "master", "masters"] },
    { values: ["博士研究生", "phd", "doctorate"] },
    { values: ["博士后", "phd", "doctorate"] },
    { values: ["统招全日制", "regularfulltime", "fulltimedegree"] },
    { values: ["全日制", "regularfulltime", "fulltimedegree"] },
    { values: ["全国普通高等院校全日制", "regularfulltime", "fulltimedegree"] },
    { values: ["非统招", "非全日制", "parttimedegree", "nonfulltime"] },
    { values: ["全国普通高等院校非全日制", "parttimedegree", "nonfulltime"] },
    { values: ["统招", "regularfulltime", "fulltimedegree"] },
    { values: ["海外留学", "overseasstudy", "studyabroad"] },
    { values: ["联合培养", "jointprogram", "jointtraining"] },
    { values: ["委托培养", "commissionedtraining"] },
    { values: ["母语", "native"] },
    { values: ["流利", "fluent"] },
    { values: ["工作熟练", "professional", "business"] },
    { values: ["中等", "intermediate"] },
    { values: ["基础", "basic"] },
    { values: ["学生组织", "studentorganization"] },
    { values: ["社团", "club", "association"] },
    { values: ["志愿服务", "volunteer"] },
    { values: ["科研", "research"] },
    { values: ["竞赛", "competition", "contest"] },
  ];

  const SECTION_DEFINITIONS = [
    {
      key: "personal",
      label: "基本信息",
      type: "group",
      fields: [
        { key: "fullName", label: "姓名", input: "text", placeholder: "张三" },
        { key: "firstName", label: "名", input: "text", placeholder: "三" },
        { key: "middleName", label: "中间名", input: "text", placeholder: "可选" },
        { key: "lastName", label: "姓", input: "text", placeholder: "张" },
        { key: "preferredName", label: "常用名", input: "text", placeholder: "Sam" },
        { key: "englishName", label: "英文名", input: "text", placeholder: "Sam Zhang" },
        {
          key: "gender",
          label: "性别",
          input: "select",
          options: ["", "男", "女", "非二元", "不方便透露"],
        },
        { key: "birthDate", label: "出生日期", input: "date" },
        { key: "age", label: "年龄", input: "text", placeholder: "28" },
        { key: "email", label: "邮箱", input: "email", placeholder: "name@example.com" },
        { key: "alternateEmail", label: "备用邮箱", input: "email", placeholder: "name@outlook.com" },
        { key: "phoneCountryCode", label: "手机区号", input: "text", placeholder: "+86" },
        { key: "phoneNumber", label: "手机号码", input: "tel", placeholder: "13800138000" },
        { key: "alternatePhone", label: "备用电话", input: "tel", placeholder: "13900139000" },
        { key: "wechatId", label: "微信号", input: "text", placeholder: "wechat-id" },
        { key: "currentCity", label: "现居城市", input: "text", placeholder: "上海" },
        { key: "currentProvince", label: "现居省份/州", input: "text", placeholder: "上海" },
        { key: "currentCountry", label: "现居国家", input: "text", placeholder: "中国" },
        { key: "currentDistrict", label: "现居区县", input: "text", placeholder: "浦东新区" },
        { key: "nationality", label: "民族/国籍", input: "text", placeholder: "中国" },
        { key: "citizenship", label: "公民身份", input: "text", placeholder: "中国" },
        { key: "maritalStatus", label: "婚姻状况", input: "select", options: ["", "未婚", "已婚", "不方便透露"] },
        { key: "currentCompany", label: "当前公司", input: "text", placeholder: "某科技公司" },
        { key: "currentTitle", label: "当前职位", input: "text", placeholder: "软件工程师" },
        { key: "yearsOfExperience", label: "工作年限", input: "text", placeholder: "5" },
        { key: "yearsOfManagement", label: "管理经验年限", input: "text", placeholder: "2" },
        {
          key: "highestEducationLevel",
          label: "最高学历",
          input: "select",
          options: ["", "高中", "大专", "本科", "硕士", "MBA", "博士", "其他"],
        },
        {
          key: "summary",
          label: "个人简介",
          input: "textarea",
          placeholder: "适合用于招聘表单填写的简短自我介绍。",
        },
      ],
    },
    {
      key: "contactAndLocation",
      label: "联系方式与地址",
      type: "group",
      fields: [
        { key: "currentAddressLine1", label: "现居地址 1", input: "text", placeholder: "浦东新区世纪大道 1 号" },
        { key: "currentAddressLine2", label: "现居地址 2", input: "text", placeholder: "楼栋 / 单元 / 房间号" },
        { key: "postalCode", label: "邮政编码", input: "text", placeholder: "200120" },
        { key: "hometownCity", label: "籍贯城市", input: "text", placeholder: "南京" },
        { key: "hometownProvince", label: "籍贯省份/州", input: "text", placeholder: "江苏" },
        { key: "hukouLocation", label: "户口所在地", input: "text", placeholder: "江苏南京" },
        { key: "emergencyContactName", label: "紧急联系人姓名", input: "text", placeholder: "李四" },
        { key: "emergencyContactPhone", label: "紧急联系人电话", input: "tel", placeholder: "13700137000" },
        { key: "timezone", label: "当前时区", input: "text", placeholder: "Asia/Shanghai" },
      ],
    },
    {
      key: "identityAndAuthorization",
      label: "证件与资格",
      type: "group",
      fields: [
        { key: "personalIdType", label: "证件类型", input: "select", options: ["", "身份证", "护照", "居留许可", "其他"] },
        { key: "personalIdNumber", label: "证件号码", input: "text", placeholder: "按需填写" },
        { key: "passportName", label: "护照姓名", input: "text", placeholder: "ZHANG/SAN" },
        { key: "passportNumber", label: "护照号码", input: "text", placeholder: "E12345678" },
        { key: "passportExpiryDate", label: "护照到期日", input: "date" },
        { key: "politicalStatus", label: "政治面貌", input: "text", placeholder: "群众 / 中共党员 / 其他" },
        { key: "workAuthorization", label: "工作资格", input: "text", placeholder: "在中国合法工作，无限制" },
        { key: "visaStatus", label: "签证状态", input: "text", placeholder: "不适用" },
        { key: "sponsorshipNeeded", label: "是否需要签证担保", input: "select", options: ["", "是", "否"] },
        { key: "driversLicense", label: "是否持有驾照", input: "select", options: ["", "是", "否"] },
        { key: "securityClearance", label: "安全许可", input: "text", placeholder: "无 / 选填" },
      ],
    },
    {
      key: "onlinePresence",
      label: "在线资料",
      type: "group",
      fields: [
        { key: "linkedinUrl", label: "LinkedIn 链接", input: "url", placeholder: "https://linkedin.com/in/..." },
        { key: "githubUrl", label: "GitHub 链接", input: "url", placeholder: "https://github.com/..." },
        { key: "portfolioUrl", label: "作品集链接", input: "url", placeholder: "https://..." },
        { key: "websiteUrl", label: "个人网站", input: "url", placeholder: "https://..." },
        { key: "blogUrl", label: "博客链接", input: "url", placeholder: "https://blog.example.com" },
        { key: "leetcodeUrl", label: "LeetCode 链接", input: "url", placeholder: "https://leetcode.com/..." },
        { key: "otherProfileLinks", label: "其他主页链接", input: "textarea", placeholder: "知乎 / X / 哔哩哔哩 / Kaggle / Behance ..." },
      ],
    },
    {
      key: "jobPreferences",
      label: "求职偏好",
      type: "group",
      fields: [
        { key: "targetRole", label: "目标岗位", input: "text", placeholder: "高级后端工程师" },
        { key: "targetLevel", label: "目标职级", input: "text", placeholder: "高级 / 专家 / Leader" },
        { key: "targetDepartment", label: "目标部门", input: "text", placeholder: "技术 / 产品 / AI" },
        { key: "targetIndustry", label: "目标行业", input: "text", placeholder: "AI / SaaS / 电商" },
        { key: "expectedCity", label: "期望城市", input: "text", placeholder: "上海" },
        { key: "expectedCountry", label: "期望国家", input: "text", placeholder: "中国" },
        { key: "preferredLocations", label: "可接受工作地点", input: "textarea", placeholder: "上海、北京、杭州、远程" },
        { key: "expectedSalary", label: "期望薪资", input: "text", placeholder: "30k-40k / 月" },
        { key: "currentCompensation", label: "当前薪资", input: "text", placeholder: "保密" },
        { key: "noticePeriod", label: "到岗周期", input: "text", placeholder: "30 天" },
        { key: "availableDate", label: "可入职日期", input: "date" },
        {
          key: "employmentType",
          label: "期望用工类型",
          input: "select",
          options: ["", "全职", "兼职", "实习", "合同", "自由职业"],
        },
        {
          key: "willingToRelocate",
          label: "是否接受异地/搬迁",
          input: "select",
          options: ["", "是", "否"],
        },
        {
          key: "willingToTravel",
          label: "是否接受出差",
          input: "select",
          options: ["", "是", "否"],
        },
        {
          key: "remotePreference",
          label: "办公方式偏好",
          input: "select",
          options: ["", "现场办公", "混合办公", "远程办公", "灵活"],
        },
        {
          key: "preferredInterviewLanguage",
          label: "面试语言偏好",
          input: "text",
          placeholder: "中文 / 英文",
        },
        {
          key: "preferredStartTime",
          label: "理想入职时间",
          input: "text",
          placeholder: "立即 / 下月初",
        },
      ],
    },
    {
      key: "skills",
      label: "技能与亮点",
      type: "group",
      fields: [
        { key: "primarySkills", label: "核心技能", input: "textarea", placeholder: "分布式系统、系统设计、工程架构..." },
        { key: "programmingLanguages", label: "编程语言", input: "textarea", placeholder: "JavaScript、TypeScript、Python" },
        { key: "frameworks", label: "框架", input: "textarea", placeholder: "React、Node.js、FastAPI" },
        { key: "aiTools", label: "AI / 大模型工具", input: "textarea", placeholder: "OpenAI API、LangChain、RAG" },
        { key: "cloudPlatforms", label: "云平台", input: "textarea", placeholder: "AWS、阿里云、腾讯云、Azure" },
        { key: "databases", label: "数据库", input: "textarea", placeholder: "PostgreSQL、Redis、Elasticsearch" },
        { key: "tooling", label: "工程工具", input: "textarea", placeholder: "Docker、Kubernetes、GitHub Actions" },
        { key: "domainKnowledge", label: "行业经验", input: "textarea", placeholder: "金融、电商、教育、增长、AI..." },
        { key: "managementExperience", label: "管理经验", input: "textarea", placeholder: "团队规模、招聘、带教、跨团队协作" },
        { key: "softSkills", label: "软技能", input: "textarea", placeholder: "沟通、推动、协作、领导力" },
        { key: "notableAchievements", label: "代表性成绩", input: "textarea", placeholder: "最能体现能力和结果的数据化成绩" },
        { key: "interests", label: "兴趣爱好", input: "textarea", placeholder: "可选" },
      ],
    },
    {
      key: "educations",
      label: "教育经历",
      type: "list",
      initialItems: 1,
      slots: 4,
      itemLabel: "教育经历",
      note: "按照时间从近到远填写，不需要的条目留空。",
      fields: [
        { key: "school", label: "学校名称", input: "text", placeholder: "清华大学" },
        {
          key: "educationType",
          label: "学历类型",
          input: "select",
          options: ["", "统招全日制", "非统招", "海外留学", "其他"],
        },
        {
          key: "degree",
          label: "学历层次",
          input: "select",
          options: ["", "高中", "大专", "本科", "硕士", "MBA", "博士", "其他"],
        },
        {
          key: "studyMode",
          label: "培养方式",
          input: "select",
          options: ["", "统招", "非统招", "联合培养", "委托培养", "其他"],
        },
        { key: "major", label: "专业", input: "text", placeholder: "计算机科学与技术" },
        { key: "minor", label: "辅修专业", input: "text", placeholder: "数学" },
        { key: "faculty", label: "院系", input: "text", placeholder: "计算机学院" },
        { key: "className", label: "班级", input: "text", placeholder: "计算机 2101 班" },
        { key: "studentId", label: "学号", input: "text", placeholder: "20231234" },
        { key: "academicSystem", label: "学制", input: "text", placeholder: "4" },
        { key: "city", label: "所在城市", input: "text", placeholder: "北京" },
        { key: "country", label: "所在国家", input: "text", placeholder: "中国" },
        { key: "startDate", label: "开始时间", input: "date" },
        { key: "endDate", label: "结束时间", input: "date" },
        { key: "graduationStatus", label: "毕业状态", input: "select", options: ["", "已毕业", "预计毕业", "在读", "肄业"] },
        { key: "gpa", label: "GPA", input: "text", placeholder: "3.8/4.0" },
        { key: "ranking", label: "排名 / 荣誉", input: "text", placeholder: "前 10%" },
        { key: "laboratory", label: "实验室", input: "text", placeholder: "CAD&CG 国家重点实验室" },
        { key: "researchDirection", label: "领域方向", input: "text", placeholder: "AIGC / 多模态 / 推荐系统" },
        { key: "advisor", label: "导师", input: "text", placeholder: "王老师" },
        { key: "thesisTitle", label: "论文题目", input: "text", placeholder: "选填" },
        { key: "courses", label: "核心课程", input: "textarea", placeholder: "算法、操作系统、机器学习..." },
        { key: "description", label: "补充说明", input: "textarea", placeholder: "交换经历、荣誉、研究方向等" },
      ],
    },
    {
      key: "internships",
      label: "实习经历",
      type: "list",
      initialItems: 1,
      slots: 4,
      itemLabel: "实习经历",
      note: "校招场景里优先填写与目标岗位最相关的实习。",
      fields: [
        { key: "company", label: "公司名称", input: "text", placeholder: "字节跳动" },
        { key: "title", label: "职位名称", input: "text", placeholder: "后端开发实习生" },
        { key: "department", label: "所属部门", input: "text", placeholder: "推荐架构部" },
        { key: "city", label: "实习城市", input: "text", placeholder: "北京" },
        { key: "country", label: "实习国家", input: "text", placeholder: "中国" },
        { key: "startDate", label: "开始时间", input: "date" },
        { key: "endDate", label: "结束时间", input: "date" },
        {
          key: "isCurrent",
          label: "是否仍在实习",
          input: "select",
          options: ["", "是", "否"],
        },
        { key: "description", label: "描述", input: "textarea", placeholder: "岗位职责、项目内容、负责模块" },
        { key: "achievements", label: "成果", input: "textarea", placeholder: "量化结果、业务影响、关键交付" },
        { key: "technologies", label: "使用技术", input: "textarea", placeholder: "Java、Go、Redis、Kafka" },
      ],
    },
    {
      key: "workExperiences",
      label: "工作经历",
      type: "list",
      initialItems: 1,
      slots: 6,
      itemLabel: "工作经历",
      note: "按照时间从近到远填写，不需要的条目留空。",
      fields: [
        { key: "company", label: "公司名称", input: "text", placeholder: "某科技公司" },
        { key: "title", label: "职位名称", input: "text", placeholder: "软件工程师" },
        { key: "department", label: "所属部门", input: "text", placeholder: "平台研发部" },
        {
          key: "employmentType",
          label: "用工类型",
          input: "select",
          options: ["", "全职", "兼职", "实习", "合同", "自由职业"],
        },
        { key: "industry", label: "所在行业", input: "text", placeholder: "AI / SaaS / 电商" },
        { key: "city", label: "工作城市", input: "text", placeholder: "上海" },
        { key: "country", label: "工作国家", input: "text", placeholder: "中国" },
        { key: "startDate", label: "开始时间", input: "date" },
        { key: "endDate", label: "结束时间", input: "date" },
        {
          key: "isCurrent",
          label: "是否为当前工作",
          input: "select",
          options: ["", "是", "否"],
        },
        { key: "locationMode", label: "办公方式", input: "select", options: ["", "现场办公", "混合办公", "远程办公"] },
        { key: "teamSize", label: "团队规模", input: "text", placeholder: "8" },
        { key: "description", label: "工作职责", input: "textarea", placeholder: "主要负责的业务、系统和职责范围" },
        { key: "achievements", label: "工作成绩", input: "textarea", placeholder: "量化结果、业务影响、关键产出" },
        { key: "technologies", label: "使用技术", input: "textarea", placeholder: "TypeScript、React、PostgreSQL" },
      ],
    },
    {
      key: "projects",
      label: "项目经历",
      type: "list",
      initialItems: 1,
      slots: 5,
      itemLabel: "项目经历",
      note: "按照重要程度或时间顺序填写，不需要的条目留空。",
      fields: [
        { key: "name", label: "项目名称", input: "text", placeholder: "AI 简历填表助手" },
        { key: "role", label: "项目角色", input: "text", placeholder: "负责人 / 核心开发" },
        { key: "organization", label: "所属组织", input: "text", placeholder: "个人项目 / 公司项目" },
        { key: "url", label: "项目链接", input: "url", placeholder: "https://..." },
        { key: "repoUrl", label: "代码仓库链接", input: "url", placeholder: "https://github.com/..." },
        { key: "demoUrl", label: "演示链接", input: "url", placeholder: "https://..." },
        { key: "startDate", label: "开始时间", input: "date" },
        { key: "endDate", label: "结束时间", input: "date" },
        { key: "description", label: "项目说明", input: "textarea", placeholder: "项目做了什么，你负责了哪些部分" },
        { key: "highlights", label: "项目亮点", input: "textarea", placeholder: "效果、指标、架构亮点、难点突破" },
        { key: "technologies", label: "技术栈", input: "textarea", placeholder: "Chrome Extension、LLM、JavaScript" },
      ],
    },
    {
      key: "campusExperiences",
      label: "校园经历",
      type: "list",
      initialItems: 1,
      slots: 4,
      itemLabel: "校园经历",
      note: "适合学生组织、社团、志愿服务、科研助理等经历。",
      fields: [
        {
          key: "category",
          label: "经历类型",
          input: "select",
          options: ["", "学生组织", "社团", "志愿服务", "科研", "竞赛", "其他"],
        },
        { key: "organization", label: "组织名称", input: "text", placeholder: "浙江大学 ACM 协会" },
        { key: "role", label: "担任角色", input: "text", placeholder: "技术负责人" },
        { key: "startDate", label: "开始时间", input: "date" },
        { key: "endDate", label: "结束时间", input: "date" },
        {
          key: "isCurrent",
          label: "是否仍在参与",
          input: "select",
          options: ["", "是", "否"],
        },
        { key: "description", label: "描述", input: "textarea", placeholder: "职责、活动内容、覆盖范围" },
        { key: "achievements", label: "成果", input: "textarea", placeholder: "获奖、影响力、人数、结果" },
      ],
    },
    {
      key: "certificates",
      label: "证书与认证",
      type: "list",
      initialItems: 1,
      slots: 5,
      itemLabel: "证书与认证",
      note: "没有可以留空。",
      fields: [
        { key: "name", label: "证书名称", input: "text", placeholder: "AWS 认证解决方案架构师" },
        { key: "issuer", label: "颁发机构", input: "text", placeholder: "亚马逊云科技" },
        { key: "issueDate", label: "发证日期", input: "date" },
        { key: "expiryDate", label: "到期日期", input: "date" },
        { key: "score", label: "成绩 / 等级", input: "text", placeholder: "选填" },
        { key: "credentialId", label: "证书编号", input: "text", placeholder: "ABC-123" },
        { key: "credentialUrl", label: "证书链接", input: "url", placeholder: "https://..." },
      ],
    },
    {
      key: "languages",
      label: "语言能力",
      type: "list",
      initialItems: 1,
      slots: 5,
      itemLabel: "语言能力",
      note: "没有可以留空。",
      fields: [
        { key: "name", label: "语言", input: "text", placeholder: "英语" },
        {
          key: "proficiency",
          label: "熟练程度",
          input: "select",
          options: ["", "母语", "流利", "工作熟练", "中等", "基础"],
        },
        { key: "testScore", label: "语言成绩", input: "text", placeholder: "雅思 7.5 / 托福 105 / CET-6" },
      ],
    },
    {
      key: "additional",
      label: "补充信息",
      type: "group",
      fields: [
        { key: "awards", label: "奖项荣誉", input: "textarea", placeholder: "奖学金、竞赛获奖、优秀员工等" },
        { key: "publications", label: "论文发表", input: "textarea", placeholder: "论文标题、会议/期刊、年份等" },
        { key: "patents", label: "专利", input: "textarea", placeholder: "专利名称、编号、状态等" },
        { key: "volunteerExperience", label: "志愿者经历", input: "textarea", placeholder: "组织、职责、时长等" },
        { key: "competitions", label: "竞赛经历", input: "textarea", placeholder: "黑客松、ACM、Kaggle、数学建模等" },
        { key: "openSourceContributions", label: "开源贡献", input: "textarea", placeholder: "仓库、PR、维护经历等" },
        { key: "references", label: "推荐人信息", input: "textarea", placeholder: "如需可提供 / 联系方式等" },
        { key: "coverLetterHighlights", label: "求职信要点", input: "textarea", placeholder: "可复用的自我介绍、求职动机、匹配亮点" },
        { key: "customNotes", label: "其他备注", input: "textarea", placeholder: "表单里经常会问到的其它信息" },
      ],
    },
  ];

  const FIELD_VALUE_ALIASES = {
    personal: {
      birthDate: ["birthday", "birth", "dob", "birthMonth", "birthYearMonth", "出生年月"],
    },
    contactAndLocation: {
      hometownCity: ["hometown", "nativePlace", "birthPlace", "籍贯"],
      hometownProvince: ["hometown", "nativePlace", "birthPlace", "籍贯"],
    },
    identityAndAuthorization: {
      personalIdNumber: ["idNumber", "idCardNumber", "identityCardNumber", "certificateNum", "身份证号"],
      personalIdType: ["idType", "certificateType"],
    },
    jobPreferences: {
      expectedSalary: ["expectedMonthlySalary", "expectedMonthSalary", "monthlySalary", "salaryExpectation", "期望月薪"],
    },
    educations: {
      educationType: ["educationCategory", "educationNature", "学历类型"],
      studyMode: ["learningModality", "learningMode", "培养方式", "学习形式"],
      faculty: ["college", "institute", "instituteName", "院系名称"],
      academicSystem: ["schoolSystem", "学制"],
      researchDirection: ["researchDire", "direction", "研究方向"],
      advisor: ["tutor", "mentor", "导师"],
      laboratory: ["lab", "laboratoryName", "library", "所在实验室"],
      studentId: ["stuNo", "studentNo", "schoolNumber", "学号"],
      degree: ["educationCode", "educationLevel", "学历"],
      startDate: ["start", "beginDate", "beginTime", "startTime", "入学时间"],
      endDate: ["end", "finishDate", "finishTime", "endTime", "graduationDate", "graduateDate", "毕业时间"],
    },
    internships: {
      startDate: ["start", "beginDate", "beginTime", "startTime"],
      endDate: ["end", "finishDate", "finishTime", "endTime"],
    },
    workExperiences: {
      startDate: ["start", "beginDate", "beginTime", "startTime"],
      endDate: ["end", "finishDate", "finishTime", "endTime"],
    },
    projects: {
      startDate: ["start", "beginDate", "beginTime", "startTime"],
      endDate: ["end", "finishDate", "finishTime", "endTime"],
    },
    campusExperiences: {
      startDate: ["start", "beginDate", "beginTime", "startTime"],
      endDate: ["end", "finishDate", "finishTime", "endTime"],
    },
  };

  const DATE_RANGE_SOURCE_KEYS = ["dateRange", "timeRange", "duration", "period", "dates"];

  function buildEmptyObjectFromFields(fields) {
    const out = {};
    for (const field of fields) {
      out[field.key] = "";
    }
    return out;
  }

  function getSectionDefinition(sectionKey) {
    return SECTION_DEFINITIONS.find((section) => section.key === sectionKey) || null;
  }

  function getListSectionMaxItems(sectionOrKey) {
    const section =
      typeof sectionOrKey === "string"
        ? getSectionDefinition(sectionOrKey)
        : sectionOrKey;

    if (!section || section.type !== "list") return 0;
    return Math.max(1, Number(section.slots) || 1);
  }

  function getListSectionInitialItems(sectionOrKey) {
    const section =
      typeof sectionOrKey === "string"
        ? getSectionDefinition(sectionOrKey)
        : sectionOrKey;
    const maxItems = getListSectionMaxItems(section);
    const initialItems = Math.max(1, Number(section?.initialItems) || 1);
    return Math.min(maxItems, initialItems);
  }

  function createEmptyListItem(sectionKey) {
    const section = getSectionDefinition(sectionKey);
    if (!section || section.type !== "list") return {};
    return buildEmptyObjectFromFields(section.fields);
  }

  function createEmptyResumeProfile(options = {}) {
    const mode = options.mode === "max" ? "max" : "initial";
    const profile = {};

    for (const section of SECTION_DEFINITIONS) {
      if (section.type === "group") {
        profile[section.key] = buildEmptyObjectFromFields(section.fields);
        continue;
      }

      const itemCount =
        mode === "max"
          ? getListSectionMaxItems(section)
          : getListSectionInitialItems(section);

      profile[section.key] = [];
      for (let index = 0; index < itemCount; index += 1) {
        profile[section.key].push(createEmptyListItem(section.key));
      }
    }

    return profile;
  }

  function clone(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function getValueByPath(obj, path) {
    const segments = String(path || "").split(".").filter(Boolean);
    let current = obj;
    for (const segment of segments) {
      if (current == null) return "";
      current = current[segment];
    }
    return current == null ? "" : current;
  }

  function setValueByPath(obj, path, rawValue) {
    const segments = String(path || "").split(".").filter(Boolean);
    if (segments.length === 0) return;

    let current = obj;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const isLast = index === segments.length - 1;

      if (isLast) {
        current[segment] = rawValue;
        return;
      }

      if (current[segment] == null) {
        current[segment] = /^\d+$/.test(segments[index + 1]) ? [] : {};
      }

      current = current[segment];
    }
  }

  function normalizeFieldValue(field, value) {
    if (field?.input === "select") {
      return normalizeSelectValue(field.options || [], value);
    }

    if (field?.input === "date") {
      return normalizeDateValue(value);
    }

    if (value == null) return "";

    if (typeof value === "string") {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }

    if (typeof value === "boolean") {
      return value ? "是" : "否";
    }

    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value).trim();
  }

  function normalizeDateValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const normalized = text
      .replace(/\s+/g, "")
      .replace(/[/.]/g, "-")
      .replace(/年/g, "-")
      .replace(/月/g, "-")
      .replace(/日/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    let match = normalized.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, "0");
      const day = match[3] ? match[3].padStart(2, "0") : "";
      return day ? `${year}-${month}-${day}` : `${year}-${month}`;
    }

    match = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }

    match = normalized.match(/^(\d{4})(\d{2})$/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }

    return text;
  }

  function normalizeSelectValue(options, value) {
    const text = String(value || "").trim();
    if (!text) return "";

    if (options.includes(text)) return text;

    const normalizedInput = normalizeForMatch(text);
    const inputVariants = expandSelectVariants(text);
    let best = "";

    for (const option of options) {
      if (!option) continue;
      const normalizedOption = normalizeForMatch(option);
      const optionVariants = expandSelectVariants(option);
      if (!normalizedOption) continue;
      if (normalizedOption === normalizedInput) return option;
      if (optionVariants.some((item) => inputVariants.includes(item))) return option;
      if (!best && (normalizedOption.includes(normalizedInput) || normalizedInput.includes(normalizedOption))) {
        best = option;
      }
    }

    return best;
  }

  function normalizeForMatch(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/['"`’‘”“]/g, "")
      .replace(/[()（）[\]【】{}<>]/g, "")
      .replace(/[.,，/\\\-_:：;+]/g, "");
  }

  function expandSelectVariants(value) {
    const normalized = normalizeForMatch(value);
    const variants = new Set([normalized]);

    for (const group of SELECT_ALIAS_GROUPS) {
      if (group.values.includes(normalized)) {
        group.values.forEach((item) => variants.add(item));
      }
    }

    return Array.from(variants);
  }

  function hasRawValue(value) {
    return !(value == null || value === "");
  }

  function getFieldAliases(sectionKey, fieldKey) {
    return FIELD_VALUE_ALIASES[sectionKey]?.[fieldKey] || [];
  }

  function extractDateRangeValue(rawSource, fieldKey) {
    if (fieldKey !== "startDate" && fieldKey !== "endDate") {
      return "";
    }

    for (const sourceKey of DATE_RANGE_SOURCE_KEYS) {
      const rawValue = rawSource?.[sourceKey];
      if (!hasRawValue(rawValue)) continue;

      const matches = String(rawValue)
        .match(/\d{4}(?:[-./年]\d{1,2})?(?:[-./月]\d{1,2}日?)?/g)
        ?.map((item) => normalizeDateValue(item))
        .filter(Boolean);

      if (!matches?.length) continue;
      if (fieldKey === "startDate") return matches[0] || "";
      return matches[1] || matches[0] || "";
    }

    return "";
  }

  function pickRawFieldValue(rawSource, sectionKey, fieldKey) {
    if (!rawSource || typeof rawSource !== "object") return "";

    if (hasRawValue(rawSource[fieldKey])) {
      return rawSource[fieldKey];
    }

    for (const alias of getFieldAliases(sectionKey, fieldKey)) {
      if (hasRawValue(rawSource[alias])) {
        return rawSource[alias];
      }
    }

    return extractDateRangeValue(rawSource, fieldKey);
  }

  function extractBirthDateFromPersonalId(idNumber) {
    const normalized = String(idNumber || "").trim().toUpperCase();
    let match = normalized.match(/^(\d{6})(\d{4})(\d{2})(\d{2})(\d{3}[\dX])$/);
    if (match) {
      return `${match[2]}-${match[3]}-${match[4]}`;
    }

    match = normalized.match(/^(\d{6})(\d{2})(\d{2})(\d{2})(\d{3})$/);
    if (match) {
      return `19${match[2]}-${match[3]}-${match[4]}`;
    }

    return "";
  }

  function applyDerivedProfileValues(profile) {
    if (!profile.personal.birthDate) {
      profile.personal.birthDate = extractBirthDateFromPersonalId(
        profile.identityAndAuthorization.personalIdNumber
      );
    }

    if (
      !profile.identityAndAuthorization.personalIdType &&
      profile.identityAndAuthorization.personalIdNumber
    ) {
      profile.identityAndAuthorization.personalIdType = "身份证";
    }
  }

  function normalizeResumeProfile(input) {
    const source = input && typeof input === "object" ? input : {};
    const profile = createEmptyResumeProfile();

    for (const section of SECTION_DEFINITIONS) {
      if (section.type === "group") {
        const rawGroup =
          source[section.key] && typeof source[section.key] === "object"
            ? source[section.key]
            : {};

        for (const field of section.fields) {
          const rawValue = pickRawFieldValue(rawGroup, section.key, field.key);
          if (rawValue == null || rawValue === "") continue;
          profile[section.key][field.key] = normalizeFieldValue(field, rawValue);
        }
        continue;
      }

      const rawList = Array.isArray(source[section.key])
        ? source[section.key].slice(0, getListSectionMaxItems(section))
        : [];
      const rawCount = rawList.length;
      let meaningfulCount = 0;

      for (let index = 0; index < rawList.length; index += 1) {
        if (isMeaningfulValue(rawList[index])) {
          meaningfulCount = index + 1;
        }
      }

      let itemCount = getListSectionInitialItems(section);
      if (rawCount > 0) {
        itemCount =
          rawCount === getListSectionMaxItems(section) && meaningfulCount < rawCount
            ? Math.max(getListSectionInitialItems(section), meaningfulCount)
            : Math.max(getListSectionInitialItems(section), rawCount, meaningfulCount);
      }

      profile[section.key] = [];

      for (let index = 0; index < itemCount; index += 1) {
        const rawItem =
          rawList[index] && typeof rawList[index] === "object" ? rawList[index] : {};
        const normalizedItem = createEmptyListItem(section.key);

        for (const field of section.fields) {
          const rawValue = pickRawFieldValue(rawItem, section.key, field.key);
          if (rawValue == null || rawValue === "") continue;
          normalizedItem[field.key] = normalizeFieldValue(field, rawValue);
        }

        profile[section.key].push(normalizedItem);
      }
    }

    applyDerivedProfileValues(profile);
    return profile;
  }

  function getFieldCatalog(options = {}) {
    const fields = [];
    const mode = options.mode || "max";
    const profile = options.profile || null;

    for (const section of SECTION_DEFINITIONS) {
      if (section.type === "group") {
        for (const field of section.fields) {
          fields.push({
            path: `${section.key}.${field.key}`,
            sectionKey: section.key,
            sectionLabel: section.label,
            label: field.label,
            input: field.input,
            placeholder: field.placeholder || "",
            options: field.options || [],
          });
        }
        continue;
      }

      const slotCount =
        mode === "initial"
          ? getListSectionInitialItems(section)
          : mode === "profile"
          ? Math.min(
              getListSectionMaxItems(section),
              Math.max(
                getListSectionInitialItems(section),
                Array.isArray(profile?.[section.key]) ? profile[section.key].length : 0
              )
            )
          : getListSectionMaxItems(section);

      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        for (const field of section.fields) {
          fields.push({
            path: `${section.key}.${slotIndex}.${field.key}`,
            sectionKey: section.key,
            sectionLabel: section.label,
            slotIndex,
            itemLabel: `${section.itemLabel} ${slotIndex + 1}`,
            label: `${section.itemLabel} ${slotIndex + 1} / ${field.label}`,
            input: field.input,
            placeholder: field.placeholder || "",
            options: field.options || [],
          });
        }
      }
    }

    return fields;
  }

  function isMeaningfulValue(value) {
    if (value == null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return true;
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.some((item) => isMeaningfulValue(item));
    if (typeof value === "object") return Object.values(value).some((item) => isMeaningfulValue(item));
    return false;
  }

  function getCatalogWithValues(profile) {
    return getFieldCatalog({ mode: "profile", profile }).map((field) => {
      const value = getValueByPath(profile, field.path);
      return {
        ...field,
        value,
        hasValue: isMeaningfulValue(value),
        valuePreview: createValuePreview(value),
      };
    });
  }

  function createValuePreview(value) {
    const text = normalizeFieldValue({}, value);
    if (!text) return "";
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  function hasAnyFilledField(profile) {
    return getCatalogWithValues(profile).some((field) => field.hasValue);
  }

  function createImportTemplateString() {
    return JSON.stringify(createEmptyResumeProfile({ mode: "max" }), null, 2);
  }

  window.ResumeSchema = {
    version: 4,
    sections: SECTION_DEFINITIONS,
    clone,
    getSectionDefinition,
    createEmptyListItem,
    createEmptyResumeProfile,
    normalizeResumeProfile,
    getFieldCatalog,
    getCatalogWithValues,
    getValueByPath,
    setValueByPath,
    hasAnyFilledField,
    createImportTemplateString,
  };
})();
