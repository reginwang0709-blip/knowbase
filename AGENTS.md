# AGENTS.md

你正在开发 KnowBase，一个单链接输入的个人知识提取与知识管理 Web 产品。

## 1. 项目总原则

KnowBase 的最终目标不是“逐字稿生成工具”，而是：

一个链接进去，系统自动生成结构化知识包，并沉淀进可搜索、可归档、可回看的个人知识库。

技术实现可以分阶段降级，但产品动线、页面结构和信息架构必须始终服务于终版产品方向。

KnowBase 的知识库分类不是固定预设模板，而是由用户内容动态聚合生成。mock data 只能作为“动态生成结构的示例”，不能被理解为系统内置固定分类。

## 2. 文档读取顺序

开发前按以下顺序读取：

1. docs/product/final-product-spec.md
2. docs/product/information-architecture.md
3. docs/product/dynamic-archive-principles.md
4. docs/contracts/data-contracts.md
5. docs/roadmap/phases.md
6. docs/tasks/current-task.md

如果文档之间有冲突，优先级为：

AGENTS.md > final-product-spec.md > information-architecture.md > dynamic-archive-principles.md > data-contracts.md > current-task.md > 当前代码实现。

## 3. 工作方式

- 每次只执行用户明确指定的任务。
- 不要一次性实现完整产品。
- 不要擅自新增当前任务之外的功能。
- 不要因为当前使用 mock data，就改变终版产品动线。
- 不要把 mock 页面做成一次性 demo。
- 修改代码前，先说明计划修改的文件和修改思路。
- 大改页面前，先等待用户确认。
- 用户指出页面方向不对时，优先回到产品文档对齐，而不是直接局部修补。
- 如果需求不明确，先列出假设和风险，不要自行扩大范围。

## 4. 前端与 UI 规则

- 用户可见 UI 文案使用中文。
- 代码变量名、文件名、组件名、路由名使用英文。
- 页面风格：简洁、现代、偏知识管理工具。
- 不要做成普通 SaaS 后台。
- 不要做成普通内容列表。
- 知识库页必须体现“内容被归档、聚合和沉淀”的感觉。
- 知识库页展示分类时，需要表达“系统根据已解析内容自动聚合出知识结构”，不要表现为固定分类模板。
- 知识包页必须体现“结构化知识结果”，不能只是逐字稿展示页。
- 首页必须体现“提交任务 + 掌控处理进度”。

## 5. 代码规则

- 使用 Next.js App Router。
- 使用 TypeScript。
- 使用 Tailwind CSS。
- 页面不要直接写死业务内容，应从数据文件、mock data 或后续 API 返回结构中读取。
- mock data 建议放在 src/lib/mock-data.ts。
- 不要引入大型依赖，除非当前任务明确要求。
- 不要提前设计复杂状态管理库。
- 不要暴露 API Key 或敏感配置到前端代码。

## 6. 范围控制规则

具体禁止事项由 docs/tasks/current-task.md 决定。

如果 current-task.md 没有明确要求，不要主动实现以下类型能力：

- 真实第三方 API 接入
- 数据库真实连接
- 用户登录
- 后台队列
- ASR 转写
- LLM 调用
- 多视图切换
- 图谱、批注、高亮、导出等高级功能

只有当用户明确进入对应任务或阶段时，才可以实现这些能力。

## 7. 运行与检查

本地运行：

npm install
npm run dev

本地预览地址：

http://localhost:3000

修改完成后，根据项目已有脚本运行：

npm run lint
npm run build

如果项目存在 typecheck 脚本，也运行：

npm run typecheck

如果检查失败，修复到通过。

## 8. 交付要求

每次完成修改后，输出：

1. 修改了哪些文件
2. 实现了哪些内容
3. 当前任务哪些要求已满足
4. 是否有未完成或需要用户确认的点
5. 本地运行命令
