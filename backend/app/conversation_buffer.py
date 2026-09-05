from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone


@dataclass(slots=True)
class Utterance:
    text: str
    timestamp: datetime
    speaker: str | None = None
    source: str = "stt"

    def to_dict(self) -> dict[str, str | None]:
        result = asdict(self)
        result["timestamp"] = self.timestamp.isoformat()
        return result


class ConversationBuffer:
    def __init__(self, window_minutes: int = 15, max_utterances: int = 100) -> None:
        self.window = timedelta(minutes=window_minutes)
        self.items: deque[Utterance] = deque(maxlen=max_utterances)
        self.dedupe_window = timedelta(seconds=5)

    def add(
        self,
        text: str,
        speaker: str | None = None,
        timestamp: datetime | None = None,
        source: str = "stt",
    ) -> Utterance | None:
        clean_text = " ".join(text.split())
        clean_speaker = speaker.strip() if speaker else None
        item_time = timestamp or datetime.now(timezone.utc)
        for existing in reversed(self.items):
            close_in_time = abs(item_time - existing.timestamp) <= self.dedupe_window
            if close_in_time and existing.text == clean_text and existing.speaker == clean_speaker:
                return None
        item = Utterance(text=clean_text, speaker=clean_speaker, timestamp=item_time, source=source)
        self.items.append(item)
        self.prune(item.timestamp)
        return item

    def prune(self, now: datetime | None = None) -> None:
        cutoff = (now or datetime.now(timezone.utc)) - self.window
        while self.items and self.items[0].timestamp < cutoff:
            self.items.popleft()

    def history_before(self, latest: Utterance) -> list[Utterance]:
        return [item for item in self.items if item is not latest]

    def history_for_speaker(self, speaker: str, latest: Utterance | None = None) -> list[Utterance]:
        return [item for item in self.items if item is not latest and item.speaker == speaker]

    def __len__(self) -> int:
        return len(self.items)
