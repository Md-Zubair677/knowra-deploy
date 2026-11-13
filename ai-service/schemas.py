from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def normalize_concept(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("concept must not be blank")
    return normalized[:80].strip()


class AnalyzeRequest(StrictModel):
    subject: str = Field(min_length=1, max_length=100)
    topic: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=2000)


class Gap(StrictModel):
    concept: str = Field(min_length=1)
    severity: Literal["low", "medium", "high"] = "medium"

    @field_validator("concept")
    @classmethod
    def clean_concept(cls, value: str) -> str:
        return normalize_concept(value)


class GapList(StrictModel):
    gaps: list[Gap] = Field(default_factory=list)


class AnalyzeResponse(StrictModel):
    answer: str = Field(min_length=1)
    gaps: list[Gap]


class LearningGap(StrictModel):
    concept: str = Field(min_length=1)
    severity: Literal["low", "medium", "high"]
    occurrences: int = Field(ge=1)
    days_since_last_seen: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("concept")
    @classmethod
    def clean_concept(cls, value: str) -> str:
        return normalize_concept(value)


class LearningPlanRequest(StrictModel):
    gaps: list[LearningGap] = Field(max_length=50)
    limit: int = Field(default=5, ge=1, le=10)


class RankedGap(StrictModel):
    concept: str = Field(min_length=1)
    severity: Literal["low", "medium", "high"]
    occurrences: int = Field(ge=1)
    priority: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("concept")
    @classmethod
    def clean_concept(cls, value: str) -> str:
        return normalize_concept(value)


class PlanTip(StrictModel):
    concept: str = Field(min_length=1)
    tip: str = Field(min_length=1)
    practice_question: str = Field(min_length=1)

    @field_validator("concept")
    @classmethod
    def clean_concept(cls, value: str) -> str:
        return normalize_concept(value)

    @field_validator("tip")
    @classmethod
    def limit_tip_words(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("tip must not be blank")
        if len(value.split()) > 30:
            raise ValueError("tip must be at most 30 words")
        return value

    @field_validator("practice_question")
    @classmethod
    def clean_practice_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("practice_question must not be blank")
        return value


class LearningTips(StrictModel):
    items: list[PlanTip] = Field(max_length=10)


class LearningPlanResponse(StrictModel):
    ranked: list[RankedGap]
    plan: list[PlanTip]
