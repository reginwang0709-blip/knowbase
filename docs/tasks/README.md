# Tasks Directory

`current-task.md` 始终表示当前正在执行的任务。

每次开始新任务前，应先将当前任务复制到 `docs/tasks/history/` 下归档。

历史任务文件名建议格式：

`YYYY-MM-DD-short-task-name.md`

Codex 执行任务时优先读取 `current-task.md`。

历史任务只用于追溯，不作为当前执行依据。

覆盖 `current-task.md` 不会删除已经实现的代码功能。

如果旧任务没有提前归档，可以根据已实现功能重建简版历史记录。
