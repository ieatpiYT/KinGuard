"""SilentShield backend: scores incoming calls and tells the Android app what to do.

POST /evaluate       -> {"action": "reject"|"silence"|"allow", "confidence_score": float, "reason": str}
POST /evaluate-audio -> transcribe & score call audio or transcript with Groq Whisper + LLM
GET  /flagged-calls  -> silenced calls for the dashboard, newest first
POST /resolve        -> {"id": int, "resolution": "whitelist"|"block"}
POST /sync           -> sync whitelist / blocklist numbers from phone or dashboard
POST /reset          -> reset in-memory demo state
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
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")
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

TRANSCRIPT_SYSTEM_PROMPT = """You are SilentShield's real-time voice scam analyzer. You receive a live speech-to-text
transcript from an incoming phone call along with caller metadata.

Analyze the transcript for social engineering and scam patterns:
- Authority impersonation (IRS, Social Security, Police/Sheriff, FBI, Medicare, Bank fraud dept, Tech Support)
- Urgency, coercion, or threats (arrest warrant, account freeze, deportation, lawsuit, utility shutoff)
- Family / Grandparent emergency scams (car accident, bail money, "don't tell Mom or Dad")
- Unusual payment demands (gift cards, Bitcoin/crypto, wire transfer, cash courier, Zelle)

If clear scam patterns appear in the transcript, set confidence between 0.91 and 0.99.
If the transcript is suspicious/ambiguous (e.g. unverified caller asking for personal info), set confidence between 0.55 and 0.89.
If it is clearly benign (e.g. doctor appointment reminder, pharmacy, normal family chat), set confidence below 0.30.

