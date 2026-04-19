# Current Task

## 任务名称

为知识库页 `/library` 增加表格视图和思维导图视图。

## 任务背景

KnowBase 的知识库页终版会支持多种视图：

1. 知识领域视图
2. 表格视图
3. 思维导图视图
4. 图谱视图

其中：

* 知识领域视图用于浏览动态归档后的知识结构。
* 表格视图用于快速检索、筛选和管理内容。
* 思维导图视图用于展示层级结构：知识领域 → 二级主题 → 内容。
* 图谱视图用于展示内容节点，并通过关键词筛选内容之间的关系。

当前任务实现三个可用视图：

1. 知识领域
2. 表格视图
3. 思维导图

当前任务不要实现图谱视图。

注意：图谱视图后续要做，它的逻辑是“内容节点 + 关键词筛选”，不是普通装饰性网状图。

## 核心原则

所有视图必须来自同一份知识库数据。

不要为表格视图单独 hardcode 一组 tableRows。
不要为思维导图单独 hardcode 一组 mindMapNodes。
不要在 JSX 里写死具体内容标题、领域名称、主题名称。

请从现有数据结构推导：

* `libraryCategories`
* `libraryCategories[].topics`
* `topics[].contents`

通过映射函数生成不同视图需要的数据。

## 修改范围

允许修改：

* `src/app/library/page.tsx`
* 如有必要，可以少量修改 `src/lib/mock-data.ts`

建议优先在 `src/app/library/page.tsx` 内部新增纯函数：

* `buildTableRows(libraryCategories)`
* `buildMindMapTree(libraryCategories)`

如果逻辑较多，也可以在 `src/lib/mock-data.ts` 或新建轻量 util 中处理，但不要引入大型依赖。

不要修改：

* 首页 `/`
* 知识包页 `/content/[id]`
* 全局样式
* docs 其他文件
* package.json
* 真实 API
* Supabase
* ASR
* LLM
* 登录
* 图谱视图
* 批注
* 导出

## 视图切换

在 `/library` 页面增加视图切换控件。

视图切换项：

* 知识领域
* 表格视图
* 思维导图

默认进入 `/library` 时显示：

* 知识领域

视图切换控件样式：

* 轻量 segmented control / tab
* 当前视图高亮
* 放在搜索区域附近或页面标题区下方
* 不要做成重型导航

## 知识领域视图

保持当前已完成的知识领域视图，不要重构它。

该视图继续使用：

* `libraryCategories`
* `recentTopics`
* `recentContents`

本任务不要重新设计知识领域视图，只在必要时让它适配视图切换。

## 表格视图

表格视图用于快速管理和检索知识包。

表格数据必须从 `libraryCategories` 逻辑推导。

映射逻辑：

遍历：

`libraryCategories → topics → contents`

将每条 content 映射为一行。

每行至少包含：

* content id
* 标题
* 来源平台
* 作者
* 所属领域，也就是 category.name
* 所属主题，也就是 topic.name
* Top 关键词
* 解析时间
* 操作

表格列建议：

1. 标题
2. 来源
3. 作者
4. 所属领域
5. 所属主题
6. Top 关键词
7. 解析时间
8. 操作

操作：

* `查看知识包`
* 点击跳转 `/content/demo-001`

注意：当前阶段可以统一跳转 `/content/demo-001`，不要为了表格视图扩充多个内容详情页。

## 思维导图视图

思维导图视图用于展示层级结构：

```text
我的知识库
  └── 知识领域
        └── 二级主题
              └── 内容
```

当前不引入真实 mind map 库，不做复杂拖拽和缩放。

请用纯前端布局模拟思维导图：

* 左侧或顶部是根节点：`我的知识库`
* 第二层是知识领域节点
* 第三层是二级主题节点
* 第四层是内容节点

视觉要求：

* 节点用卡片 / pill / rounded box 展示
* 层级之间用缩进、连接线、边框或 flex/grid 表达
* 不要只做普通列表，要让用户感觉这是结构图
* 不要引入大型依赖
* 不要做拖拽、缩放、画布

思维导图数据必须从 `libraryCategories` 推导。

映射逻辑：

`buildMindMapTree(libraryCategories)` 返回类似结构：

```ts
{
  id: "root",
  label: "我的知识库",
  children: [
    {
      id: category.id,
      label: category.name,
      type: "category",
      children: [
        {
          id: topic.id,
          label: topic.name,
          type: "topic",
          children: topic.contents.map(...)
        }
      ]
    }
  ]
}
```

内容节点点击后跳转到 `/content/demo-001`。

## 搜索与筛选复用

如果当前页面已有搜索框，请三个视图共用同一个搜索状态。

搜索范围至少包括：

* 标题
* 所属领域
* 所属主题
* 关键词
* 作者

如果当前页面已有最近关注主题筛选，三个视图也应响应该筛选。

不要为每个视图单独写一套搜索逻辑。

建议实现统一过滤函数：

* `filterLibraryCategories(libraryCategories, query, activeTopic)`

然后三个视图都基于过滤后的数据渲染。

## 空状态

如果搜索或筛选后没有结果：

* 知识领域视图显示已有空状态
* 表格视图显示：`没有找到匹配的内容`
* 思维导图视图显示：`没有可展示的知识结构`

## 禁止事项

不要实现：

* 图谱视图
* 内容节点图谱
* 关键词筛选图谱
* 真实 API
* Supabase
* 登录
* 批量编辑
* 删除内容
* 导出
* 拖拽思维导图
* 缩放画布
* 第三方大型 mind map 库

当前只做数据驱动的表格视图和轻量思维导图视图。

## 执行方式

请先读取：

* `AGENTS.md`
* `docs/product/final-product-spec.md`
* `docs/product/information-architecture.md`
* `docs/product/dynamic-archive-principles.md`
* `docs/contracts/data-contracts.md`
* `docs/tasks/current-task.md`

然后先输出：

1. 当前 `/library` 页面已有结构
2. 当前数据结构是否足够映射表格视图
3. 当前数据结构是否足够映射思维导图视图
4. 需要修改哪些文件
5. 视图切换方案
6. 表格数据映射方案
7. 思维导图数据映射方案
8. 搜索和筛选如何复用
9. 不会修改哪些文件

在用户确认前，不要改代码。
