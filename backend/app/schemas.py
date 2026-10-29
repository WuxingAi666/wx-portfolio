from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class QuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=600)
    history: list[ChatMessage] = Field(default_factory=list, max_length=8)

    @field_validator("question")
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("问题不能为空")
        return value

    @model_validator(mode="after")
    def bounded_history(self):
        if sum(len(item.content) for item in self.history) > 6000:
            raise ValueError("历史对话过长，请开始新对话")
        return self


class Source(BaseModel):
    id: str
    title: str
    url: str
    excerpt: str
    similarity: float


class Answer(BaseModel):
    request_id: str
    answer: str
    sources: list[Source]
    grounded: bool
    elapsed_ms: int
