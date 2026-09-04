from __future__ import annotations

import json
import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from .config import get_settings
from .contradiction import ContradictionDetector, InterjectionAnalysis
from .room_manager import RoomManager
from .stt import SpeechToText

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meet-ai-interrupter")
settings = get_settings()
MEETING_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{2,127}$", re.IGNORECASE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.openai = AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
    app.state.rooms = RoomManager(
        window_minutes=settings.conversation_window_minutes,
        max_utterances=settings.conversation_max_utterances,
        idle_timeout_seconds=settings.room_idle_timeout_minutes * 60,
        cleanup_interval_seconds=settings.room_cleanup_interval_seconds,
    )
    await app.state.rooms.start()
    yield
    await app.state.rooms.stop()
    if app.state.openai:
        await app.state.openai.close()


app = FastAPI(title="Meet AI Interrupter", version="0.2.0", lifespan=lifespan)
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
    meeting_id = websocket.query_params.get("meeting_id", "").strip().lower()
    if not MEETING_ID_PATTERN.fullmatch(meeting_id):
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "meeting_id 格式不正確"})
        await websocket.close(code=1008)
        return

    rooms: RoomManager = websocket.app.state.rooms
    await rooms.connect(meeting_id, websocket)
    client: AsyncOpenAI | None = websocket.app.state.openai
    if client is None:
        await websocket.send_json({"type": "error", "message": "後端尚未設定 OPENAI_API_KEY"})
        await websocket.close(code=1011)
        await rooms.disconnect(meeting_id, websocket)
        return

    stt = SpeechToText(client, settings.whisper_model)
    detector = ContradictionDetector(client, settings.llm_model)
    mime_type = "audio/webm"

    await websocket.send_json({"type": "status", "status": "connected", "meeting_id": meeting_id})
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            text = ""
            speaker: str | None = None
            source = "stt"
            timestamp = datetime.now(timezone.utc)

            if message.get("bytes") is not None:
                try:
                    text = await stt.transcribe(message["bytes"], mime_type)
                except Exception as exc:
                    logger.exception("Audio transcription failed in room %s", meeting_id)
                    await websocket.send_json({"type": "error", "message": f"語音辨識失敗：{exc}"})
                    continue
            elif message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "error", "message": "訊息必須是 JSON"})
                    continue
                if payload.get("meeting_id") not in (None, meeting_id):
                    await websocket.send_json({"type": "error", "message": "訊息 meeting_id 與連線房間不符"})
                    continue
                if payload.get("type") == "config":
                    mime_type = str(payload.get("mime_type", mime_type))
                    continue
                if payload.get("type") in {"caption", "transcript"}:
                    text = str(payload.get("text", "")).strip()
                    speaker = clean_speaker(payload.get("speaker"))
                    source = "caption" if payload.get("type") == "caption" else "manual"
                    timestamp = parse_timestamp(payload.get("timestamp"))
                else:
                    continue

            if not text:
                continue

            latest, history, analyze_now = await rooms.add_utterance(
                meeting_id=meeting_id,
                text=text,
                speaker=speaker,
                timestamp=timestamp,
                source=source,
                analysis_interval_seconds=settings.analysis_interval_seconds,
            )
            if latest is None:
                continue

            await websocket.send_json({
                "type": "transcript",
                "meeting_id": meeting_id,
                "speaker": latest.speaker,
                "text": latest.text,
                "source": latest.source,
                "timestamp": latest.timestamp.timestamp(),
            })
            if not analyze_now:
                continue

            await websocket.send_json({"type": "status", "status": "analyzing", "meeting_id": meeting_id})
            try:
                result = await detector.analyze(history, latest)
                if should_interject(result, settings.interjection_confidence_threshold):
                    message_text = format_interjection(result.suggested_interjection, result.target_speaker)
                    allow_chat = await rooms.reserve_chat_slot(
                        meeting_id, result.target_speaker, settings.chat_cooldown_seconds
                    )
                    await rooms.broadcast(
                        meeting_id,
                        {
                            "type": "interjection",
                            "meeting_id": meeting_id,
                            "target_speaker": result.target_speaker,
                            "issue_type": result.issue_type,
                            "explanation": result.explanation,
                            "message": message_text,
                            "confidence": result.confidence,
                        },
                        allow_chat=allow_chat,
                    )
            except Exception as exc:
                logger.exception("Contradiction analysis failed in room %s", meeting_id)
                await websocket.send_json({"type": "error", "message": f"內容分析失敗：{exc}"})
            finally:
                await websocket.send_json({"type": "status", "status": "listening", "meeting_id": meeting_id})
    except WebSocketDisconnect:
        logger.info("Meeting client disconnected from room %s", meeting_id)
    finally:
        await rooms.disconnect(meeting_id, websocket)


def clean_speaker(value: object) -> str | None:
    speaker = " ".join(str(value or "").split())
    return speaker[:100] or None


def parse_timestamp(value: object) -> datetime:
    try:
        timestamp = datetime.fromtimestamp(float(value), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return datetime.now(timezone.utc)
    now = datetime.now(timezone.utc)
    if abs((timestamp - now).total_seconds()) > 3600:
        return now
    return timestamp


def format_interjection(message: str, target_speaker: str | None) -> str:
    clean = message.strip()
    if clean.startswith("🤖 AI 提醒："):
        clean = clean.removeprefix("🤖 AI 提醒：").strip()
    if target_speaker and target_speaker not in clean:
        clean = f"{target_speaker}，{clean}"
    return f"🤖 AI 提醒：{clean}"


def should_interject(result: InterjectionAnalysis, threshold: float) -> bool:
    return (
        result.has_issue
        and result.issue_type != "none"
        and bool(result.suggested_interjection.strip())
        and result.confidence >= threshold
    )
