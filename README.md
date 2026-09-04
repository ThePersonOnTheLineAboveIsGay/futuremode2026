# futuremode2026

Google Meet 風格的視訊會議系統，內建**即時 AI 助手**：透過 STT 聆聽對話、用 LLM 分析脈絡、在偵測到矛盾、離題、停滯或不合理請求時主動以提問方式介入，並透過 TTS 發聲。

## 技術棧

| 層 | 選擇 |
|---|---|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind + livekit-client |
| 後端 API | Fastify + TypeScript + Zod + Pino |
| WebRTC SFU | LiveKit OSS (v1.11+) |
| AI 服務 | OpenAI 相容 API（LLM + TTS 與 STT 可分開 endpoint） |
| AI Bot | Node.js + `@livekit/rtc-node`（server-side WebRTC） |
| Monorepo | pnpm workspaces |
| 部署 | Docker Compose 或直接執行（dev 不需 Docker） |

## 架構

```
[瀏覽器 A-J] ──WebRTC──▶ [LiveKit SFU] ──▶ [AI Bot Worker]
                              │
                              ├─▶ STT (自訂 endpoint)
                              ├─▶ LLM (自訂 endpoint)
                              ├─▶ TTS (自訂 endpoint)
                              │
                              ◀─AI 音軌注入──┘
```

完整圖與設計決策見 [`docs/architecture.md`](./docs/architecture.md)。

## 快速開始

### 1. 環境需求

- **Node.js 20+**
- **pnpm 9+**
- **LiveKit server binary**（從 [GitHub releases](https://github.com/livekit/livekit/releases) 下載 Windows 版本到 `infra/livekit/bin/`）
- 第一次用 HTTPS LAN 測試時需要自簽憑證（見下方）

### 2. 設定

```bash
pnpm install
pnpm --filter @futuremode/shared build
cp .env.example .env
# 編輯 .env，填入 OPENAI_* 與 STT_* 與 LIVEKIT_*
```

### 3. 啟動服務（4 個 terminal 或背景）

```bash
# Terminal 1: LiveKit SFU
./infra/livekit/bin/livekit-server.exe --config infra/livekit/livekit.yaml

# Terminal 2: TLS proxy（給瀏覽器 wss:// 用）
node infra/certs/livekit-tls-proxy.mjs

# Terminal 3: API
cd apps/api && pnpm dev

# Terminal 4: Web
cd apps/web && pnpm dev

# Terminal 5 (optional): AI Bot
cd services/ai-bot && pnpm dev
```

開 `https://localhost:3000`（自簽憑證警告，接受即可）。

## 文件

- [`docs/architecture.md`](./docs/architecture.md) — 系統架構、設計決策、AI orchestrator FSM
- [`docs/api.md`](./docs/api.md) — REST API 完整規格
- [`docs/runbook.md`](./docs/runbook.md) — 環境變數、疑難排解、部署指南
- [`AGENTS.md`](./AGENTS.md) — 給 AI coding agent 的專案說明

## 開發指令

```bash
pnpm dev              # 平行啟動 web + api + ai-bot
pnpm build            # 全部 build
pnpm typecheck        # 全專案 TypeScript 檢查
pnpm test             # 跑 vitest
pnpm format           # prettier
```

## 專案結構

```
futuremode2026/
├── apps/
│   ├── web/        # Next.js 前端
│   └── api/        # Fastify 後端
├── services/
│   └── ai-bot/     # AI 工作者
├── packages/
│   └── shared/     # 共用型別與常數
├── infra/
│   ├── livekit/    # SFU 設定
│   ├── coturn/     # TURN 設定
│   └── certs/      # 自簽憑證 + TLS proxy
├── docs/           # 架構、API、runbook
├── docker-compose.yml
└── AGENTS.md
```

## 開發階段

- ✅ **Phase 0** — Repo skeleton
- ✅ **Phase 1** — 基本視訊會議
- ✅ **Phase 2** — STT 整合
- ✅ **Phase 3** — AI 介入 MVP
- ✅ **Phase 4** — 錄製與會後 recap
- ⬜ **Phase 5** — Polish（i18n、barge-in、persona 切換 API）
- ⬜ **Phase 6** — Scale（Redis cluster、S3 + Postgres、TURN）

## 授權

MIT
