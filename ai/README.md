# Travel Intelligence — the AI tree

Everything about training a model lives here. Nothing here runs in production: the backend calls a
model over HTTP, and what this directory produces is *which* model it calls.

```
ai/
├── dataset/
│   ├── examples.jsonl      <- the one you edit
│   ├── train.jsonl         <- generated, do not edit
│   ├── validation.jsonl    <- generated
│   └── test.jsonl          <- generated
├── build_dataset.py        <- examples.jsonl -> the three files above
├── run_baseline.py         <- state B through the HF router, when credits allow
├── evaluation/
│   └── test_cases.json     <- how to tell whether fine-tuning helped
├── notebooks/
│   └── travel_ai_finetune.ipynb   <- A / B / C, LoRA, merge, download
└── README.md
```

## The three kinds of knowledge, and where each one lives

This is the single most important idea, and getting it wrong wastes a training run:

| Knowledge | Lives in | Why |
|---|---|---|
| **How to answer** — format, voice, when to ask back | fine-tuned adapter | stable, worth baking in |
| **What is true about the world** — places, seasons | base model + APIs | changes; would go stale in an adapter |
| **Who you are** — visited, wishlist, trips | database, injected at chat time | changes daily |

Do not put travel facts in the dataset. Put *behaviour* in it.

## Why `build_dataset.py` exists

It prepends a system prompt from `backend/app/ai/prompts.py` to every example, by importing the
real constant rather than copying it.

Training and inference must show the model the same system message. If the dataset teaches one
format while the running backend sends a different one, they fight and the fine-tuned model ends up
worse than the base model. Importing makes that drift impossible: edit the prompt in one place, run
`python build_dataset.py`, and both sides move together.

### There are two prompts, and the dataset uses the short one

| Constant | Size | For |
|---|---|---|
| `SYSTEM_PROMPT` | ~1900 chars | a large hosted model that was never trained on this format |
| `TUNED_SYSTEM_PROMPT` | ~210 chars | the dataset, and any model fine-tuned on it |

**This split came out of a measurement, not a preference.** Swept against Qwen3-0.6B, the long
prompt did not instruct the model - it gave it something to copy. The prompt's own example
sentence ("Dense rail links make a base-and-radiate trip work...") came back verbatim as the answer
to a question about food in Osaka. `PARAMETERS REQUIRED` appeared in nine answers out of ten,
including ones where nothing was missing, because it was the most prominent phrase in the prompt.
The live-facts rules were ignored: it invented a nightly hotel rate and asserted that a flight
route did not exist.

A small model does not execute prose instructions; it reaches for the nearest pattern. Fine-tuning
is how the format stops being prose and becomes weights — so a model trained here needs a prompt
that identifies its role and nothing more.

**A model trained against the short prompt must be served with the short prompt.** That is the same
train/inference rule as above, and it is the reason `client.py` will need to know which model it is
talking to once a fine-tuned one is deployed.

It also splits 80/10/10 with a fixed seed, so a rebuild never silently moves an example from test
into train and invalidates every comparison made before it.

```bash
cd ai
python build_dataset.py
```

## Writing examples

Edit `dataset/examples.jsonl`. One JSON object per line:

```json
{"category": "clarification", "messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

Only `user` and `assistant`, in that order. The system turn is added by the build script — writing
it by hand is rejected with an error, because two copies of a system prompt is exactly the drift
this design removes.

**The fastest way to write a good example is not to write it.** Chat at `/intel` with the base
model, copy an answer that is nearly right, fix it into the answer you actually wanted, and save
that as the example. You are marking work rather than inventing it, and the questions come from
what you genuinely ask.

### The format every assistant answer follows

5–12 lines. UPPERCASE headers. No preamble, no emoji, no closing summary.

```
DESTINATION ANALYSIS

REGION        Kansai, Japan
BEST WINDOW   Late March, early November
INTENSITY     MEDIUM

WHY
Dense rail links make a base-and-radiate trip work without repacking.

