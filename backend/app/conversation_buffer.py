from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone


@dataclass(slots=True)
class Utterance:
    text: str
    timestamp: datetime
    speaker: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        result = asdict(self)
        result["timestamp"] = self.timestamp.isoformat()
        return result


class ConversationBuffer:
    def __init__(self, window_minutes: int = 15, max_utterances: int = 100) -> None:
        self.window = timedelta(minutes=window_minutes)
        self.items: deque[Utterance] = deque(maxlen=max_utterances)

    def add(self, text: str, speaker: str | None = None, timestamp: datetime | None = None) -> Utterance:
        item = Utterance(text=text.strip(), speaker=speaker, timestamp=timestamp or datetime.now(timezone.utc))
        self.items.append(item)
        self.prune(item.timestamp)
        return item

    def prune(self, now: datetime | None = None) -> None:
        cutoff = (now or datetime.now(timezone.utc)) - self.window
        while self.items and self.items[0].timestamp < cutoff:
            self.items.popleft()

    def history_before(self, latest: Utterance) -> list[Utterance]:
        return [item for item in self.items if item is not latest]

    def __len__(self) -> int:
        return len(self.items)
