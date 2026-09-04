"""煙霧測試：把一個本地音訊檔丟給 Gemini 轉錄。

用法：
    python -m scripts.transcribe_file path/to/sample.webm
"""
from __future__ import annotations

import asyncio
import mimetypes
import sys
from pathlib import Path

from app.transcription import transcribe

_MIME = {".webm": "audio/webm", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".mp3": "audio/mp3"}


async def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(1)
    path = Path(sys.argv[1])
    mime = _MIME.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "audio/webm"
    text = await transcribe(path.read_bytes(), mime=mime)
    print(repr(text))


if __name__ == "__main__":
    asyncio.run(main())
