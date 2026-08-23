"""Turn `dataset/examples.jsonl` into the three files a training run reads.

Run it from `ai/`:

    python build_dataset.py

Two jobs, and the first one is the reason this script exists rather than the files being
hand-maintained:

1. **Prepend the system prompt from `backend/app/ai/prompts.py`.** Training and inference must show
   the model the same system message. If the dataset teaches one format while the running backend
   sends a different system prompt, the two fight and the fine-tuned model is worse than the base
   one. Importing the real constant makes drift impossible — edit the prompt in one place and
   rebuild.

2. **Split 80/10/10**, deterministically, so a rebuild does not silently move an example from test
   into train and quietly invalidate every comparison made against the old split.

The `category` key on each example is metadata for humans and is stripped before writing: TRL's
conversational format expects `messages` and nothing else.
"""

import json
import random
import sys
from pathlib import Path

AI_DIR = Path(__file__).resolve().parent
REPO_ROOT = AI_DIR.parent
DATASET_DIR = AI_DIR / "dataset"
SOURCE = DATASET_DIR / "examples.jsonl"

# Fixed so the split is reproducible. Changing it reshuffles which examples the model has never
# seen, which makes every earlier evaluation number incomparable.
SEED = 42

# 80 / 10 / 10, with a floor of one example each so a small dataset still produces three files.
VALIDATION_FRACTION = 0.1
TEST_FRACTION = 0.1


def load_system_prompt() -> str:
    """Read the live system prompt out of the backend package.

    Imported rather than copied. A copy is a second source of truth, and this is precisely the kind
    of duplicated claim that goes stale without anything failing.

    **The SHORT prompt, deliberately.** `SYSTEM_PROMPT` describes the format in 1900+ characters
    for the benefit of a large hosted model that was never trained on it. A model being fine-tuned
    here does not need that description - the format is what the training is putting into its
    weights - and a small model demonstrably cannot use it anyway: swept against Qwen3-0.6B, the
    long prompt produced answers that copied its example sentence verbatim and stamped
    PARAMETERS REQUIRED onto requests that were not missing anything.

    A model trained against this prompt must be **served** with this prompt. Training and inference
    showing the model different system messages is the drift this whole module exists to prevent.
    """
    sys.path.insert(0, str(REPO_ROOT / "backend"))
    try:
        from app.ai.prompts import TUNED_SYSTEM_PROMPT
    except ImportError as exc:  # pragma: no cover - a path problem, not a logic one
        raise SystemExit(
            f"Could not import the system prompt from {REPO_ROOT / 'backend'}: {exc}"
        ) from exc
    return TUNED_SYSTEM_PROMPT


def load_examples() -> list[dict[str, object]]:
    """Read and validate every line. A malformed dataset should fail here, not inside a GPU run."""
    if not SOURCE.exists():
        raise SystemExit(f"No source dataset at {SOURCE}")

    examples: list[dict[str, object]] = []
    for number, line in enumerate(SOURCE.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped:
            continue

        try:
            record = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{SOURCE}:{number} is not valid JSON: {exc}") from exc

        messages = record.get("messages")
        if not isinstance(messages, list) or len(messages) < 2:
            raise SystemExit(f"{SOURCE}:{number} needs a `messages` list of at least two turns.")

        roles = [m.get("role") for m in messages if isinstance(m, dict)]
        if roles != ["user", "assistant"]:
            raise SystemExit(
                f"{SOURCE}:{number} must be exactly [user, assistant]; found {roles}. "
                "The system turn is added by this script, not written by hand."
            )

        for turn in messages:
            content = turn.get("content") if isinstance(turn, dict) else None
            if not isinstance(content, str) or not content.strip():
                raise SystemExit(f"{SOURCE}:{number} has an empty message.")

        examples.append(record)

    if not examples:
        raise SystemExit(f"{SOURCE} contains no examples.")
    return examples


def write_split(path: Path, records: list[dict[str, object]], system_prompt: str) -> None:
    """Write one JSONL file, system turn first, `category` stripped."""
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            messages = [{"role": "system", "content": system_prompt}]
            raw_messages = record["messages"]
            assert isinstance(raw_messages, list)
            messages.extend(raw_messages)
            handle.write(json.dumps({"messages": messages}, ensure_ascii=False) + "\n")


def main() -> None:
    system_prompt = load_system_prompt()
    examples = load_examples()

    counts: dict[str, int] = {}
    for record in examples:
        category = str(record.get("category", "uncategorised"))
        counts[category] = counts.get(category, 0) + 1

    shuffled = list(examples)
    random.Random(SEED).shuffle(shuffled)

    total = len(shuffled)
    n_validation = max(1, round(total * VALIDATION_FRACTION))
    n_test = max(1, round(total * TEST_FRACTION))
    if n_validation + n_test >= total:
        raise SystemExit(f"{total} examples is too few to split. Write more before building.")

    test = shuffled[:n_test]
    validation = shuffled[n_test : n_test + n_validation]
    train = shuffled[n_test + n_validation :]

    write_split(DATASET_DIR / "train.jsonl", train, system_prompt)
    write_split(DATASET_DIR / "validation.jsonl", validation, system_prompt)
    write_split(DATASET_DIR / "test.jsonl", test, system_prompt)

    print(f"source        {total} examples")
    for category, count in sorted(counts.items()):
        print(f"  {category:<14} {count}")
    print()
    print(f"train         {len(train)}")
    print(f"validation    {len(validation)}")
    print(f"test          {len(test)}")
    print()
    print(f"system prompt {len(system_prompt)} chars, prepended to every example")


if __name__ == "__main__":
    main()
