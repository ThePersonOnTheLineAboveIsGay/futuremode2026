from app.session import Session


def test_recent_transcript_text_joins_last_n_utterances():
    s = Session(session_id="t")
    for text in ["第一句", "第二句", "第三句", "第四句", "第五句"]:
        s.append(text)
    assert s.recent_transcript_text(n=4) == "第二句 第三句 第四句 第五句"


def test_recent_transcript_text_empty_when_no_transcript():
    s = Session(session_id="t")
    assert s.recent_transcript_text() == ""
