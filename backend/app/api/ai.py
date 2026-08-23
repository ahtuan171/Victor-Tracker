"""`POST /ai/chat` — the Travel Intelligence conversation endpoint.

Authenticated, like every other route here: there is one owner, the token names them, and an
unauthenticated caller would be spending the owner's inference quota.

The conversation is stateless on this side. The console sends the whole exchange each time and the
backend prepends the system prompt, which means no conversation table, no session id, and no
cleanup job — and reloading the page starts fresh, which is the honest behaviour for something
that keeps no history.
"""

from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.ai.client import AIError, complete
from app.ai.context import build_travel_context
from app.ai.prompts import SYSTEM_PROMPT
from app.auth import CurrentCreator
from app.db import SessionDep
from app.schemas import ErrorResponse

router = APIRouter(prefix="/ai", tags=["ai"])

# Long enough for a real exchange, bounded so a runaway client cannot push an unbounded prompt
# (and an unbounded bill) upstream.
MAX_TURNS = 40
MAX_MESSAGE_CHARS = 4000


class ChatMessage(BaseModel):
    """One turn. `system` is deliberately not an accepted role — the personality is decided here,
    not by the caller."""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_TURNS)


class ChatResponse(BaseModel):
    reply: str


@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={
        401: {"model": ErrorResponse, "description": "No valid token."},
        422: {"model": ErrorResponse, "description": "Request failed validation."},
        502: {"model": ErrorResponse, "description": "The model provider failed."},
    },
    summary="Send a conversation, get the analyst's reply",
)
async def chat(body: ChatRequest, session: SessionDep, _creator: CurrentCreator) -> ChatResponse:
    """Prepend the system prompt and the owner's travel profile, forward, return the text.

    The profile is what separates this from a travel chatbot: without it the model can reason about
    places in general, and with it the model can answer "where should I go next" against somewhere
    the owner has actually been.

    **It is rebuilt per request rather than cached.** The data changes whenever a pin is dropped,
    and a cache would answer tomorrow's question with yesterday's map for no measurable saving -
    two small queries against a database holding one person's travel.

    **What it may contain is decided in `context.py`, by which columns it selects.** Notes and
    photographs are never read there, so they cannot reach this string. See that module's docstring
    for why the exclusion is expressed as a query rather than as a filter.

    `AIError` becomes a 502 with its message intact rather than a generic one: every case it
    covers is something the owner can act on - a missing variable, a wrong model name, a rejected
    token - and hiding that behind "Bad Gateway" would mean reading server logs to configure a
    personal tool.
    """
    profile = build_travel_context(session)
    system_prompt = "\n\n".join([SYSTEM_PROMPT, profile]) if profile else SYSTEM_PROMPT

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend({"role": m.role, "content": m.content} for m in body.messages)

    try:
        reply = await complete(messages)
    except AIError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return ChatResponse(reply=reply)


__all__ = ["router"]
