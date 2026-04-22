# Current Task

## 任务名称

Phase 3E：接入阿里云百炼 Fun-ASR 探针接口。

## 任务目标

当前已经能从小宇宙 episode URL 解析出 `audioUrl`。下一步先验证：

小宇宙 `audioUrl`
→ 阿里云 Fun-ASR
→ 返回转写文本
→ 转成 KnowBase 可用的 `transcriptBlocks`

当前只做 debug 探针，不接入主解析流程。

## 环境变量

使用：

* `DASHSCOPE_API_KEY`
* `DASHSCOPE_BASE_URL`，默认 `https://dashscope.aliyuncs.com/api/v1`

不要打印任何环境变量值。不要把 key 写进代码。

## 允许新增

* `src/lib/asr/dashscope-funasr.ts`
* `src/app/api/debug/asr/funasr/route.ts`

## 不要修改

* 首页
* 知识库页
* 知识包页
* `/api/parse-tasks` 主流程
* Supabase schema
* mock data
* 登录系统
* RLS
* LLM
* 图谱 API
* `.env.local`

## 实现边界

只做 ASR debug：

* 输入公网 audioUrl
* 提交 Fun-ASR 异步任务
* 查询任务状态
* 成功后获取 transcription_url
* 下载转写结果
* 转换为 transcriptBlocks

不要伪造 transcript。不要 fallback 到 demo transcript。

完成后请先输出实现计划，等用户确认后再写代码。
