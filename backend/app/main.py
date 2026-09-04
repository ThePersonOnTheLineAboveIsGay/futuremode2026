"""FastAPI 入口：WebSocket 串流音訊 → 轉錄 → Gemini 可行性分析 → 推播理由。"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from . import analyzer
from .config import get_settings
from .schemas import (
    AssessmentMessage,
    ErrorMessage,
    NoticeMessage,
    StatusMessage,
    TranscriptMessage,
)
from .session import Session
from .transcription import transcribe

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meeting-feasibility-ai")

app = FastAPI(title="Meeting Feasibility AI")

# session_id -> Session。讓斷線重連（背景 exponential-backoff 自動重連、
# 或網路短暫抖動）可以接回同一個 Session，不會把逐字稿脈絡跟已回報清單全部弄丟。
# 只有客戶端主動送 "stop" 才會把 session 從這裡清掉（見 ws_endpoint）。
_sessions: dict[str, Session] = {}

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.origins_list or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": _settings.gemini_model}


async def _send(ws: WebSocket, model) -> None:
    await ws.send_text(model.model_dump_json())


async def _worker(ws: WebSocket, session: Session, queue: "asyncio.Queue[tuple]") -> None:
    """序列化處理音訊／字幕：轉錄 → 分析 → 推播。"""
    while True:
        kind, payload = await queue.get()
        try:
            if kind == "audio":
                text = await transcribe(payload)
                if not text:
                    await _send(ws, NoticeMessage(text="本段音訊未偵測到可轉錄的語音（雜訊/靜音或轉錄失敗）"))
                    continue
                u = session.append(text)
            elif kind == "caption":
                speaker, text = payload
                if not text.strip():
                    continue
                u = session.append(text, speaker=speaker)
            else:
                continue

            await _send(ws, TranscriptMessage(text=u.render(), ts=u.ts))

            items = await analyzer.run_if_needed(session)
            if items:
                await _send(ws, AssessmentMessage(items=items))
            elif items == []:
                await _send(ws, NoticeMessage(text="已分析最近對話，本輪未發現不可行的提案"))
        except WebSocketDisconnect:
            return
        except Exception as e:  # noqa: BLE001
            logger.exception("worker 處理失敗")
            try:
                await _send(ws, ErrorMessage(message=str(e)))
            except Exception:  # noqa: BLE001
                return
        finally:
            queue.task_done()


@app.websocket("/ws/{session_id}")
async def ws_endpoint(ws: WebSocket, session_id: str) -> None:
    await ws.accept()
    if session_id in ("", "new"):
        session_id = uuid.uuid4().hex[:12]
        session = Session(session_id=session_id)
    else:
        session = _sessions.get(session_id) or Session(session_id=session_id)
    _sessions[session_id] = session

    queue: "asyncio.Queue[tuple]" = asyncio.Queue(maxsize=32)
    worker = asyncio.create_task(_worker(ws, session, queue))

    await _send(ws, StatusMessage(state="ready", detail=session_id))
    logger.info("session %s connected（已有 %d 句逐字稿）", session_id, len(session.transcript))

    stopped_intentionally = False
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break

            if (data := msg.get("bytes")) is not None:
                await queue.put(("audio", data))
                continue

            raw = msg.get("text")
            if not raw:
                continue
            try:
                ctrl = json.loads(raw)
            except json.JSONDecodeError:
                continue

            ctype = ctrl.get("type")
            if ctype == "config":
                if (v := ctrl.get("analysis_language")):
                    session.analysis_language = v
                if (v := ctrl.get("confidence_threshold")) is not None:
                    session.confidence_threshold = float(v)
                if (v := ctrl.get("meeting_context")):
                    session.meeting_context = v
                await _send(ws, StatusMessage(state="configured"))
            elif ctype == "caption":
                await queue.put(("caption", (ctrl.get("speaker", ""), ctrl.get("text", ""))))
            elif ctype == "stop":
                stopped_intentionally = True
                break
    except WebSocketDisconnect:
        pass
    finally:
        worker.cancel()
        if stopped_intentionally:
            _sessions.pop(session_id, None)
        logger.info(
            "session %s closed (%d utterances)%s",
            session_id,
            len(session.transcript),
            "，主動停止已清除" if stopped_intentionally else "，保留供重連接回",
        )
