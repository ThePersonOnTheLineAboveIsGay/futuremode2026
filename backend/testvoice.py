from __future__ import annotations

import argparse
import asyncio
import array
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
    parser.add_argument("--device", type=int, default=None, help="Input device index from --list-devices.")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices and exit.")
    parser.add_argument("--start-rms", type=float, default=0.012, help="RMS required to start a speech segment.")
    parser.add_argument("--silence-rms", type=float, default=0.006, help="RMS below this value is treated as silence.")
    parser.add_argument("--silence-ms", type=int, default=900, help="Silence duration that ends a speech segment.")
    parser.add_argument("--min-ms", type=int, default=1200, help="Minimum speech segment duration to transcribe.")
    parser.add_argument("--max-ms", type=int, default=12000, help="Maximum speech segment duration before forced transcription.")
    return parser.parse_args()


def list_devices() -> None:
    print(sd.query_devices())


def pcm16_wav_bytes(pcm_audio: bytes) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        wav_file.writeframes(pcm_audio)
    return output.getvalue()


def audio_rms(pcm_audio: bytes) -> float:
    samples = array.array("h")
    samples.frombytes(pcm_audio)
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return 0.0
    return math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768.0


def frame_duration_ms(frame_bytes: int) -> float:
    return frame_bytes / (SAMPLE_RATE * CHANNELS * 2) * 1000


def record_speech_segment(args: argparse.Namespace) -> tuple[bytes, float, float, str]:
    frame_ms = 100
    frame_size = int(SAMPLE_RATE * frame_ms / 1000)
    with sd.RawInputStream(
        device=args.device,
        samplerate=SAMPLE_RATE,
        channels=CHANNELS,
        dtype="int16",
    ) as stream:
        print("waiting for speech...", flush=True)
        while True:
            data, overflowed = stream.read(frame_size)
            if overflowed:
                print("WARN: audio input overflowed while waiting.", file=sys.stderr)
            frame = bytes(data)
            rms = audio_rms(frame)
            if rms >= args.start_rms:
                break

        chunks = [frame]
        peak_rms = rms
        total_ms = frame_duration_ms(len(frame))
        silence_ms = 0.0

        while True:
            data, overflowed = stream.read(frame_size)
            if overflowed:
                print("WARN: audio input overflowed; this segment may be incomplete.", file=sys.stderr)
            frame = bytes(data)
            rms = audio_rms(frame)
            peak_rms = max(peak_rms, rms)
            chunks.append(frame)
            total_ms += frame_duration_ms(len(frame))
            silence_ms = silence_ms + frame_ms if rms < args.silence_rms else 0.0

            if total_ms >= args.max_ms:
                return b"".join(chunks), total_ms / 1000, peak_rms, "max-duration"
            if total_ms >= args.min_ms and silence_ms >= args.silence_ms:
                return b"".join(chunks), total_ms / 1000, peak_rms, "silence"


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
    print(f"mode=smart-vad sample_rate={SAMPLE_RATE}Hz device={args.device or 'default'}")
    print(
        "Speak Mandarin/Taiwan Chinese near the microphone. "
        "Recording starts on voice and transcribes after a pause."
    )
    print(
        f"vad start_rms={args.start_rms:.5f} silence_rms={args.silence_rms:.5f} "
        f"silence_ms={args.silence_ms} min_ms={args.min_ms} max_ms={args.max_ms}"
    )

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0), headers=headers) as client:
        transcriber = OpenRouterSpeechToText(client)
        segment_no = 1
        while True:
            started_at = time.strftime("%H:%M:%S")
            print(f"\n[{started_at}] segment #{segment_no}: listening...")
            pcm_audio, duration, peak_rms, reason = record_speech_segment(args)
            print(
                f"[{time.strftime('%H:%M:%S')}] segment #{segment_no}: "
                f"duration={duration:.1f}s peak_rms={peak_rms:.5f} end={reason}"
            )

            if duration * 1000 < args.min_ms:
                print("result: (too short / 語音段落太短，未送出辨識)")
                segment_no += 1
                continue

            try:
                wav_audio = pcm16_wav_bytes(pcm_audio)
                transcript = await transcriber.transcribe(wav_audio, "audio/wav", " ".join(context[-4:]))
            except KeyboardInterrupt:
                raise
            except Exception as exc:
                print(f"ERROR: STT failed: {exc}", file=sys.stderr)
                segment_no += 1
                continue

            if transcript:
                print(f"result: {transcript}")
                context.append(transcript)
            else:
                print("result: (OpenRouter 回傳空字串，通常是音量太小、背景噪音、或該段沒有人聲)")
            segment_no += 1


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
