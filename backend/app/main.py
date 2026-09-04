from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from time import monotonic

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from .config import get_settings
from .contradiction import ContradictionDetector, InterjectionAnalysis
from .conversation_buffer import ConversationBuffer
from .stt import SpeechToText

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meet-ai-interrupter")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.openai = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
    yield
    if app.state.openai:
        await app.state.openai.close()


app = FastAPI(title="Meet AI Interrupter", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=settings.origin_list != ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {"status": "ok", "openai_configured": bool(settings.openai_api_key)}


@app.websocket("/ws/meeting")
async def meeting_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    client: AsyncOpenAI | None = websocket.app.state.openai
    if client is None:
        await websocket.send_json({"type": "error", "message": "後端尚未設定 OPENAI_API_KEY"})
        await websocket.close(code=1011)
        return

    buffer = ConversationBuffer(settings.conversation_window_minutes, settings.conversation_max_utterances)
    stt = SpeechToText(client, settings.whisper_model)
    detector = ContradictionDetector(client, settings.llm_model)
    last_analysis_at = monotonic() - settings.analysis_interval_seconds
    mime_type = "audio/webm"

    await websocket.send_json({"type": "status", "status": "connected"})
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            text = ""
            speaker = None

            if message.get("bytes") is not None:
                try:
                    text = await stt.transcribe(message["bytes"], mime_type)
                except Exception as exc:
                    logger.exception("Audio transcription failed")
                    await websocket.send_json({"type": "error", "message": f"語音辨識失敗：{exc}"})
                    continue
            elif message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "訊息必須是 JSON"})
                    continue
                if payload.get("type") == "config":
                    mime_type = payload.get("mime_type", mime_type)
                    continue
                if payload.get("type") == "transcript":
                    text = str(payload.get("text", "")).strip()
                    speaker = payload.get("speaker")
                else:
                    continue

            if not text:
                continue

            latest = buffer.add(text=text, speaker=speaker)
            await websocket.send_json({"type": "transcript", "text": text, "timestamp": latest.timestamp.isoformat()})

            now = monotonic()
            history = buffer.history_before(latest)
            if not history or now - last_analysis_at < settings.analysis_interval_seconds:
                continue

            last_analysis_at = now
            await websocket.send_json({"type": "status", "status": "analyzing"})
            try:
                result = await detector.analyze(history, latest)
                if should_interject(result, settings.interjection_confidence_threshold):
                    await websocket.send_json({
                        "type": "interjection",
                        "issue_type": result.issue_type,
                        "explanation": result.explanation,
                        "message": result.suggested_interjection,
                        "confidence": result.confidence,
                    })
            except Exception as exc:
                logger.exception("Contradiction analysis failed")
                await websocket.send_json({"type": "error", "message": f"內容分析失敗：{exc}"})
            finally:
                await websocket.send_json({"type": "status", "status": "listening"})
    except WebSocketDisconnect:
        logger.info("Meeting client disconnected")


def should_interject(result: InterjectionAnalysis, threshold: float) -> bool:
    return result.has_issue and result.issue_type != "none" and result.confidence >= threshold
