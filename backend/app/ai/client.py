"""The one place that talks to Hugging Face.

`httpx2` against the OpenAI-compatible router endpoint rather than the `huggingface_hub`
`InferenceClient`: the router speaks a shape this project already knows, it adds no dependency
(httpx2 is already here for Nominatim), and it keeps mypy's `disallow_any_unimported` happy
without chasing stubs for an SDK used for exactly one call.

Async because a model round trip is seconds, not milliseconds, and a sync call would hold a
threadpool worker for the whole of it.
"""

import re
from typing import Any

import httpx2 as httpx

from app.config import get_settings

# The endpoint, the key and the model all come from settings — see `app/config.py` for why they are
# provider-neutral rather than Hugging Face specific. Anything speaking the OpenAI chat-completions
# shape works here: HF's router, Groq, OpenRouter, a local llama.cpp or Ollama server.

# Generous: a cold provider plus a long generation. The frontend shows a working state for the
# duration, so the cost of waiting is visible rather than mysterious.
TIMEOUT_SECONDS = 120.0


class AIError(Exception):
    """Raised when the provider cannot be reached, refuses the request, or answers with a body
    this module cannot read.

    One exception type for every upstream failure: the route turns it into a 502 with the message
    intact, and the console renders that message. A caller never needs to tell the failures apart —
    they all mean "no answer this time".
    """


def _require_config() -> tuple[str, str, str]:
    """Key, model and endpoint, or a message naming exactly what is missing.

    The same shape as the R2 settings check: an unconfigured provider fails with an instruction,
    not with a stack trace from inside an HTTP library.
    """
    settings = get_settings()
    missing = [
        name
        for name, value in (
            ("AI_API_KEY", settings.ai_api_key),
            ("AI_MODEL", settings.ai_model),
            ("AI_BASE_URL", settings.ai_base_url),
        )
        if not value.strip()
    ]
    if missing:
        raise AIError(
            "Travel Intelligence is not configured. Set "
            + " and ".join(missing)
            + " in the repository .env, then restart the backend."
        )
    return settings.ai_api_key, settings.ai_model, settings.ai_base_url


def _extract_content(payload: Any) -> str:
    """Pull the assistant message out of a chat-completions body, defensively.

    Providers behind the router are not uniform, and a malformed body should surface as an AIError
    the console can show rather than a KeyError in the server log.
    """
    if not isinstance(payload, dict):
        raise AIError("The model provider returned an unexpected response body.")

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        error = payload.get("error")
        if error:
            raise AIError(f"The model provider refused the request: {error}")
        raise AIError("The model provider returned no completion.")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = message.get("content") if isinstance(message, dict) else None

    if isinstance(content, str):
        # Strip internal <think>...</think> tags if the provider includes them inside content
        content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    if not isinstance(content, str) or not content.strip():
        # Measured 2026-08-22: Qwen / thinking models run with reasoning mode on.
        # The reasoning lands in `reasoning` or `reasoning_content` and eats the token budget.
        reasoning = (
            message.get("reasoning_content") or message.get("reasoning")
            if isinstance(message, dict)
            else None
        )
        if isinstance(reasoning, str) and reasoning.strip():
            raise AIError(
                "The model spent its whole token budget on internal reasoning and returned no "
                "answer. Set AI_MODEL to a non-thinking model or raise max_tokens."
            )
        raise AIError("The model returned an empty completion.")

    return content.strip()


async def complete(messages: list[dict[str, str]], *, max_tokens: int = 2048) -> str:
    """Send a conversation, return the assistant's reply as text.

    `messages` is already in provider shape — `{"role": ..., "content": ...}` — because the caller
    is the only place that decides what a conversation contains, and translating twice would put
    that decision in two files.
    """
    token, model, base_url = _require_config()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                base_url,
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    # Low but not zero: the voice should be consistent between runs without the
                    # answers becoming identical boilerplate.
                    "temperature": 0.4,
                },
            )
    except httpx.TimeoutException as exc:
        raise AIError(
            f"The model provider did not answer within {int(TIMEOUT_SECONDS)} seconds."
        ) from exc
    except httpx.HTTPError as exc:
        raise AIError(f"Could not reach the model provider: {exc}") from exc

    if response.status_code == 401:
        raise AIError(f"{base_url} rejected AI_API_KEY. Check the key and its permissions.")
    if response.status_code == 404:
        raise AIError(
            f"The provider at {base_url} does not serve '{model}'. Pick a different AI_MODEL, or "
            "point AI_BASE_URL at a provider that has it."
        )
    if response.status_code >= 400:
        raise AIError(f"The model provider answered {response.status_code}: {response.text[:300]}")

    try:
        payload: Any = response.json()
    except ValueError as exc:
        raise AIError("The model provider answered with something that is not JSON.") from exc

    return _extract_content(payload)


__all__ = ["AIError", "complete"]
