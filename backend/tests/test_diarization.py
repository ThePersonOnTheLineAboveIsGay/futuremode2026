from app.diarization import extract_embedding


def test_extract_embedding_never_raises_on_garbage_audio() -> None:
    # Whether or not the optional diarization extras (resemblyzer/pydub) are
    # installed, and whether or not ffmpeg is available, this must degrade to
    # None instead of raising — anonymous speaker clustering is best-effort
    # and must never be able to break transcription.
    assert extract_embedding(b"not actually audio", "webm") is None


def test_extract_embedding_never_raises_on_empty_audio() -> None:
    assert extract_embedding(b"", "webm") is None
