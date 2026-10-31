"""SilentShield backend: scores incoming calls and tells the Android app what to do.

POST /evaluate      -> {"action": "reject"|"silence"|"allow", "confidence_score": float, "reason": str}
GET  /flagged-calls -> silenced calls for the dashboard, newest first
POST /resolve       -> {"id": int, "resolution": "whitelist"|"block"}
GET  /health
"""

import itertools
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
LLM_TIMEOUT_S = 2.0
BYPASS_WINDOW_S = 5 * 60
REJECT_ABOVE = 0.90
ALLOW_BELOW = 0.50

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("silentshield")

# ---- In-memory state (resets on restart; fine for a demo) ----
_lock = threading.Lock()
last_flagged_at = {}  # number -> server time of last silence/reject
flagged_calls = []  # dashboard events, appended in order (oldest first)
whitelist = set()
blocklist = set()
_ids = itertools.count(1)

# One worker pool for LLM calls so we can enforce a hard wall-clock timeout.
_llm_pool = ThreadPoolExecutor(max_workers=8)
_groq_client = None

SYSTEM_PROMPT = """You are SilentShield, a phone scam classifier. You receive ONLY call metadata:
caller_id (E.164 number), verification_status (STIR/SHAKEN result: PASSED, FAILED, or NOT_VERIFIED),
and call_direction. You never hear the call audio.

Estimate the probability (0-1) that this call is a scam or spoofed robocall. Scam patterns this
metadata can reveal:
- verification_status FAILED: the network says the caller ID is likely spoofed. Strong signal (0.6-0.85).
- NOT_VERIFIED or missing: weak signal, typical of unverified VoIP gateways.
- Hidden, empty, malformed, or very short numbers; premium/international prefixes unusual for a US user.
- Numbers matching common spoofing styles (repeated digits, 555 fictional ranges, toll-free used for callbacks).
Spoofed numbers carry the typical scams: urgency and pressure, impersonating the IRS, police, banks,
or tech support, demands for gift cards, wire transfers, or crypto, and grandparent/family-emergency stories.
- PASSED with a normal domestic number: low risk (0.05-0.3) unless other red flags exist.
Do not exceed 0.9 on metadata alone unless several strong signals combine.

Respond with ONLY a JSON object, no other text:
{"confidence": <number 0-1>, "reason": "<max 12 words>"}"""


# ---- Scoring ----

def _get_groq():
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY not set")
        from groq import Groq

        _groq_client = Groq(api_key=GROQ_API_KEY, timeout=LLM_TIMEOUT_S, max_retries=0)
    return _groq_client


def _call_groq(caller_id, verification_status, call_direction):
    resp = _get_groq().chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps({
                "caller_id": caller_id,
                "verification_status": verification_status,
                "call_direction": call_direction,
            })},
        ],
        response_format={"type": "json_object"},
        temperature=0,
        reasoning_effort="low",
        max_tokens=200,  # gpt-oss counts its reasoning (~50 tokens at "low") against this
    )
    parsed = json.loads(resp.choices[0].message.content)
    confidence = max(0.0, min(1.0, float(parsed["confidence"])))
    reason = str(parsed.get("reason") or "LLM assessment").strip()[:120]
    return confidence, reason


def llm_score(caller_id, verification_status, call_direction):
    """Return (confidence, reason). Raises on any failure, including the LLM_TIMEOUT_S wall-clock timeout."""
    future = _llm_pool.submit(_call_groq, caller_id, verification_status, call_direction)
    return future.result(timeout=LLM_TIMEOUT_S)


def rule_score(caller_id, verification_status):
    """Cheap heuristic used when the LLM is unavailable. Returns (confidence, reason)."""
    digits = "".join(c for c in caller_id if c.isdigit())
    score, reasons = 0.1, []
    if verification_status == "FAILED":
        score += 0.6
        reasons.append("caller ID verification failed")
    elif verification_status != "PASSED":
        score += 0.2
        reasons.append("caller ID not verified")
    if len(digits) < 7:
        score += 0.3
        reasons.append("hidden or malformed number")
    elif len(set(digits[-7:])) <= 2:
        score += 0.15
        reasons.append("suspicious repeated digits")
    if caller_id.startswith("+") and not caller_id.startswith("+1"):
        score += 0.1
        reasons.append("international number")
    return min(score, 0.99), (", ".join(reasons) or "no red flags")


# ---- State helpers ----

