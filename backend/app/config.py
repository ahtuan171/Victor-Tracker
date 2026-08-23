"""Environment-backed settings.

Every value the app reads from outside itself lands here, so there is one place to look when a
deployment misbehaves and no `os.environ` calls scattered through the codebase.

The names match `.env.example` at the repository root; that file is the documentation for this one.
"""

from functools import lru_cache

from pydantic import AliasChoices, Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration read from the environment, or from a `.env` file in local development."""

    model_config = SettingsConfigDict(
        # `../.env` first because the repository keeps one .env at the root shared by both apps, and
        # backend commands run from `backend/`. A `backend/.env` still wins if someone wants to
        # override locally.
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        # Both apps read the same file, so it contains frontend variables this model knows nothing
        # about. Rejecting them would make the backend refuse to boot over a Next.js setting.
        extra="ignore",
        case_sensitive=False,
        # The AI settings below accept two spellings each (see their AliasChoices). Without this,
        # pydantic's mypy plugin reports them as "required dynamic aliases" even though all three
        # carry defaults.
        populate_by_name=True,
    )

    database_url: str = Field(
        min_length=1,
        description="SQLAlchemy URL, e.g. postgresql+psycopg://user:pass@host:5432/creatorhub",
    )

    jwt_secret: str = Field(
        # No default, anywhere. An app that boots with a guessable signing secret is worse than one
        # that refuses to boot: the failure is silent and the consequence is forged sessions.
        #
        # The length floor is what makes that real. `.env.example` ships `JWT_SECRET=` empty, so
        # without it an unedited copy would satisfy `str` and start happily.
        min_length=32,
        description="Signs the session JWT. Generate with: python -c "
        '"import secrets; print(secrets.token_urlsafe(48))"',
    )

    token_ttl_days: int = Field(
        default=30,
        gt=0,
        description=(
            "Session lifetime in days (FR-002a). Tokens slide on use — research.md R-002 — so this "
            "is also how long a leaked token stays valid: v0.1 has no denylist and no revocation."
        ),
    )

    frontend_origin: str = Field(
        default="http://localhost:3000",
        min_length=1,
        description=(
            "CORS allowlist. Defence in depth only. research.md R-008 makes the Next.js proxy "
            "allowlist the actual boundary, because no browser ever contacts this origin directly."
        ),
    )

    r2_account_id: str = Field(
        default="",
        description="Cloudflare account id for the R2 bucket holding trip photographs "
        "(003-travel-map).",
    )

    r2_access_key_id: str = Field(
        default="",
        description="R2 S3-compatible access key id. No code reads these yet — added at T001 so "
        "the names exist before T007's presigned-URL service reads them.",
    )

    r2_secret_access_key: str = Field(
        default="",
        description="R2 S3-compatible secret access key.",
    )

    r2_bucket_name: str = Field(
        default="",
        description="R2 bucket name. Photographs only, per tech-defaults.md's Object storage "
        "section.",
    )

    # ---------------------------------------------------------------------------
    # Travel Intelligence (Module 03)
    # ---------------------------------------------------------------------------
    # Three provider-neutral names, each accepting its original HF_-prefixed spelling as well, so an
    # existing .env keeps working. `AliasChoices` is what makes that true rather than a migration
    # note nobody reads.
    #
    # Neutral because `app/ai/client.py` speaks the OpenAI chat-completions shape, which many
    # providers implement — Hugging Face's router, Groq, OpenRouter, a local llama.cpp or Ollama
    # server. Switching between them is meant to be two lines of .env, not a code change. That
    # became concrete on 2026-08-23, when this account's Hugging Face inference credits ran out
    # mid-project and the endpoint was hardcoded.

    ai_base_url: str = Field(
        default="https://router.huggingface.co/v1/chat/completions",
        validation_alias=AliasChoices("ai_base_url", "hf_router_url"),
        description="Full chat-completions endpoint URL. Must be OpenAI-compatible — it receives "
        "{model, messages, max_tokens, temperature} and must answer with `choices[0].message`.",
    )

    ai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("ai_api_key", "hf_token"),
        description="Bearer token for the provider above. Empty means the AI module answers with a "
        "message naming this variable rather than failing obscurely.",
    )

    ai_model: str = Field(
        default="Qwen/Qwen2.5-72B-Instruct",
        validation_alias=AliasChoices("ai_model", "hf_model"),
        description="Model id sent to the provider. Must be one that provider actually serves, and "
        "preferably one without a forced reasoning mode — see app/ai/client.py.",
    )

    @field_validator("ai_base_url", "ai_model", mode="after")
    @classmethod
    def _blank_means_unset(cls, value: str, info: ValidationInfo) -> str:
        """An empty string falls back to the default instead of overriding it.

        `CLAUDE.md` records this trap from `FRONTEND_ORIGIN=""`, which overrode a default, failed
        `min_length=1`, and stopped the app booting. It reappears here through Docker:
        `docker-compose.yml` passes `AI_BASE_URL: ${AI_BASE_URL:-}`, so a host without that variable
        hands the container an empty one — and an empty endpoint would be reported as "not
        configured" while a perfectly good default sat one line above.

        `ai_api_key` is deliberately excluded: for a credential, blank genuinely does mean unset,
        and that is exactly what the AI module should refuse on.
        """
        if value.strip() or info.field_name is None:
            return value
        default = cls.model_fields[info.field_name].default
        return default if isinstance(default, str) else value


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings, constructed once.

    A function rather than a module-level instance: importing `app.config` must not be able to fail,
    or a missing variable surfaces as an import error from whichever module happened to be loaded
    first rather than as a startup error naming the variable. Cached because it is a FastAPI
    dependency and re-reading the environment per request buys nothing.
    """
    return Settings()
