from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .ai_provider import AIServices, create_ai_services
from .config import get_settings
from .contradiction import InterjectionAnalysis
from .diarization import extract_embedding
from .room_manager import RoomManager
from .stt import audio_format_from_mime_type
from .summary import Summarizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("meet-ai-interrupter")
settings = get_settings()
MEETING_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{2,127}$", re.IGNORECASE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ai_services = create_ai_services(settings)
    app.state.rooms = RoomManager(
        window_minutes=settings.conversation_window_minutes,
        max_utterances=settings.conversation_max_utterances,
        idle_timeout_seconds=settings.room_idle_timeout_minutes * 60,
        cleanup_interval_seconds=settings.room_cleanup_interval_seconds,
    )
    await app.state.rooms.start()
    logger.info(
        "Meet AI backend ready | analysis_provider=%s | stt_provider=openrouter | configured=%s | analysis_interval=%ss | threshold=%.2f",
        settings.ai_provider,
        settings.ai_configured,
        settings.analysis_interval_seconds,
        settings.interjection_confidence_threshold,
    )
    yield
    await app.state.rooms.stop()
    if app.state.ai_services:
        await app.state.ai_services.close()


app = FastAPI(title="Meet AI Interrupter", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=settings.origin_list != ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "ai_provider": settings.ai_provider,
        "stt_provider": "openrouter",
        "ai_configured": settings.ai_configured,
        "analysis_configured": settings.analysis_configured,
        "stt_configured": settings.stt_configured,
    }


async def safe_send_json(websocket: WebSocket, payload: dict) -> None:
    """Best-effort send. Receiving and processing are decoupled (see
    meeting_socket), so a reply can finish computing after its connection has
    already closed — that's expected, not an error, so it's swallowed here
    instead of crashing the handler."""
    try:
        await websocket.send_json(payload)
    except Exception:
        logger.debug("[%s] Dropped send to a closed connection", payload.get("meeting_id"))


async def safe_close(websocket: WebSocket, code: int) -> None:
    """Best-effort close. The client may have already disconnected (e.g. the
    join handshake never arrived because they hung up first), in which case
    the ASGI connection is already gone and closing it again raises — that's
    expected, not an error, so it's swallowed here instead of crashing the
    handler."""
    try:
        await websocket.close(code=code)
    except Exception:
        logger.debug("Dropped close on an already-closed connection")