ROUTE
Osaka -> Kyoto -> Nara
```

### The schema is mechanical, and that matters more than it looks

The first version of this dataset was hand-typed and came out ragged: value columns at 8, 12, 14
and 15, and nineteen different heading tokens. The model reproduced exactly that — inconsistent
layout is not a model weakness when the training data is inconsistent, it is the model working.

The rule now, and it is checkable:

- One heading, UPPERCASE, alone on its line, then a blank line.
- Label lines: UPPERCASE label, value starts at **column 15** (label padded to 14).
- Blocks separated by one blank line.
- Closed heading vocabulary — 8 openers, 6 sub-blocks, nothing else.

Openers: `TRAVEL ANALYSIS` · `DESTINATION ANALYSIS` · `COMPARISON` · `ITINERARY` ·
`BUDGET ESTIMATE` · `PARAMETERS REQUIRED` · `LIVE DATA REQUIRED` · `OUT OF SCOPE`

Sub-blocks: `WHY` · `ROUTE` · `RECOMMENDATION` · `NOTE` · `WHAT I CAN SAY` · `NEXT STEP`

Check alignment after editing — every value should land in one column:

```bash
python - <<'EOF'
import json, pathlib, collections
cols = collections.Counter()
for line in pathlib.Path("dataset/examples.jsonl").read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    for row in json.loads(line)["messages"][1]["content"].split("
"):
        parts = row.split("  ", 1)
        if len(parts) == 2 and parts[0].isupper() and parts[0].strip() and not row.startswith(" "):
            cols[len(row) - len(parts[1].lstrip())] += 1
print(cols)   # want a single key: 14
EOF
```

### Category mix

The 20 starter examples are distributed like this. Keep roughly these proportions as you grow the
set — a dataset that is 80% itineraries produces a model that turns every question into an
itinerary.

| Category | Count | Teaches |
|---|---|---|
| `clarification` | 8 | ask back **and nothing else** — the hardest behaviour to get |
| `live_data` | 6 | refuse live facts without hedging into a claim |
| `itinerary` | 4 | day-by-day structure |
| `analysis` | 4 | the default answer shape |
| `comparison` | 3 | commit to a recommendation |
| `budget` | 2 | structure without inventing numbers |
| `style` | 2 | react to a stated preference |
| `out_of_scope` | 1 | stay in character |

The first two are twice the size of the rest because a baseline sweep said so, not because the
proportions looked nice. State B failed in exactly those two places: it answered underspecified
requests with a clarification block *and* an invented destination stapled underneath, and its
live-data refusals drifted into hedged assertions. Grow the category the evidence points at.

## Growing the set

```
20 examples  ->  ask: "if the model learned exactly these, would it be what I want?"
             ->  100-200  ->  train  ->  evaluate  ->  fix the weak category  ->  retrain
```

Quality over quantity. 100 varied examples beat 1000 near-duplicates, and near-duplicates actively
teach the model to repeat itself.

## Evaluating

`evaluation/test_cases.json` holds prompts the model has never trained on. Run each against three
states and compare by hand:

| State | What it is |
|---|---|
| **A** — base | `Qwen/Qwen3-0.6B`, no system prompt |
| **B** — base + prompt | what `/intel` runs today |
| **C** — fine-tuned | base + your LoRA adapter |

**Run B and record its answers before training anything.** Without that baseline you cannot tell
whether fine-tuning helped, and the honest possibility is that B is already good enough — a system
prompt is free and an adapter is not.

Judge on: format compliance · does it ask back when it should · does it refuse live facts ·
does it stay in the tactical register.

## Training (Colab)

Base model for V1 is `Qwen/Qwen3-0.6B`. The goal is **a pipeline that runs end to end**, not a good
model — a 0.6B model will produce mediocre travel advice and that is fine at this stage. Move up to
1.7B or 4B once every step works.

`notebooks/travel_ai_finetune.ipynb` runs the whole thing: baseline A and B **before** training,
LoRA with the base model frozen, state C on the same prompts, an A/B/C comparison, then a merged
model zipped for download.

### The Qwen3 thinking trap — measured, not assumed

Qwen3's reasoning mode is **on by default**, and this was probed against the real router on
2026-08-22:

| Model | Served? | Thinking |
|---|---|---|
| `Qwen/Qwen3-0.6B`, `-1.7B`, `-4B` | no provider | — |
| `Qwen/Qwen3-8B`, `-14B`, `-32B` | yes | **always on, cannot be disabled from the request** |
| `meta-llama/Llama-3.1-8B-Instruct` | yes | no |
| `Qwen/Qwen2.5-72B-Instruct` | yes | no |

`chat_template_kwargs: {"enable_thinking": false}` is accepted by the router and **ignored**. The
reasoning consumes most of `max_tokens` and the visible answer arrives truncated.

Running the model yourself is what gives that control back:
`apply_chat_template(..., enable_thinking=False)` genuinely turns it off.

**Consequence for training**: our dataset contains no reasoning blocks, so the notebook
pre-formats the conversations into a `text` column with `enable_thinking=False` rather than handing
raw `messages` to `SFTTrainer`. That is deliberate — the trainer's own templating would apply
Qwen3's thinking-on default, and the dataset would stop matching what evaluation and the backend
do. Print one formatted example and check for a `<think>` block before training.

## Integrating the result

**The obvious route does not work, and knowing why saves a wasted afternoon.** Setting
`HF_MODEL=<your-username>/travel-intelligence` and restarting is the plan this README originally
carried — but the probe above found that serverless providers do not serve small models *at all*,
including the unmodified `Qwen/Qwen3-0.6B`. A private fine-tune of one is not going to fare better.

Three real options:

| Option | Cost | Notes |
|---|---|---|
| **Run it locally** | free | the chosen route — see below |
| HF Inference Endpoint | per hour | a private deployment; scale-to-zero keeps it cheap |
| Skip deploying it | free | keep `/intel` on a large hosted model, treat the fine-tune as the exercise it is |

### Running it locally

The notebook merges the adapter into the base weights and hands you one self-contained folder.
`backend/app/ai/client.py` speaks the OpenAI chat-completions shape, so any local server offering
that endpoint drops in: point `HF_ROUTER_URL` at it and set `HF_MODEL` to the local model name.

Two things to carry across:

1. **Keep `enable_thinking=False` on the serving side.** Everything in the notebook assumes it. A
   server that restores Qwen3's default will emit reasoning blocks the console renders as noise.
2. **The `/intel` console needs no change at all.** That is what building the backend before the
   dataset bought.
