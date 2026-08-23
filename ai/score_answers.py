"""Mechanical scoring of a sweep, so A/B/C is a number rather than an impression.

Reading thirty answers by eye across three states is the fastest way to talk yourself into a
result. These checks are exactly what the dataset teaches, so if training worked, they move.

**Nothing here scores travel knowledge.** That is deliberate: fine-tuning teaches behaviour, and a
0.6B model will keep putting Kinkaku-ji in Tokyo whatever the dataset says. Scoring facts would
mix an unfixable problem into the measurement of a fixable one.

Used by the notebook, and importable on its own:

    from score_answers import report
    report("B", results, TEST_CASES)
"""

import re

OPENERS = {
    "TRAVEL ANALYSIS",
    "DESTINATION ANALYSIS",
    "COMPARISON",
    "ITINERARY",
    "BUDGET ESTIMATE",
    "PARAMETERS REQUIRED",
    "LIVE DATA REQUIRED",
    "OUT OF SCOPE",
}

# A price with a unit. Catches "¥25,000", "10-25 thousand yen", "$40 per night".
MONEY = re.compile(r"[¥$€£]\s?\d|\d[\d,.]*\s?(yen|usd|dollars|euros|thousand)", re.I)

# Assertions about the live world, including the hedged kind. "usually available" is still a claim.
ASSERTS = re.compile(
    r"\b(are available|is available|no flights|are no flights|will be on schedule"
    r"|is open|usually|typically costs|should be)\b",
    re.I,
)

# A label line: uppercase label, two or more spaces, then a value.
LABEL = re.compile(r"^[A-Z][A-Z0-9 ]*[A-Z0-9] {2,}\S")

MARKDOWN = re.compile(r"\*\*|^\s*[-*] |^#", re.M)

VALUE_COLUMN = 14


def score_answer(case_id: str, text: str) -> dict[str, bool]:
    """Five checks, plus one that depends on what the case is testing."""
    lines = [line.rstrip() for line in text.strip().splitlines()]
    body = [line for line in lines if line.strip()]

    checks: dict[str, bool] = {}
    checks["heading"] = bool(body) and body[0].strip() in OPENERS

    # `has_labels`, not "every value sits in column 15".
    #
    # The strict column check was dropped after measuring what it actually rejected. A fine-tuned
    # Qwen3-0.6B produced columns of 14, 15, 16 and 17 across cases - and in one answer, 14 on the
    # first line and 15 on the three below it, so the lines did not even align with each other.
    # Another reached for a TAB character. Counting spaces requires the model to reason about
    # whitespace the tokenizer merges away; it can only reproduce spacing it has memorised.
    #
    # It is also the wrong layer. `IntelConsole` renders in a monospace whitespace-pre-wrap block
    # and can align columns in CSS for free. Spending training data on something the stylesheet
    # does better is the definition of a badly chosen requirement.
    labels = [line for line in lines if LABEL.match(line)]
    checks["has_labels"] = bool(labels)

    checks["no_markdown"] = not MARKDOWN.search(text)
    checks["length"] = len(body) <= 12

    if case_id.startswith("clarify"):
        # The highest-priority behaviour: ask, and do not staple a guess underneath.
        others = {line.strip() for line in body if line.strip() in OPENERS} - {
            "PARAMETERS REQUIRED"
        }
        checks["asks_only"] = (
            bool(body) and body[0].strip() == "PARAMETERS REQUIRED" and not others
        )
    elif case_id.startswith("live-data"):
        checks["refuses"] = (
            bool(body)
            and body[0].strip() == "LIVE DATA REQUIRED"
            and not MONEY.search(text)
            and not ASSERTS.search(text)
        )

    return checks


def report(state: str, results: dict, test_cases: list) -> None:
    """Print a per-case grid and a per-check total for one state."""
    answers = results.get(state, {})
    if not answers:
        print(f"state {state}: not run")
        return

    totals: dict[str, int] = {}
    passed: dict[str, int] = {}

    print(f"===== STATE {state} =====")
    for case in test_cases:
        case_id = case["id"]
        checks = score_answer(case_id, answers.get(case_id, ""))
        marks = "".join("o" if value else "." for value in checks.values())
        failed = " ".join(name for name, value in checks.items() if not value)
        print(f"  {case_id:<14} {marks:<6}  {failed}")
        for name, value in checks.items():
            totals[name] = totals.get(name, 0) + 1
            passed[name] = passed.get(name, 0) + (1 if value else 0)

    print()
    for name in totals:
        print(f"  {name:<12} {passed[name]:>2}/{totals[name]}")
    print()
