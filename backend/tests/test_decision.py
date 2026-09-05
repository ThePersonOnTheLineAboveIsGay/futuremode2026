from app.contradiction import InterjectionAnalysis
from app.main import format_interjection, should_interject


def test_interjects_regardless_of_confidence_score() -> None:
    # There is no confidence cutoff any more: a low-confidence has_issue=True
    # result still interjects, trusting the model's own judgment directly.
    issue = InterjectionAnalysis(
        has_issue=True,
        issue_type="contradiction",
        reasons=["A 改成 B"],
        suggested_interjection="要說明改變原因嗎？",
        confidence=0.2,
    )
    assert should_interject(issue)


def test_decision_review_interjects_like_any_other_issue_type() -> None:
    issue = InterjectionAnalysis(
        has_issue=True,
        issue_type="decision_review",
        reasons=["方案 A 成本較低但交期較長", "方案 B 交期短但成本較高"],
        suggested_interjection="要不要先確認交期跟成本哪個對這次比較重要？",
        confidence=0.8,
    )
    assert should_interject(issue)


def test_none_never_interjects() -> None:
    no_issue = InterjectionAnalysis(
        has_issue=False,
        issue_type="none",
        reasons=[],
        suggested_interjection="",
        confidence=1,
    )
    assert not should_interject(no_issue)


def test_interjection_prefix_and_target_are_enforced() -> None:
    assert format_interjection("請說明改變原因", "王小明") == "🤖 AI 提醒：王小明，請說明改變原因"
    assert format_interjection("🤖 AI 提醒：王小明，請說明", "王小明") == "🤖 AI 提醒：王小明，請說明"
