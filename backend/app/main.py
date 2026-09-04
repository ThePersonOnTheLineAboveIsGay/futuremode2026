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
    queue: "asyncio.Queue[tuple]" = asyncio.Queue(maxsize=32)
    worker = asyncio.create_task(_worker(ws, session, queue))

    await _send(ws, StatusMessage(state="ready", detail=session_id))
    logger.info("session %s connected", session_id)

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
                break
    except WebSocketDisconnect:
        pass
    finally:
        worker.cancel()
        logger.info("session %s closed (%d utterances)", session_id, len(session.transcript))
