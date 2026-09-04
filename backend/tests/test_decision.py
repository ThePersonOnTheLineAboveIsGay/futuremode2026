from app.contradiction import InterjectionAnalysis
from app.main import should_interject


def test_interjects_only_above_threshold() -> None:
    issue = InterjectionAnalysis(
        has_issue=True,
        issue_type="contradiction",
        explanation="A 改成 B",
        suggested_interjection="要說明改變原因嗎？",
        confidence=0.8,
    )
    assert should_interject(issue, 0.7)
    assert not should_interject(issue, 0.9)


def test_none_never_interjects() -> None:
    no_issue = InterjectionAnalysis(
        has_issue=False,
        issue_type="none",
        explanation="",
        suggested_interjection="",
        confidence=1,
    )
    assert not should_interject(no_issue, 0.7)