@app.websocket("/ws/meeting")
async def meeting_socket(websocket: WebSocket) -> None:
    meeting_id = websocket.query_params.get("meeting_id", "").strip().lower()
    await websocket.accept()
    if not MEETING_ID_PATTERN.fullmatch(meeting_id):
        await safe_send_json(websocket, {"type": "error", "message": "meeting_id 格式不正確"})
        await safe_close(websocket, code=1008)
        return

    rooms: RoomManager = websocket.app.state.rooms
    join_payload = await receive_join_payload(websocket, meeting_id)
    if join_payload is None:
        await safe_close(websocket, code=1008)
        return

    mime_type = str(join_payload.get("mime_type", "audio/webm"))
    is_first = await rooms.join(meeting_id, websocket, display_name=join_payload.get("display_name"))

    logger.info("[%s] Extension connected | first=%s", meeting_id, is_first)
    ai_services: AIServices | None = websocket.app.state.ai_services
    if ai_services is None:
        missing = "、".join(settings.missing_api_keys)
        await safe_send_json(websocket, {"type": "error", "message": f"後端尚未設定：{missing}"})
        await safe_close(websocket, code=1011)
        await rooms.disconnect(meeting_id, websocket)
        return

    stt = ai_services.transcriber
    detector = ai_services.detector
    summarizer = ai_services.summarizer
    stt_context: deque[str] = deque(maxlen=4)

    await safe_send_json(websocket, {"type": "join_ack", "meeting_id": meeting_id})
    await safe_send_json(websocket, {"type": "status", "status": "connected", "meeting_id": meeting_id})

    async def process_message(message: dict) -> None:
        nonlocal mime_type
        text = ""
        speaker: str | None = None
        source = "stt"
        timestamp = datetime.now(timezone.utc)

        if message.get("bytes") is not None:
            try:
                logger.info(
                    "[%s] AI audio chunk received | bytes=%d | mime=%s",
                    meeting_id,
                    len(message["bytes"]),
                    mime_type,
                )
                text = await stt.transcribe(message["bytes"], mime_type, " ".join(stt_context))
                speaker = rooms.participant_name(meeting_id, websocket)
                if not speaker and text:
                    # No known identity for this connection (anonymous
                    # tab-mix, or a mic whose display name wasn't set) — try
                    # to at least tell different voices apart within the
                    # room instead of blurring everyone into one source.
                    # Best-effort: falls back to fully anonymous if the
                    # optional diarization dependencies aren't installed.
                    embedding = await asyncio.to_thread(
                        extract_embedding, message["bytes"], audio_format_from_mime_type(mime_type)
                    )
                    if embedding is not None:
                        speaker = await rooms.match_anonymous_speaker(meeting_id, embedding)
            except Exception as exc:
                logger.exception("Audio transcription failed in room %s", meeting_id)
                await safe_send_json(websocket, {"type": "error", "message": f"語音辨識失敗：{exc}"})
                return
        elif message.get("text") is not None:
            try:
                payload = json.loads(message["text"])
            except json.JSONDecodeError:
                await safe_send_json(websocket, {"type": "error", "message": "訊息必須是 JSON"})
                return
            if payload.get("meeting_id") not in (None, meeting_id):
                await safe_send_json(websocket, {"type": "error", "message": "訊息 meeting_id 與連線房間不符"})
                return
            if payload.get("type") == "config":
                mime_type = str(payload.get("mime_type", mime_type))
                logger.info("[%s] Client configured | audio=%s", meeting_id, mime_type)
                return
            if payload.get("type") == "summarize":
                await handle_summarize(websocket, rooms, summarizer, meeting_id)
                return
            if payload.get("type") == "transcript":
                text = str(payload.get("text", "")).strip()
                speaker = clean_speaker(payload.get("speaker"))
                source = "manual"
                timestamp = parse_timestamp(payload.get("timestamp"))
            else:
                return

        if not text:
            if source == "stt":
                logger.info("[%s] Audio chunk contained no speech", meeting_id)
            return

        if source == "stt":
            stt_context.append(text)

        logger.info(
            "[%s] Transcript received | source=%s | speaker=%s | text=%s",
            meeting_id,
            source,
            speaker or "unknown",
            text,
        )

        latest, history, analyze_now = await rooms.add_utterance(
            meeting_id=meeting_id,
            text=text,
            speaker=speaker,
            timestamp=timestamp,
            source=source,
            analysis_interval_seconds=settings.analysis_interval_seconds,
            min_new_utterances=settings.analysis_min_new_utterances,
        )
        if latest is None:
            logger.info("[%s] Duplicate/empty transcript ignored", meeting_id)
            return

        await safe_send_json(websocket, {
            "type": "transcript",
            "meeting_id": meeting_id,
            "speaker": latest.speaker,
            "text": latest.text,
            "source": latest.source,
            "timestamp": latest.timestamp.timestamp(),
        })
        if not analyze_now:
            logger.info(
                "[%s] Saved transcript; AI analysis skipped (no history, or below both the %ss throttle "
                "and %d-utterance burst threshold)",
                meeting_id,
                settings.analysis_interval_seconds,
                settings.analysis_min_new_utterances,
            )
            return

        logger.info("[%s] Sending transcript history to %s for analysis", meeting_id, settings.ai_provider)
        await safe_send_json(websocket, {"type": "status", "status": "analyzing", "meeting_id": meeting_id})
        try:
            already_reported = rooms.reported_issues_for_prompt(meeting_id)
            result = await detector.analyze(history, latest, already_reported=already_reported)
            logger.info(
                "[%s] AI result | issue=%s | type=%s | confidence=%.2f | target=%s | reasons=%s | quote=%s",
                meeting_id,
                result.has_issue,
                result.issue_type,
                result.confidence,
                result.target_speaker or "none",
                result.reasons or "none",
                result.quote or "none",
            )
            if should_interject(result):
                topic = (
                    f"{result.issue_type}|{result.target_speaker or ''}|"
                    f"{' '.join(result.reasons)}|{result.suggested_interjection}"
                )
                is_new_issue = await rooms.register_issue_if_new(meeting_id, topic)
                if not is_new_issue:
                    logger.info(
                        "[%s] Interjection suppressed as duplicate of an already-reported issue", meeting_id
                    )
                else:
                    message_text = format_interjection(result.suggested_interjection)
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
                            "reasons": result.reasons,
                            "quote": result.quote,
                            "message": message_text,
                            "confidence": result.confidence,
                        },
                        allow_chat=allow_chat,
                    )
                    logger.info(
                        "[%s] INTERJECTION broadcast | chat=%s | message=%s",
                        meeting_id,
                        allow_chat,
                        message_text,
                    )
            else:
                logger.info("[%s] No interjection (no clear issue)", meeting_id)
        except Exception as exc:
            logger.exception("Contradiction analysis failed in room %s", meeting_id)
            await safe_send_json(websocket, {"type": "error", "message": f"內容分析失敗：{exc}"})
        finally:
            await safe_send_json(websocket, {"type": "status", "status": "listening", "meeting_id": meeting_id})

    # Receiving off the socket and processing each message (STT + AI calls)
    # are split into two tasks sharing a FIFO queue. A slow transcription or
    # analysis call only ever delays *processing* of what follows — it never
    # blocks draining the socket, so a burst of audio segments can't back up
    # or stall behind one another.
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def receive_loop() -> None:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                await queue.put(None)
                return
            await queue.put(message)

    async def process_loop() -> None:
        while True:
            message = await queue.get()
            if message is None:
                return
            await process_message(message)

    try:
        async with asyncio.TaskGroup() as task_group:
            task_group.create_task(receive_loop())
            task_group.create_task(process_loop())
    except* WebSocketDisconnect:
        logger.info("Meeting client disconnected from room %s", meeting_id)
    finally:
        await rooms.disconnect(meeting_id, websocket)


