"""Local LLM access -- gemma4:12b via Ollama.

Two guarantees the rest of the app relies on:
  1. Everything degrades gracefully. If Ollama is down, callers get None and
     use their deterministic template path.
  2. The numeral guard. A finance assistant that invents a figure is worse than
     one that says nothing, so any generated text containing a number absent
     from the grounding context is rejected outright.
"""
import json
import os
import re

import requests

# Local Ollama by default. Set OLLAMA_HOST=https://ollama.com and
# OLLAMA_API_KEY=<key> to run against Ollama Cloud instead -- which is what a
# deployed backend needs, since it has no GPU and no local model.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "").strip()
MODEL_NAME = os.environ.get(
    "GLIDE_MODEL",
    "gemma4:31b-cloud" if OLLAMA_API_KEY else "gemma4:12b",
)

IS_CLOUD = bool(OLLAMA_API_KEY)

GENERATE_URL = f"{OLLAMA_HOST}/api/generate"
CHAT_URL = f"{OLLAMA_HOST}/api/chat"
TAGS_URL = f"{OLLAMA_HOST}/api/tags"

DEFAULT_TIMEOUT = 120


def _headers():
    headers = {}
    if OLLAMA_API_KEY:
        headers["Authorization"] = f"Bearer {OLLAMA_API_KEY}"
    return headers


def is_available() -> bool:
    # On Ollama Cloud there is no local tag list to consult; a key is the
    # only precondition, and a failed call degrades to the rule engine anyway.
    if IS_CLOUD:
        return True
    try:
        response = requests.get(TAGS_URL, timeout=3)
        if response.status_code != 200:
            return False
        models = [m.get("name", "") for m in response.json().get("models", [])]
        return any(m.startswith(MODEL_NAME.split(":")[0]) for m in models)
    except requests.RequestException:
        return False


def model_status() -> dict:
    if IS_CLOUD:
        return {
            "available": True,
            "model": MODEL_NAME,
            "host": OLLAMA_HOST,
            "mode": "cloud",
            "installed_models": [MODEL_NAME],
        }
    try:
        response = requests.get(TAGS_URL, timeout=3)
        response.raise_for_status()
        models = response.json().get("models", [])
        match = next((m for m in models if m.get("name") == MODEL_NAME), None)
        return {
            "available": match is not None,
            "model": MODEL_NAME,
            "host": OLLAMA_HOST,
            "installed_models": [m.get("name") for m in models],
            "parameter_size": (match or {}).get("details", {}).get("parameter_size"),
        }
    except requests.RequestException as exc:
        return {"available": False, "model": MODEL_NAME, "host": OLLAMA_HOST, "error": str(exc)}


# ---------------------------------------------------------------------------
# Numeral guard
# ---------------------------------------------------------------------------

_NUMBER_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numerals(text: str):
    found = set()
    for raw in _NUMBER_RE.findall(text or ""):
        cleaned = raw.replace(",", "").rstrip(".")
        if not cleaned:
            continue
        try:
            value = float(cleaned)
        except ValueError:
            continue
        # Normalise so "8,000", "8000" and "8000.0" compare equal.
        found.add(round(value, 2))
    return found


def numerals_are_grounded(generated: str, context: str) -> bool:
    """True when every figure in `generated` also appears in `context`."""
    allowed = _numerals(context)
    # Small integers are ordinary prose ("3 days", "2 of them"), not claims.
    for value in _numerals(generated):
        if value in allowed:
            continue
        if value <= 100 and float(value).is_integer():
            continue
        # Percentages derived from grounded figures are acceptable.
        if value <= 100:
            continue
        return False
    return True


# ---------------------------------------------------------------------------
# Generation helpers
# ---------------------------------------------------------------------------

def _generate(prompt: str, system: str = "", temperature: float = 0.2, timeout: int = DEFAULT_TIMEOUT):
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        # gemma4 is a thinking model. Left on, reasoning tokens eat the whole
        # num_predict budget and the answer comes back empty -- and we do not
        # want its deliberation anyway, only the grounded sentence.
        "think": False,
        "options": {"temperature": temperature, "num_predict": 420},
    }
    if system:
        payload["system"] = system
    try:
        response = requests.post(GENERATE_URL, json=payload, headers=_headers(), timeout=timeout)
        response.raise_for_status()
        return (response.json().get("response") or "").strip()
    except requests.RequestException as exc:
        print(f"[llm] generate failed: {exc}")
        return None


def chat(messages, system: str = "", temperature: float = 0.3, timeout: int = DEFAULT_TIMEOUT):
    payload = {
        "model": MODEL_NAME,
        "messages": ([{"role": "system", "content": system}] if system else []) + messages,
        "stream": False,
        "think": False,          # see _generate -- keep the answer, drop the deliberation
        "options": {"temperature": temperature, "num_predict": 500},
    }
    try:
        response = requests.post(CHAT_URL, json=payload, headers=_headers(), timeout=timeout)
        response.raise_for_status()
        return (response.json().get("message") or {}).get("content", "").strip()
    except requests.RequestException as exc:
        print(f"[llm] chat failed: {exc}")
        return None


def strip_think(text: str) -> str:
    """gemma4 supports thinking; keep only the answer."""
    if not text:
        return text
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"^\s*(?:thinking|thought)\s*:.*?$", "", text, flags=re.MULTILINE | re.IGNORECASE)
    return text.strip()


# ---------------------------------------------------------------------------
# Task-specific entry points
# ---------------------------------------------------------------------------

def polish_insight(title: str, body: str, reasoning: str):
    """Rephrase an insight without changing a single figure."""
    system = (
        "You rewrite personal-finance notifications for an Indian audience. "
        "Rules: keep every number EXACTLY as given, invent nothing, stay under 45 words, "
        "plain direct English, no emoji, no greeting, no markdown."
    )
    prompt = (
        f"Rewrite this alert to be clearer and calmer.\n\n"
        f"Title: {title}\nCurrent text: {body}\nUnderlying calculation: {reasoning}\n\n"
        f"Rewritten text only:"
    )
    output = strip_think(_generate(prompt, system=system, temperature=0.25, timeout=60) or "")
    if not output:
        return None
    output = output.strip().strip('"')
    if len(output) > 400 or len(output) < 20:
        return None
    if not numerals_are_grounded(output, f"{title} {body} {reasoning}"):
        print("[llm] insight rejected by numeral guard")
        return None
    return output


def extract_transaction_from_sms(sms_text: str):
    """LLM-assisted extraction, used only when the regex parser abstains."""
    system = (
        "You extract structured data from Indian bank and UPI SMS alerts. "
        "Reply with raw JSON only -- no markdown fences, no commentary."
    )
    prompt = (
        "Extract the transaction from this SMS. If it is promotional, an OTP, a "
        'reminder, or a failed transaction, reply exactly {"ok": false}.\n\n'
        "Schema:\n"
        '{"ok": true, "amount": 0.0, "direction": "CREDIT|DEBIT", "merchant": "string", '
        '"category": "Food|Transport|Shopping|Bills|Entertainment|Rent|Investment|Health|'
        'Education|Salary|Income|Transfer|Other"}\n\n'
        f'SMS: "{sms_text}"\n\nJSON:'
    )
    raw = strip_think(_generate(prompt, system=system, temperature=0.05, timeout=60) or "")
    if not raw:
        return None
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not data.get("ok"):
        return None
    try:
        data["amount"] = float(data.get("amount") or 0)
    except (TypeError, ValueError):
        return None
    if data["amount"] <= 0 or data.get("direction") not in ("CREDIT", "DEBIT"):
        return None
    return data