Respond with ONLY a JSON object, no other text:
{
  "confidence": <number 0-1>,
  "reason": "<concise 6-14 word explanation>",
  "tactics": ["<tag 1>", "<tag 2>", "<tag 3>"]
}"""


def _number_variants(raw):
    """Return canonical E.164 and 10-digit variants so +18005828888 and 8005828888 match."""
    s = str(raw or "").strip()
    if not s:
        return set()
    digits = "".join(c for c in s if c.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        ten = digits[1:]
    else:
        ten = digits
    variants = {s}
    if digits:
        variants.add(digits)
    if len(ten) == 10:
        variants.add(ten)
        variants.add(f"+1{ten}")
    return variants


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


def score_transcript(caller_id, transcript):
    """Score a transcribed call audio using Groq LLM, with keyword heuristic fallback."""
    try:
        from groq import Groq

        client = Groq(api_key=GROQ_API_KEY, timeout=6.0, max_retries=0)
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": TRANSCRIPT_SYSTEM_PROMPT},
                {"role": "user", "content": json.dumps({
                    "caller_id": caller_id,
                    "transcript": transcript,
                })},
            ],
            response_format={"type": "json_object"},
            temperature=0,
            reasoning_effort="low",
            max_tokens=300,
        )
        parsed = json.loads(resp.choices[0].message.content)
        confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.85))))
        reason = str(parsed.get("reason") or "High-risk scam language detected in audio").strip()[:140]
        tactics = [str(t) for t in (parsed.get("tactics") or [])][:4]
        if not tactics:
            tactics = ["Voice AI Flagged", "Social Engineering"]
        return confidence, reason, tactics
    except Exception as e:
        log.warning("Transcript LLM fallback (%s)", e)
        lower = transcript.lower()
        score = 0.25
        tactics = []
        if any(w in lower for w in ("irs", "internal revenue", "social security", "officer", "sheriff", "police", "fbi", "medicare")):
            score += 0.35
            tactics.append("Authority Impersonation")
        if any(w in lower for w in ("warrant", "arrest", "jail", "deputies", "immediately", "urgent", "suspended", "accident")):
            score += 0.25
            tactics.append("Urgency / Coercion")
        if any(w in lower for w in ("gift card", "target", "apple", "wire", "bitcoin", "crypto", "cash", "bail", "payment", "dollars")):
            score += 0.25
            tactics.append("Payment / Wire Demand")
        score = min(0.98, score)
        reason = ", ".join(tactics) if tactics else "Transcript analyzed by heuristic fallback"
        return score, reason, (tactics or ["Voice Screened"])


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
    return event["id"]


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
        raw_caller = data.get("caller_id")
        if raw_caller is None:
            raw_caller = data.get("number")
        caller_id = str(raw_caller or "").strip()

        raw_ver = data.get("verification_status")
        if raw_ver is None:
            raw_ver = data.get("verificationStatus")
        if isinstance(raw_ver, int):
            verification_status = {1: "PASSED", 2: "FAILED"}.get(raw_ver, "NOT_VERIFIED")
        else:
            verification_status = str(raw_ver or "NOT_VERIFIED").strip().upper()

        call_direction = str(data.get("call_direction") or "INCOMING").strip().upper()
        try:
            timestamp = int(data.get("timestamp"))
        except (TypeError, ValueError):
            timestamp = int(time.time())

        variants = _number_variants(caller_id)

        with _lock:
            whitelisted = bool(variants & whitelist) or (caller_id in whitelist)
            blocked = bool(variants & blocklist) or (caller_id in blocklist)
            last = last_flagged_at.get(caller_id)
            if last is None:
                for v in variants:
                    if v in last_flagged_at:
                        last = last_flagged_at[v]
                        break

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


@app.post("/evaluate-audio")
def evaluate_audio():
    """Score a transcribed audio stream and log it in the server terminal + flagged_calls."""
    data = request.get_json(silent=True) or {}
    caller_id = str(data.get("caller_id") or "+18005557777").strip()
    transcript = str(data.get("transcript") or "").strip()
    timestamp = int(time.time())

    confidence, reason, tactics = score_transcript(caller_id, transcript)
    if confidence > REJECT_ABOVE:
        action = "reject"
    elif confidence < ALLOW_BELOW:
        action = "allow"
    else:
        action = "silence"

    flag_id = None
    if action in ("silence", "reject"):
        flag_id = _log_flag(caller_id, confidence, reason, timestamp)
        with _lock:
            last_flagged_at[caller_id] = time.time()

    log.info(
        "evaluate-audio %s -> %s (%.2f) reason='%s' transcript='%s'",
        caller_id,
        action,
        confidence,
        reason,
        transcript[:80] + ("..." if len(transcript) > 80 else ""),
    )
    return jsonify({
        "id": flag_id,
        "caller_id": caller_id,
        "action": action,
        "confidence_score": round(confidence, 2),
        "reason": reason,
        "tactics": tactics,
        "transcript": transcript,
    })


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
        variants = _number_variants(number) | {number}
        if resolution == "whitelist":
            whitelist.update(variants)
            blocklist.difference_update(variants)
            call["status"] = "whitelisted"
        else:
            blocklist.update(variants)
            whitelist.difference_update(variants)
            call["status"] = "blocked"
        result = dict(call)

    log.info("resolve id=%s %s -> %s", call_id, number, resolution)
    return jsonify({"ok": True, "call": result})


@app.post("/sync")
def sync_lists():
    """Allow the caregiver dashboard or Android contact worker to sync whitelist/blocklist entries."""
    data = request.get_json(silent=True) or {}
    with _lock:
        for num in data.get("add_whitelist") or []:
            variants = _number_variants(num)
            whitelist.update(variants)
            blocklist.difference_update(variants)
        for num in data.get("remove_whitelist") or []:
            whitelist.difference_update(_number_variants(num))
        for num in data.get("add_blocklist") or []:
            variants = _number_variants(num)
            blocklist.update(variants)
            whitelist.difference_update(variants)
        for num in data.get("remove_blocklist") or []:
            blocklist.difference_update(_number_variants(num))
        return jsonify({
            "ok": True,
            "whitelist": sorted(whitelist),
            "blocklist": sorted(blocklist),
        })


@app.post("/reset")
def reset_state():
    """Reset in-memory state for clean demo rehearsals."""
    with _lock:
        whitelist.clear()
        blocklist.clear()
        flagged_calls.clear()
        last_flagged_at.clear()
    log.info("reset -> cleared whitelist, blocklist, flagged_calls, last_flagged_at")
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, threaded=True)