def _log_flag(caller_id, confidence, reason, timestamp):
    event = {
        "id": next(_ids),
        "caller_id": caller_id,
        "confidence_score": round(confidence, 2),
        "reason": reason,
        "timestamp": timestamp,
        "status": "pending",
    }
    with _lock:
        flagged_calls.append(event)


def _respond(action, confidence, reason, caller_id, timestamp, log_flag=False):
    if action in ("silence", "reject") and caller_id:
        with _lock:
            last_flagged_at[caller_id] = time.time()
    if log_flag:
        threading.Thread(target=_log_flag, args=(caller_id, confidence, reason, timestamp), daemon=True).start()
    log.info("evaluate %s -> %s (%.2f) %s", caller_id or "<hidden>", action, confidence, reason)
    return jsonify({"action": action, "confidence_score": round(confidence, 2), "reason": reason})


# ---- Routes ----

@app.get("/health")
def health():
    return jsonify({"status": "ok", "llm_configured": bool(GROQ_API_KEY), "model": GROQ_MODEL})


@app.post("/evaluate")
def evaluate():
    try:
        data = request.get_json(silent=True) or {}
        caller_id = str(data.get("caller_id") or "").strip()
        verification_status = str(data.get("verification_status") or "NOT_VERIFIED").strip().upper()
        call_direction = str(data.get("call_direction") or "INCOMING").strip().upper()
        try:
            timestamp = int(data.get("timestamp"))
        except (TypeError, ValueError):
            timestamp = int(time.time())

        with _lock:
            whitelisted = caller_id in whitelist
            blocked = caller_id in blocklist
            last = last_flagged_at.get(caller_id)

        if whitelisted:
            return _respond("allow", 0.0, "Whitelisted number", caller_id, timestamp)
        if blocked:
            return _respond("reject", 1.0, "Blocked number", caller_id, timestamp)
        if caller_id and last is not None and time.time() - last <= BYPASS_WINDOW_S:
            return _respond("allow", 0.0, "Repeat caller within 5 min (emergency bypass)", caller_id, timestamp)

        try:
            confidence, reason = llm_score(caller_id, verification_status, call_direction)
        except Exception as e:
            if isinstance(e, FutureTimeout):
                log.warning("LLM timed out after %.1fs", LLM_TIMEOUT_S)
                cause = "LLM timeout"
            else:
                log.warning("LLM failed: %s: %s", type(e).__name__, e)
                cause = "LLM unavailable"
            # Rule-based fallback: silence (and flag) only if the heuristics look suspicious.
            confidence, rule_reason = rule_score(caller_id, verification_status)
            silence = confidence >= ALLOW_BELOW
            return _respond("silence" if silence else "allow", confidence,
                            f"Fallback ({cause}): {rule_reason}", caller_id, timestamp, log_flag=silence)

        if confidence > REJECT_ABOVE:
            return _respond("reject", confidence, reason, caller_id, timestamp)
        if confidence < ALLOW_BELOW:
            return _respond("allow", confidence, reason, caller_id, timestamp)
        return _respond("silence", confidence, reason, caller_id, timestamp, log_flag=True)

    except Exception:
        # Last line of defense: Android must never see a 500.
        log.exception("evaluate crashed")
        return jsonify({"action": "silence", "confidence_score": 0.5,
                        "reason": "Fallback (internal error)"}), 200


@app.get("/flagged-calls")
def get_flagged_calls():
    with _lock:
        return jsonify(list(reversed(flagged_calls)))


@app.post("/resolve")
def resolve():
    data = request.get_json(silent=True) or {}
    resolution = data.get("resolution")
    if resolution not in ("whitelist", "block"):
        return jsonify({"error": "resolution must be 'whitelist' or 'block'"}), 400
    try:
        call_id = int(data.get("id"))
    except (TypeError, ValueError):
        return jsonify({"error": "id must be an integer"}), 400

    with _lock:
        call = next((c for c in flagged_calls if c["id"] == call_id), None)
        if call is None:
            return jsonify({"error": f"no flagged call with id {call_id}"}), 404
        number = call["caller_id"]
        if resolution == "whitelist":
            whitelist.add(number)
            blocklist.discard(number)
            call["status"] = "whitelisted"
        else:
            blocklist.add(number)
            whitelist.discard(number)
            call["status"] = "blocked"
        result = dict(call)

    log.info("resolve id=%s %s -> %s", call_id, number, resolution)
    return jsonify({"ok": True, "call": result})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, threaded=True)
