from __future__ import annotations

import argparse
import asyncio
import io
import math
import sys
import time
import wave

import httpx
import sounddevice as sd

from app.config import get_settings
from app.stt import OpenRouterSpeechToText


SAMPLE_RATE = 16_000
CHANNELS = 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Continuously record microphone audio and print OpenRouter Whisper transcriptions."
    )
    parser.add_argument("--seconds", type=float, default=4.0, help="Seconds per recognition chunk.")
    parser.add_argument("--device", type=int, default=None, help="Input device index from --list-devices.")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices and exit.")
    parser.add_argument("--silence-rms", type=float, default=0.004, help="RMS below this value is treated as silence.")
    return parser.parse_args()


def list_devices() -> None:
    print(sd.query_devices())


def pcm16_wav_bytes(audio) -> bytes:
    frames = bytearray()
    for sample in audio.reshape(-1):
        clipped = max(-1.0, min(1.0, float(sample)))
        frames.extend(int(clipped * 32767).to_bytes(2, byteorder="little", signed=True))

    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(bytes(frames))
    return output.getvalue()


def audio_rms(audio) -> float:
    flat = audio.reshape(-1)
    if len(flat) == 0:
        return 0.0
    return math.sqrt(sum(float(sample) * float(sample) for sample in flat) / len(flat))


def record_chunk(seconds: float, device: int | None):
    frames = int(seconds * SAMPLE_RATE)
    return sd.rec(
        frames,
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="float32",
        device=device,
        blocking=True,
    )


async def run(args: argparse.Namespace) -> int:
    if args.list_devices:
        list_devices()
        return 0

    settings = get_settings()
    if not settings.openrouter_api_key:
        print("ERROR: .env 缺少 OPENROUTER_API_KEY，testvoice 只需要這個 key。", file=sys.stderr)
        return 2

    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "Meet AI Interrupter Test Voice",
    }
    context: list[str] = []

    print("testvoice started. Press Ctrl+C to stop.")
    print(f"chunk={args.seconds:.1f}s sample_rate={SAMPLE_RATE}Hz device={args.device or 'default'}")
    print("Speak Mandarin/Taiwan Chinese near the microphone. Each chunk prints RMS and transcript.")

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0), headers=headers) as client:
        transcriber = OpenRouterSpeechToText(client)
        chunk_no = 1
        while True:
            started_at = time.strftime("%H:%M:%S")
            print(f"\n[{started_at}] chunk #{chunk_no}: recording...")
            audio = record_chunk(args.seconds, args.device)
            rms = audio_rms(audio)
            print(f"[{time.strftime('%H:%M:%S')}] chunk #{chunk_no}: rms={rms:.5f}")

            if rms < args.silence_rms:
                print("result: (silence / 麥克風音量太小，未送出辨識)")
                chunk_no += 1
                continue

            try:
                wav_audio = pcm16_wav_bytes(audio)
                transcript = await transcriber.transcribe(wav_audio, "audio/wav", " ".join(context[-4:]))
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"ERROR: STT failed: {exc}", file=sys.stderr)
                chunk_no += 1
                continue

            if transcript:
                print(f"result: {transcript}")
                context.append(transcript)
            else:
                print("result: (OpenRouter 回傳空字串，通常是音量太小、背景噪音、或該段沒有人聲)")
            chunk_no += 1


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        print("\nstopped.")
        return 0
    except sd.PortAudioError as exc:
        print(f"ERROR: 麥克風啟動失敗：{exc}", file=sys.stderr)
        print("先執行 `python backend/testvoice.py --list-devices`，再用 `--device 裝置編號` 指定麥克風。", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
