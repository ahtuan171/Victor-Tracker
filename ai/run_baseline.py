"""Run every evaluation prompt against a model and record the answers.

This is state B of the three the README describes:

    A   base model, no system prompt
    B   base model + system prompt   <- what /intel runs today, and what this script measures
    C   base model + your LoRA adapter

**Run this before training anything.** Without B on paper you cannot tell whether fine-tuning
helped, and the honest possibility is that B is already good enough - a system prompt costs nothing
and an adapter costs a training run plus a deployment.

    python run_baseline.py                          # default model
    python run_baseline.py Qwen/Qwen3-8B            # try another
    python run_baseline.py --state a                # no system prompt, for the A/B contrast

Output goes to evaluation/baseline_<state>_<model>.md, one section per case, so two runs can be
diffed rather than remembered.

The file is rewritten after **every** case rather than once at the end. The first version wrote it
last, hit a 402 on case 10 of 10, and threw away nine perfectly good answers - which is exactly the
failure the free tier makes likely.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent
REPO_ROOT = AI_DIR.parent
CASES = AI_DIR / "evaluation" / "test_cases.json"
OUT_DIR = AI_DIR / "evaluation"

ROUTER_URL = "https://router.huggingface.co/v1/chat/completions"
DEFAULT_MODEL = "Qwen/Qwen2.5-72B-Instruct"
MAX_TOKENS = 800
TIMEOUT_SECONDS = 180


class CreditsExhausted(Exception):
    """The Hugging Face account is out of included inference credits for the month.

    Its own type because it is neither a defect nor a model problem: everything collected so far is
    still valid and must be written out rather than discarded with a stack trace.
    """


def read_env(name: str) -> str:
    """Read one variable out of the repository .env. Never printed - it is a credential."""
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        raise SystemExit(f"No .env at {env_file}")
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{name}="):
            return stripped.split("=", 1)[1].strip()
    raise SystemExit(f"{name} is not set in {env_file}")


def load_system_prompt() -> str:
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    from app.ai.prompts import SYSTEM_PROMPT

    return SYSTEM_PROMPT


def ask(model: str, token: str, system_prompt: str | None, question: str) -> tuple[str, str, int]:
    """Return (content, reasoning, completion_tokens)."""
    messages = []
    if system_prompt is not None:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": question})

    request = urllib.request.Request(
        ROUTER_URL,
        data=json.dumps(
            {
                "model": model,
                "messages": messages,
                "max_tokens": MAX_TOKENS,
                "temperature": 0.4,
            }
        ).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:300]
        if exc.code == 402:
            raise CreditsExhausted(detail) from exc
        raise SystemExit(f"{model} answered {exc.code}: {detail}") from exc

    message = payload["choices"][0]["message"]
    return (
        (message.get("content") or "").strip(),
        (message.get("reasoning_content") or "").strip(),
        payload.get("usage", {}).get("completion_tokens", 0),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", nargs="?", default=DEFAULT_MODEL)
    parser.add_argument(
        "--state",
        choices=["a", "b"],
        default="b",
        help="a = no system prompt, b = with it (default)",
    )
    args = parser.parse_args()

    token = read_env("HF_TOKEN")
    system_prompt = load_system_prompt() if args.state == "b" else None
    cases = json.loads(CASES.read_text(encoding="utf-8"))

    slug = args.model.replace("/", "_")
    out_path = OUT_DIR / f"baseline_{args.state}_{slug}.md"

    lines = [
        f"# Baseline {args.state.upper()} - {args.model}",
        "",
        f"System prompt: {'yes' if system_prompt else 'no'}  ",
        f"max_tokens: {MAX_TOKENS}  ",
        f"Cases: {len(cases)}",
        "",
        "Judge each answer on: format compliance, asks back when it should, refuses live facts,",
        "stays in the tactical register. Write the verdict under each one by hand.",
        "",
        "---",
        "",
    ]

    def flush() -> None:
        out_path.write_text("\n".join(lines), encoding="utf-8", newline="\n")

    flush()

    for index, case in enumerate(cases, start=1):
        question = case["input"]
        print(f"[{index}/{len(cases)}] {case['id']} ...", end="", flush=True)
        started = time.time()

        try:
            content, reasoning, tokens = ask(args.model, token, system_prompt, question)
        except CreditsExhausted as exc:
            print(" OUT OF CREDITS")
            lines.append(f"## {case['id']} - NOT RUN")
            lines.append("")
            lines.append(f"Stopped here: {exc}")
            lines.append("")
            flush()
            print()
            print(f"partial results written: {out_path.relative_to(REPO_ROOT)}")
            print(f"{index - 1} of {len(cases)} cases completed before the account ran out.")
            return

        elapsed = time.time() - started
        print(f" {elapsed:.1f}s, {tokens} tokens")

        lines.append(f"## {case['id']}")
        lines.append("")
        lines.append(f"**Prompt:** {question}")
        lines.append("")
        lines.append("**Expected behaviour:**")
        for behaviour in case["expected_behavior"]:
            lines.append(f"- {behaviour}")
        if case.get("note"):
            lines.append("")
            lines.append(f"> {case['note']}")
        lines.append("")
        lines.append(f"**Answer** ({tokens} tokens, {elapsed:.1f}s):")
        lines.append("")
        lines.append("```")
        lines.append(content if content else "(empty)")
        lines.append("```")
        if reasoning:
            lines.append("")
            lines.append(
                f"<sub>thinking mode produced {len(reasoning)} chars of hidden reasoning</sub>"
            )
        lines.append("")
        lines.append("**Verdict:** _(fill in)_")
        lines.append("")
        lines.append("---")
        lines.append("")
        flush()

    print()
    print(f"written: {out_path.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
