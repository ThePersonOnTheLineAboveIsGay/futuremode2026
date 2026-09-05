from __future__ import annotations

import asyncio
import difflib
import logging
import re
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime
from time import monotonic
from typing import Any

from fastapi import WebSocket

from .conversation_buffer import ConversationBuffer, Utterance

logger = logging.getLogger("meet-ai-interrupter.rooms")

# Two already-reported issues are treated as "the same one" (see
# register_issue_if_new) once their normalized text is at least this similar,
# so the model repeating a still-unresolved contradiction in slightly
# different wording doesn't count as a new topic.
SIMILAR_ISSUE_RATIO = 0.6


def _normalize_issue_topic(topic: str) -> str:
    return re.sub(r"\s+", "", topic.lower())[:200]


@dataclass
class RoomState:
    buffer: ConversationBuffer
    connections: set[WebSocket] = field(default_factory=set)
    participants: dict[WebSocket, str | None] = field(default_factory=dict)
    chat_sender: WebSocket | None = None
    last_activity: float = field(default_factory=monotonic)
    last_analysis_at: float = field(default_factory=lambda: float("-inf"))
    # Count of utterances added since the last analysis ran; lets a burst of
    # new utterances trigger analysis early even if the time interval hasn't
    # elapsed yet — see add_utterance's min_new_utterances.
    utterances_since_analysis: int = 0
    last_chat_by_speaker: dict[str, float] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    # Normalized text of issues already broadcast this meeting, for
    # register_issue_if_new's fuzzy dedup and for feeding back into the
    # analysis prompt so the model itself avoids re-flagging the same thing.
    reported_issues: list[str] = field(default_factory=list)
    # Unpruned, whole-meeting log for the summarize feature. `buffer` above is a
    # rolling window scoped to contradiction analysis and must stay that way.
    full_history: list[Utterance] = field(default_factory=list)


