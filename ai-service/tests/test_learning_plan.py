from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

import graph
import main
from schemas import LearningGap, LearningTips, PlanTip

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_service_key(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "")


def test_rank_gaps_uses_severity_occurrences_and_recency():
    gaps = [
        LearningGap(
            concept="High priority",
            severity="high",
            occurrences=2,
            days_since_last_seen=14,
        ),
        LearningGap(
            concept="Recent medium",
            severity="medium",
            occurrences=3,
            days_since_last_seen=0,
        ),
    ]

    ranked = main.rank_gaps(gaps, limit=1)

    assert len(ranked) == 1
    assert ranked[0].concept == "Recent medium"
    assert ranked[0].priority == 6


def test_learning_plan_ranks_locally_and_uses_llm_only_for_tips(monkeypatch):
    captured_messages = []

    class StructuredClient:
        def invoke(self, messages):
            captured_messages.extend(messages)
            return {
                "items": [
                    {
                        "concept": "Refractive index",
                        "tip": "Review how light changes speed between materials.",
                        "practice_question": "How does light speed change in water?",
                    },
                    {
                        "concept": "Snell's law",
                        "tip": "Compare the incident and refracted angles.",
                        "practice_question": "What happens when light enters glass?",
                    },
                ]
            }

    class FakeLLM:
        def with_structured_output(self, schema):
            assert schema is LearningTips
            return StructuredClient()

    monkeypatch.setattr(main, "get_llm", lambda: FakeLLM())
    response = client.post(
        "/learning/plan",
        json={
            "gaps": [
                {
                    "concept": "Snell's law",
                    "severity": "high",
                    "occurrences": 2,
                    "days_since_last_seen": 14,
                },
                {
                    "concept": "Refractive index",
                    "severity": "medium",
                    "occurrences": 3,
                    "days_since_last_seen": 0,
                },
            ],
            "limit": 2,
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert [gap["concept"] for gap in result["ranked"]] == [
        "Refractive index",
        "Snell's law",
    ]
    assert [item["concept"] for item in result["plan"]] == [
        "Refractive index",
        "Snell's law",
    ]
    assert result["ranked"][0]["priority"] == 6
    assert isinstance(captured_messages[0], SystemMessage)
    assert "untrusted data" in captured_messages[0].content
    assert isinstance(captured_messages[1], HumanMessage)
    assert "Refractive index" in captured_messages[1].content
    assert "student" not in captured_messages[1].content.lower()


def test_learning_plan_returns_empty_plan_without_calling_llm_for_no_gaps(monkeypatch):
    def unexpected_llm_call():
        raise AssertionError("LLM should not be called for an empty ranked list")

    monkeypatch.setattr(main, "get_llm", unexpected_llm_call)

    response = client.post("/learning/plan", json={"gaps": []})

    assert response.status_code == 200
    assert response.json() == {"ranked": [], "plan": []}


def test_learning_plan_rejects_bad_limits_and_more_than_50_gaps():
    gap = {
        "concept": "Refraction",
        "severity": "low",
        "occurrences": 1,
        "days_since_last_seen": 0,
    }

    assert client.post("/learning/plan", json={"gaps": [gap], "limit": 11}).status_code == 422
    assert client.post("/learning/plan", json={"gaps": [gap] * 51}).status_code == 422


def test_learning_plan_requires_optional_bearer_key_when_configured(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_KEY", "test-service-key")
    monkeypatch.setattr(main, "get_llm", lambda: None)

    unauthorized = client.post("/learning/plan", json={"gaps": []})
    authorized = client.post(
        "/learning/plan",
        json={"gaps": []},
        headers={"Authorization": "Bearer test-service-key"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200


def test_provider_failure_returns_502(monkeypatch):
    class FailingLLM:
        def with_structured_output(self, schema):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(main, "get_llm", lambda: FailingLLM())
    response = client.post(
        "/learning/plan",
        json={
            "gaps": [{
                "concept": "Refraction",
                "severity": "medium",
                "occurrences": 1,
                "days_since_last_seen": 0,
            }]
        },
    )

    assert response.status_code == 502


def test_analysis_prompt_requires_short_textbook_concept_names(monkeypatch):
    prompts = []

    class StructuredClient:
        def invoke(self, prompt):
            prompts.append(prompt)
            return {"gaps": [{"concept": "Snell's law", "severity": "high"}]}

    class FakeLLM:
        def invoke(self, prompt):
            return SimpleNamespace(content="A short explanation.")

        def with_structured_output(self, schema):
            return StructuredClient()

    monkeypatch.setattr(graph, "get_llm", lambda: FakeLLM())
    response = client.post(
        "/analyze",
        json={"subject": "Physics", "topic": "Refraction", "text": "Why does light bend?"},
    )

    assert response.status_code == 200
    assert response.json()["gaps"] == [{"concept": "Snell's law", "severity": "high"}]
    assert "2 to 4 words" in prompts[0]
    assert "standard textbook wording" in prompts[0]
    assert "Do not put explanations inside a concept name" in prompts[0]


def test_tips_are_limited_to_30_words():
    with pytest.raises(ValidationError):
        PlanTip(
            concept="Refraction",
            tip=" ".join(["word"] * 31),
            practice_question="What is refraction?",
        )


def test_concept_data_is_collapsed_and_capped():
    gap = LearningGap(
        concept=f"  Refractive   index {'x' * 100}",
        severity="low",
        occurrences=1,
        days_since_last_seen=0,
    )

    assert len(gap.concept) == 80
    assert "  " not in gap.concept
