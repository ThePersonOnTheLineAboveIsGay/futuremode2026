from __future__ import annotations

import io
import logging

logger = logging.getLogger("meet-ai-interrupter.diarization")

_encoder = None
_warned_missing_deps = False


def extract_embedding(audio: bytes, audio_format: str) -> list[float] | None:
    """Best-effort speaker-embedding vector for one already-VAD-cut audio
    segment, used to cluster anonymous (tab-mix) utterances into stable
    pseudo-speakers — see RoomManager.match_anonymous_speaker.

    Returns None (never raises) if the optional diarization dependencies
    (resemblyzer, pydub — see backend/requirements-diarization.txt) or
    ffmpeg aren't installed, or if decoding/embedding otherwise fails.
    Anonymous speaker clustering is a nice-to-have on top of transcription,
    never something that should be able to break it.
    """
    global _encoder, _warned_missing_deps
    try:
        import numpy as np
        from pydub import AudioSegment
        from resemblyzer import VoiceEncoder, preprocess_wav
    except ImportError:
        if not _warned_missing_deps:
            logger.warning(
                "Diarization dependencies not installed (see "
                "backend/requirements-diarization.txt) — anonymous utterances "
                "will stay unlabeled"
            )
            _warned_missing_deps = True
        return None

    try:
        segment = AudioSegment.from_file(io.BytesIO(audio), format=audio_format).set_channels(1)
        samples = np.array(segment.get_array_of_samples()).astype(np.float32)
        samples /= float(1 << (8 * segment.sample_width - 1))
        wav = preprocess_wav(samples, source_sr=segment.frame_rate)
        if wav.size == 0:
            return None
        if _encoder is None:
            _encoder = VoiceEncoder()
        return _encoder.embed_utterance(wav).tolist()
    except Exception:
        logger.exception("Speaker embedding extraction failed")
        return None
