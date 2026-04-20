当前已实现：
- Next.js 前端页面：首页、知识包页、知识库页
- Next.js API Routes：parse task、library、content detail、delete content
- Supabase PostgreSQL：parse_tasks、contents、library_categories、library_topics、content_topic_assignments
- 数据持久化：提交链接后写入数据库，刷新后仍可读取
- 去重逻辑：同一 URL 不重复生成 content
- 删除逻辑：支持单篇知识包删除
- Fallback：API 失败或空库时保留 demo 展示
- 当前限制：暂未接 LLM、ASR 和真实正文解析，结构化知识包仍使用 mock payload