async def receive_join_payload(websocket: WebSocket, meeting_id: str) -> dict | None:
    """Read the first client message; it must be a `config` join handshake."""
    message = await websocket.receive()
    if message["type"] == "websocket.disconnect" or message.get("text") is None:
        await safe_send_json(websocket, {"type": "error", "message": "第一則訊息必須是 config 加入請求"})
        return None
    try:
        payload = json.loads(message["text"])
    except json.JSONDecodeError:
        await safe_send_json(websocket, {"type": "error", "message": "訊息必須是 JSON"})
        return None
    if payload.get("type") != "config":
        await safe_send_json(websocket, {"type": "error", "message": "第一則訊息必須是 config 加入請求"})
        return None
    if payload.get("meeting_id") not in (None, meeting_id):
        await safe_send_json(websocket, {"type": "error", "message": "訊息 meeting_id 與連線房間不符"})
        return None
    return payload


async def handle_summarize(
    websocket: WebSocket,
    rooms: RoomManager,
    summarizer: Summarizer,
    meeting_id: str,
) -> None:
    """Summarize the whole meeting so far (not the rolling analysis window).
    The result always goes back to whoever clicked the button — their own
    connection is what tries to post it to Meet chat, regardless of the
    room's separately-designated interjection chat sender, so every Debug
    click actually reaches chat. Empty/failed attempts are diagnostic-only
    and must stay out of chat: `send_to_chat` is omitted for those so the
    client shows them as a card instead of trying to send them."""
    history = rooms.snapshot_history(meeting_id)
    logger.info("[%s] Summarize requested | utterances=%d", meeting_id, len(history))
    if not history:
        await safe_send_json(websocket, {
            "type": "summary",
            "meeting_id": meeting_id,
            "text": "目前還沒有逐字稿可以整理重點，先說幾句話再試一次。",
        })
        return
    try:
        text = await summarizer.summarize(history)
    except Exception as exc:
        logger.exception("Summary failed in room %s", meeting_id)
        await safe_send_json(websocket, {
            "type": "summary",
            "meeting_id": meeting_id,
            "text": f"整理重點失敗（目前逐字稿共 {len(history)} 句）：{exc}",
        })
        return
    summary = text.strip() or "（摘要服務沒有回傳文字）"
    logger.info("[%s] Summary sent to requester | utterances=%d", meeting_id, len(history))
    await safe_send_json(websocket, {
        "type": "summary",
        "meeting_id": meeting_id,
        "text": summary,
        "send_to_chat": True,
    })


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


def format_interjection(message: str) -> str:
    """Normalizes the "🤖 AI 提醒：" prefix only. Who it's about is carried
    separately by target_speaker (shown in the floating card's own "對象："
    field) — this text is also what gets posted verbatim into Meet chat, so
    it deliberately never names anyone (the system prompt instructs the
    model's own suggested_interjection to stay name-free for the same
    reason)."""
    clean = message.strip()
    if clean.startswith("🤖 AI 提醒："):
        clean = clean.removeprefix("🤖 AI 提醒：").strip()
    return f"🤖 AI 提醒：{clean}"


def should_interject(result: InterjectionAnalysis) -> bool:
    """Trust the model's own has_issue judgment directly — no confidence
    cutoff. `interjection_confidence_threshold` is kept in settings purely so
    `confidence` still shows up in logs/UI for humans to judge, not as a gate."""
    return (
        result.has_issue
        and result.issue_type != "none"
        and bool(result.suggested_interjection.strip())
    )
