---
title: 定时任务
description: 按 cron 计划运行新的 Agent，或用 heartbeat 唤醒已有的 Agent。
nav: 概览
---

# 定时任务 {#schedules}

定时任务按 cron 节奏为你启动一个新的 Agent：在这个时间，在这个仓库里，用这些 Agent 设置运行这段提示词。

Paseo 还有 **heartbeat**。heartbeat 会定期向一个已有的 Agent 发送提示词，让它重新评估并继续同一段对话。

两者使用同一个 cron 引擎，但在产品中是分开的：

- **定时任务**每次运行都会创建一个新的 Agent。你可以查看、暂停、恢复、运行一次、更新或删除它们。
- **heartbeat** 针对一个已有的 Agent，刻意保持轻量：通过 MCP 创建或删除；在 CLI 中还可以只更新它们的 cron 周期。

cron 是标准的节奏表示。CLI 接受 `5m` 或 `1h` 这样的简单预设，但会把它们编译成 cron，而不是另存一种间隔类型。

两者都按你设定的节奏运行。如果想由外部事件（比如一条评论或一次提及）启动 Agent，请参见 [Hub](/docs/hub)。

## 用途 {#what-its-for}

- **全新的周期性任务**：为每日分拣、报告或维护启动一个干净的 Agent。
- **heartbeat**：让当前 Agent 定期重新评估状态并继续推进。
- **盯构建**：让一个 Agent 持续检查 CI、EAS、Docker 或发布构建，直到通过。
- **每日分拣**：每天早上扫描 issue、PR 和失败的检查。
- **维护巡检**：更新依赖、审核文档或清理过期分支。

## 创建方式 {#ways-to-create-one}

- **在应用中**：打开定时任务视图，设置 Agent、cron 节奏、仓库和提示词来创建。这是创建和管理定时任务的主要方式。
- **[在聊天中](/docs/schedules-chat)**：在聊天中告诉 Agent，它会为你创建定时任务。
- **[通过 CLI](/docs/schedules-cli)**：`paseo schedule create`，适用于无界面的机器和脚本。
- **[通过 MCP](/docs/mcp)**：Agent 以编程方式创建和管理定时任务。
