from app.transcription import _looks_like_noise


def test_empty_and_known_silence_markers_are_noise():
    assert _looks_like_noise("") is True
    assert _looks_like_noise("（無語音）") is True
    assert _looks_like_noise("no speech") is True


def test_youtube_outro_hallucination_is_noise():
    assert _looks_like_noise(
        "謝謝谢谢观看 欢迎订阅我的频道人物所以说谢谢大家谢谢请不吝点赞 订阅 转发 打赏支持明镜与点点栏目"
    ) is True
    assert _looks_like_noise(
        "感谢观看 请不吝点赞 订阅 转发 打赏支持"
    ) is True


def test_real_speech_mentioning_subscribe_once_is_not_dropped():
    assert _looks_like_noise("我們下一步要規劃訂閱制的定價方案") is False


def test_real_speech_is_not_noise():
    assert _looks_like_noise("我提議下週一前把整個系統改用區塊鏈重寫") is False
