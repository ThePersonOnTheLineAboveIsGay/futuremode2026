import json

import pytest
from pydantic import ValidationError

from app.schemas import AnalysisResult, Assessment


def test_analysis_result_parses_claude_json():
    raw = json.dumps(
        {
            "assessments": [
                {
                    "topic": "下週一前改用區塊鏈重寫系統",
                    "verdict": "infeasible",
                    "confidence": 0.9,
                    "reasons": ["時程只有幾天，重寫整個系統不可能", "團隊無區塊鏈經驗"],
                    "quote": "我們下週一前把整個系統改用區塊鏈重寫",
                }
            ]
        }
    )
    result = AnalysisResult.model_validate_json(raw)
    assert len(result.assessments) == 1
    assert result.assessments[0].verdict == "infeasible"


def test_assessment_confidence_bounds():
    with pytest.raises(ValidationError):
        Assessment(topic="x", verdict="infeasible", confidence=1.5)


def test_empty_assessments_default():
    assert AnalysisResult().assessments == []