class RoomManager:
    """In-memory room boundary; replace this class when moving state to Redis."""

    def __init__(
        self,
        window_minutes: int,
        max_utterances: int,
        idle_timeout_seconds: float,
        cleanup_interval_seconds: float = 60,
    ) -> None:
        self.rooms: dict[str, RoomState] = {}
        self.window_minutes = window_minutes
        self.max_utterances = max_utterances
        self.idle_timeout_seconds = idle_timeout_seconds
        self.cleanup_interval_seconds = cleanup_interval_seconds
        self._rooms_lock = asyncio.Lock()
        self._cleanup_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def stop(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._cleanup_task
            self._cleanup_task = None

    async def join(
        self,
        meeting_id: str,
        websocket: WebSocket,
        display_name: str | None,
    ) -> bool:
        """Register a connection into the room; returns True if it created the room."""
        clean_name = (display_name or "").strip() or None
        async with self._rooms_lock:
            room = self.rooms.get(meeting_id)
            is_first = room is None
            if room is None:
                room = RoomState(ConversationBuffer(self.window_minutes, self.max_utterances))
                self.rooms[meeting_id] = room

            room.connections.add(websocket)
            room.participants[websocket] = clean_name
            room.chat_sender = room.chat_sender or websocket
            room.last_activity = monotonic()
            logger.info(
                "[%s] Room clients=%d | speaker=%s",
                meeting_id,
                len(room.connections),
                clean_name or "unknown",
            )
            return is_first

    async def disconnect(self, meeting_id: str, websocket: WebSocket) -> None:
        async with self._rooms_lock:
            room = self.rooms.get(meeting_id)
            if room is None:
                return
            room.connections.discard(websocket)
            room.participants.pop(websocket, None)
            if room.chat_sender is websocket:
                room.chat_sender = next(iter(room.connections), None)
            if not room.connections:
                self.rooms.pop(meeting_id, None)
                logger.info("[%s] Room removed (last client disconnected)", meeting_id)
            else:
                logger.info("[%s] Room clients=%d", meeting_id, len(room.connections))

    def participant_name(self, meeting_id: str, websocket: WebSocket) -> str | None:
        room = self.rooms.get(meeting_id)
        if room is None:
            return None
        return room.participants.get(websocket)

    def snapshot_history(self, meeting_id: str) -> list[Utterance]:
        """Whole-meeting transcript, for summarize — not the rolling analysis window."""
        room = self.rooms.get(meeting_id)
        if room is None:
            return []
        return list(room.full_history)

    async def add_utterance(
        self,
        meeting_id: str,
        text: str,
        speaker: str | None,
        timestamp: datetime,
        source: str,
        analysis_interval_seconds: float,
        min_new_utterances: int = 1,
    ) -> tuple[Utterance | None, list[Utterance], bool]:
        room = self.rooms.get(meeting_id)
        if room is None:
            return None, [], False
        async with room.lock:
            room.last_activity = monotonic()
            latest = room.buffer.add(text=text, speaker=speaker, timestamp=timestamp, source=source)
            if latest is None:
                return None, [], False
            room.full_history.append(latest)
            room.utterances_since_analysis += 1
            history = room.buffer.history_before(latest)
            now = monotonic()
            # Either condition can trigger analysis: the usual time throttle,
            # or enough new utterances piling up in a fast-moving exchange
            # that waiting out the full interval would feel sluggish.
            interval_elapsed = now - room.last_analysis_at >= analysis_interval_seconds
            burst_reached = room.utterances_since_analysis >= min_new_utterances
            should_analyze = bool(history) and (interval_elapsed or burst_reached)
            if should_analyze:
                room.last_analysis_at = now
                room.utterances_since_analysis = 0
            return latest, history, should_analyze

    def reported_issues_for_prompt(self, meeting_id: str) -> list[str]:
        room = self.rooms.get(meeting_id)
        return list(room.reported_issues) if room else []

    async def register_issue_if_new(self, meeting_id: str, topic: str) -> bool:
        """Fuzzy-dedup an about-to-broadcast issue against ones already
        reported in this room. Returns False (and records nothing) if it's
        substantially similar to one already reported — the model can still
        get asked not to repeat itself via reported_issues_for_prompt, but
        this is the hard backstop for when it does anyway."""
        room = self.rooms.get(meeting_id)
        if room is None:
            return True
        async with room.lock:
            normalized = _normalize_issue_topic(topic)
            for previous in room.reported_issues:
                ratio = difflib.SequenceMatcher(None, normalized, _normalize_issue_topic(previous)).ratio()
                if ratio >= SIMILAR_ISSUE_RATIO:
                    return False
            room.reported_issues.append(topic)
            return True

    async def reserve_chat_slot(self, meeting_id: str, speaker: str | None, cooldown_seconds: float) -> bool:
        room = self.rooms.get(meeting_id)
        if room is None:
            return False
        key = speaker or "__meeting__"
        async with room.lock:
            now = monotonic()
            if now - room.last_chat_by_speaker.get(key, float("-inf")) < cooldown_seconds:
                return False
            room.last_chat_by_speaker[key] = now
            return True

    async def broadcast(self, meeting_id: str, payload: dict[str, Any], allow_chat: bool = False) -> None:
        room = self.rooms.get(meeting_id)
        if room is None:
            return
        room.last_activity = monotonic()
        connections = list(room.connections)
        chat_sender = room.chat_sender
        stale: list[WebSocket] = []
        logger.info(
            "[%s] Broadcasting event to %d client(s); Meet chat sender=%s",
            meeting_id,
            len(connections),
            allow_chat and chat_sender is not None,
        )
        for connection in connections:
            try:
                await connection.send_json({
                    **payload,
                    "send_to_chat": bool(allow_chat and connection is chat_sender),
                })
            except Exception:
                stale.append(connection)
        for connection in stale:
            await self.disconnect(meeting_id, connection)

    async def cleanup_once(self, now: float | None = None) -> list[str]:
        current = now if now is not None else monotonic()
        async with self._rooms_lock:
            expired_rooms = [
                (meeting_id, room)
                for meeting_id, room in self.rooms.items()
                if current - room.last_activity >= self.idle_timeout_seconds
            ]
            for meeting_id, _ in expired_rooms:
                self.rooms.pop(meeting_id, None)
        for _, room in expired_rooms:
            for connection in list(room.connections):
                with suppress(Exception):
                    await connection.close(code=1001, reason="Room expired due to inactivity")
        for meeting_id, _ in expired_rooms:
            logger.info("[%s] Room removed (idle timeout)", meeting_id)
        return [meeting_id for meeting_id, _ in expired_rooms]

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(self.cleanup_interval_seconds)
            await self.cleanup_once()
