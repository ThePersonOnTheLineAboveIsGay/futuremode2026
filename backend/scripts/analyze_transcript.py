"""煙霧測試：把一段逐字稿（檔案或 stdin）丟給真實 Gemini 分析。

用法：
    python -m scripts.analyze_transcript path/to/transcript.txt
    echo "下週一前把整個系統改用區塊鏈重寫" | python -m scripts.analyze_transcript -
"""
from __future__ import annotations

import asyncio
import sys

from app.analyzer import analyze
from app.config import get_settings


async def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(1)
    src = sys.argv[1]
    transcript = sys.stdin.read() if src == "-" else open(src, encoding="utf-8").read()

    result = await analyze(transcript, language=get_settings().analysis_language)
    if not result.assessments:
        print("（無回報項目）")
    for a in result.assessments:
        print(f"\n[{a.verdict}] conf={a.confidence:.2f}  {a.topic}")
        for r in a.reasons:
            print(f"  - {r}")
        if a.quote:
            print(f"  原文：{a.quote}")


if __name__ == "__main__":
    asyncio.run(main())
