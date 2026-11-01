"""KinGuard backend: scores incoming calls and tells the Android app what to do.

GET  /               -> Interactive Web Console for live audio transcription & server logs
POST /evaluate       -> {"action": "reject"|"silence"|"allow", "confidence_score": float, "reason": str}
POST /evaluate-audio -> transcribe & score call audio or transcript with Groq Whisper + LLM
GET  /samples        -> list audio files in python-backend/samples/
GET  /samples/<name> -> stream audio file for browser playback
POST /upload-sample  -> upload an .mp3/.wav/.m4a file into python-backend/samples/
POST /run-sample     -> run Groq Whisper + Groq LLM on a sample file & sync to KinGuard dashboard
GET  /server-logs    -> recent backend evaluations for the web console
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
import subprocess
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")
DASHBOARD_BRIDGE_URL = os.getenv("DASHBOARD_BRIDGE_URL", "http://127.0.0.1:5173")
LLM_TIMEOUT_S = 2.0
BYPASS_WINDOW_S = 5 * 60
REJECT_ABOVE = 0.90
ALLOW_BELOW = 0.50

BASE_DIR = Path(__file__).resolve().parent
SAMPLES_DIR = BASE_DIR / "samples"
SAMPLES_DIR.mkdir(exist_ok=True)
ALLOWED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("kinguard")

# ---- In-memory state (resets on restart; fine for a demo) ----
_lock = threading.Lock()
last_flagged_at = {}  # number -> server time of last silence/reject
flagged_calls = []  # dashboard events, appended in order (oldest first)
server_logs = []  # recent server evaluations for the web console (newest first)
whitelist = set()
blocklist = set()
_ids = itertools.count(1)

# One worker pool for LLM calls so we can enforce a hard wall-clock timeout.
_llm_pool = ThreadPoolExecutor(max_workers=8)
_groq_client = None

SYSTEM_PROMPT = """You are KinGuard, a phone scam classifier. You receive ONLY call metadata:
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

TRANSCRIPT_SYSTEM_PROMPT = """You are KinGuard's real-time voice scam analyzer. You receive a live speech-to-text
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


def _record_server_log(kind, caller_id, action, confidence, reason, extra=None):
    entry = {
        "time": time.strftime("%H:%M:%S"),
        "kind": kind,
        "caller_id": caller_id or "<hidden>",
        "action": action,
        "confidence_score": round(float(confidence), 2),
        "reason": reason,
    }
    if extra:
        entry.update(extra)
    with _lock:
        server_logs.insert(0, entry)
        if len(server_logs) > 40:
            server_logs.pop()


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


def _ensure_sample_files():
    """If samples/ is empty on Windows, invoke generate_samples.ps1 in the background."""
    existing = [p for p in SAMPLES_DIR.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_AUDIO_EXTS]
    ps1 = BASE_DIR / "generate_samples.ps1"
    if not existing and ps1.exists() and os.name == "nt":
        try:
            subprocess.Popen(
                ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(ps1)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            pass


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


def transcribe_audio_file(audio_path: Path):
    """Transcribe an audio file using Groq Whisper (whisper-large-v3-turbo). Returns (transcript, latency_ms)."""
    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set in python-backend/.env")
    from groq import Groq

    client = Groq(api_key=GROQ_API_KEY, timeout=15.0)
    start = time.perf_counter()
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            file=(audio_path.name, f.read()),
            model=WHISPER_MODEL,
            language="en",
            response_format="json",
            temperature=0.0,
        )
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    text = (getattr(result, "text", None) or "").strip()
    return text, elapsed_ms


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
    _record_server_log("METADATA", caller_id, action, confidence, reason)
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
    _record_server_log("VOICE_AI", caller_id, action, confidence, reason, {"transcript": transcript, "tactics": tactics})
    return jsonify({
        "id": flag_id,
        "caller_id": caller_id,
        "action": action,
        "confidence_score": round(confidence, 2),
        "reason": reason,
        "tactics": tactics,
        "transcript": transcript,
    })


@app.get("/samples")
def list_samples():
    _ensure_sample_files()
    files = []
    if SAMPLES_DIR.exists():
        for p in sorted(SAMPLES_DIR.iterdir()):
            if p.is_file() and p.suffix.lower() in ALLOWED_AUDIO_EXTS:
                files.append({
                    "name": p.name,
                    "size_kb": round(p.stat().st_size / 1024.0, 1),
                })
    return jsonify({
        "ok": True,
        "samples": files,
        "llm_configured": bool(GROQ_API_KEY),
        "whisper_model": WHISPER_MODEL,
        "llm_model": GROQ_MODEL,
    })


@app.get("/samples/<path:filename>")
def serve_sample(filename):
    return send_from_directory(SAMPLES_DIR, filename)


@app.post("/upload-sample")
def upload_sample():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    safe_name = secure_filename(f.filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_AUDIO_EXTS:
        return jsonify({"error": f"Unsupported file extension {ext}"}), 400
    dest = SAMPLES_DIR / safe_name
    f.save(dest)
    log.info("uploaded audio sample: %s (%.1f KB)", safe_name, dest.stat().st_size / 1024.0)
    return jsonify({"ok": True, "filename": safe_name})


@app.post("/run-sample")
def run_sample():
    """Transcribe a file in samples/ with Groq Whisper, score with Groq LLM, and sync to KinGuard dashboard."""
    data = request.get_json(silent=True) or {}
    filename = str(data.get("filename") or "").strip()
    caller_id = str(data.get("caller_id") or "+18005557777").strip()

    if not filename:
        return jsonify({"error": "filename is required"}), 400
    audio_path = SAMPLES_DIR / Path(filename).name
    if not audio_path.exists():
        return jsonify({"error": f"File not found in samples/: {filename}"}), 404

    try:
        transcript, stt_ms = transcribe_audio_file(audio_path)
    except Exception as e:
        log.exception("Whisper transcription failed")
        return jsonify({"error": f"Whisper transcription failed: {e}"}), 500

    llm_start = time.perf_counter()
    confidence, reason, tactics = score_transcript(caller_id, transcript)
    llm_ms = int((time.perf_counter() - llm_start) * 1000)
    total_ms = stt_ms + llm_ms

    if confidence > REJECT_ABOVE:
        action = "reject"
    elif confidence < ALLOW_BELOW:
        action = "allow"
    else:
        action = "silence"

    timestamp = int(time.time())
    flag_id = None
    if action in ("silence", "reject"):
        flag_id = _log_flag(caller_id, confidence, reason, timestamp)
        with _lock:
            last_flagged_at[caller_id] = time.time()

    score_pct = int(round(confidence * 100))
    log.info(
        "run-sample file=%s caller=%s -> %s (%d%%, stt=%dms, llm=%dms) '%s'",
        audio_path.name,
        caller_id,
        action,
        score_pct,
        stt_ms,
        llm_ms,
        reason,
    )
    _record_server_log(
        "VOICE_AI",
        caller_id,
        action,
        confidence,
        reason,
        {
            "filename": audio_path.name,
            "transcript": transcript,
            "tactics": tactics,
            "stt_ms": stt_ms,
            "llm_ms": llm_ms,
        },
    )

    # Sync live to KinGuard Caregiver Dashboard (:5173) & sever active emulator call if scam/suspicious
    dashboard_synced = False
    emulator_severed = False
    try:
        bridge_payload = json.dumps({
            "backendId": flag_id,
            "callerId": caller_id,
            "action": action,
            "score": score_pct,
            "reason": reason,
            "transcript": transcript,
            "tags": tactics,
            "latencyMs": total_ms,
            "hangupEmulator": action in ("reject", "silence"),
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{DASHBOARD_BRIDGE_URL}/api/audio-event",
            data=bridge_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            bridge_data = json.loads(resp.read().decode("utf-8"))
            dashboard_synced = bool(bridge_data.get("ok"))
            emulator_severed = bool(bridge_data.get("emulatorSevered"))
    except Exception as e:
        log.warning("Could not sync to dashboard bridge at %s (%s)", DASHBOARD_BRIDGE_URL, e)

    return jsonify({
        "ok": True,
        "id": flag_id,
        "filename": audio_path.name,
        "caller_id": caller_id,
        "transcript": transcript,
        "action": action,
        "confidence_score": round(confidence, 2),
        "score_pct": score_pct,
        "reason": reason,
        "tactics": tactics,
        "stt_ms": stt_ms,
        "llm_ms": llm_ms,
        "total_ms": total_ms,
        "dashboard_synced": dashboard_synced,
        "emulator_severed": emulator_severed,
    })


@app.get("/server-logs")
def get_server_logs():
    with _lock:
        return jsonify(list(server_logs))


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
    _record_server_log("RESOLVE", number, resolution, call["confidence_score"], f"Caregiver resolved id={call_id} -> {resolution}")
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
        server_logs.clear()
    log.info("reset -> cleared whitelist, blocklist, flagged_calls, last_flagged_at")
    return jsonify({"ok": True})


DEMO_CONSOLE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KinGuard AI Voice &amp; Server Console</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen font-sans">
  <!-- Header -->
  <header class="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
        KG
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-lg font-bold text-slate-900">KinGuard AI Voice &amp; Threat Engine</h1>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold" id="llm-badge">
            Checking Groq API...
          </span>
        </div>
        <p class="text-xs text-slate-500">Live Speech-to-Text (`whisper-large-v3-turbo`) &amp; Scam Intent Classification (`openai/gpt-oss-20b`)</p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <a href="http://localhost:5173" target="_blank" class="text-xs px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold transition">
        Open Caregiver Dashboard (:5173) &rarr;
      </a>
    </div>
  </header>

  <main class="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
    <!-- Left Column: Audio Selection & Playback -->
    <section class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5 self-start">
      <div class="border-b border-slate-100 pb-4">
        <h2 class="text-base font-bold text-slate-900">1. Select Call Audio in <code class="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-sm">/samples</code></h2>
        <p class="text-xs text-slate-500 mt-1">Choose a pre-loaded call recording or upload a YouTube scam clip (.mp3, .wav, .m4a).</p>
      </div>

      <!-- Sample File Selector -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label for="sample-select" class="text-xs font-semibold text-slate-700">Audio File in <code class="font-mono">python-backend/samples/</code></label>
          <button type="button" onclick="loadSamples()" class="text-xs text-blue-600 hover:text-blue-700 font-semibold">Refresh list</button>
        </div>
        <select id="sample-select" onchange="onSampleChange()" class="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 font-medium focus:outline-none focus:border-blue-600">
          <option value="">Loading samples...</option>
        </select>
      </div>

      <!-- Built-in Audio Player -->
      <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-700">Preview / Play Call Audio</span>
          <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" id="autoplay-check" checked class="rounded text-blue-600" />
            <span>Play audio when analyzing</span>
          </label>
        </div>
        <audio id="audio-player" controls class="w-full h-10"></audio>
      </div>

      <!-- Simulated Caller ID -->
      <div class="space-y-1.5">
        <label for="caller-input" class="text-xs font-semibold text-slate-700">Simulated Incoming Caller ID</label>
        <input id="caller-input" type="text" value="+1 (800) 555-7777" class="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-blue-600" />
      </div>

      <!-- Primary Run Button -->
      <button id="run-btn" type="button" onclick="runAudioAnalysis()" class="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-sm transition flex items-center justify-center gap-2">
        <span id="run-btn-text">Transcribe &amp; Evaluate Call Audio</span>
      </button>

      <!-- Upload New Audio Clip to /samples -->
      <div class="pt-4 border-t border-slate-200 space-y-2">
        <span class="text-xs font-semibold text-slate-600 block">Add a YouTube Scam Audio Clip (.mp3, .wav, .m4a)</span>
        <div class="flex items-center gap-2">
          <input id="upload-input" type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,.flac,.mp4" class="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-semibold file:bg-white file:text-slate-700 hover:file:bg-slate-50 flex-1" />
          <button type="button" onclick="uploadSample()" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shrink-0 transition">
            Upload
          </button>
        </div>
        <div id="upload-status" class="text-xs text-emerald-700 font-medium hidden"></div>
      </div>
    </section>

    <!-- Right Column: Live AI Transcription & Decision Output -->
    <section class="lg:col-span-7 space-y-6">
      <!-- Output Panel -->
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 class="text-base font-bold text-slate-900">2. Live AI Pipeline Output</h2>
            <p class="text-xs text-slate-500 mt-0.5">Real-time speech transcription, semantic threat scoring, and dashboard sync</p>
          </div>
          <span id="latency-badge" class="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Ready
          </span>
        </div>

        <!-- Placeholder state -->
        <div id="output-empty" class="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 p-6">
          <div class="text-sm font-bold text-slate-800">Select an audio file on the left and click "Transcribe &amp; Evaluate"</div>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Groq Whisper will transcribe the audio stream in real time, score the caller's intent with Groq LLM, and push the result live to the KinGuard Caregiver Dashboard.
          </p>
        </div>

        <!-- Populated Results -->
        <div id="output-results" class="space-y-4 hidden">
          <!-- Step A: Whisper Transcript -->
          <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-blue-700 uppercase tracking-wider">Step 1 • Groq Whisper Speech-to-Text</span>
              <span id="stt-time" class="text-xs font-mono text-slate-500"></span>
            </div>
            <blockquote id="transcript-text" class="text-sm text-slate-900 italic bg-white p-3.5 rounded-lg border border-slate-200 leading-relaxed"></blockquote>
          </div>

          <!-- Step B: LLM Threat Verdict -->
          <div id="verdict-box" class="p-5 rounded-xl border space-y-3">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span class="text-xs font-bold uppercase tracking-wider block" id="verdict-label">Step 2 • Groq LLM Threat Decision</span>
                <div class="text-lg font-bold mt-0.5" id="verdict-action"></div>
              </div>
              <div class="text-right">
                <span class="text-2xl font-extrabold" id="verdict-score"></span>
                <span class="text-xs block text-slate-500">Scam Confidence</span>
              </div>
            </div>

            <div class="text-sm bg-white/90 p-3 rounded-lg border border-slate-200/80">
              <strong class="text-slate-800">AI Reasoning:</strong>
              <span id="verdict-reason" class="text-slate-700 ml-1"></span>
            </div>

            <div class="flex items-center gap-1.5 flex-wrap pt-1" id="verdict-tags"></div>
          </div>

          <!-- Step C: Live Sync Confirmation -->
          <div id="sync-banner" class="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
            <span id="sync-text">Synced with KinGuard Caregiver Dashboard (:5173)</span>
            <span class="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-emerald-200">HTTP 200 OK</span>
          </div>
        </div>
      </div>

      <!-- Live Server Activity Log -->
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-bold text-slate-900">Live Backend Server Log (`:5001`)</h3>
            <p class="text-xs text-slate-500">Real-time `/evaluate`, `/run-sample`, and `/resolve` requests handled by Flask</p>
          </div>
          <span class="text-[11px] font-mono text-slate-500">Auto-updating</span>
        </div>

        <div id="server-log-list" class="bg-slate-900 text-slate-100 font-mono text-xs rounded-xl p-4 space-y-2 max-h-56 overflow-y-auto">
          <div class="text-slate-400">Waiting for incoming call or audio evaluation...</div>
        </div>
      </div>
    </section>
  </main>

  <script>
    async function loadSamples(selectFilename = null) {
      try {
        const res = await fetch('/samples');
        const data = await res.json();
        const badge = document.getElementById('llm-badge');
        if (data.llm_configured) {
          badge.textContent = `Groq Active • ${data.whisper_model} + ${data.llm_model}`;
          badge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold';
        } else {
          badge.textContent = 'GROQ_API_KEY missing in .env';
          badge.className = 'text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 font-semibold';
        }

        const select = document.getElementById('sample-select');
        if (!data.samples || data.samples.length === 0) {
          select.innerHTML = '<option value="">No files in /samples yet — upload one below</option>';
          return;
        }
        const currentVal = selectFilename || select.value;
        select.innerHTML = data.samples.map(s =>
          `<option value="${s.name}">${s.name} (${s.size_kb} KB)</option>`
        ).join('');
        if (currentVal && data.samples.some(s => s.name === currentVal)) {
          select.value = currentVal;
        }
        onSampleChange();
      } catch (e) {
        console.error(e);
      }
    }

    function onSampleChange() {
      const select = document.getElementById('sample-select');
      const player = document.getElementById('audio-player');
      if (select.value) {
        player.src = `/samples/${encodeURIComponent(select.value)}`;
      } else {
        player.removeAttribute('src');
      }
    }

    async function uploadSample() {
      const input = document.getElementById('upload-input');
      const status = document.getElementById('upload-status');
      if (!input.files || input.files.length === 0) return;

      const formData = new FormData();
      formData.append('file', input.files[0]);

      status.textContent = 'Uploading...';
      status.classList.remove('hidden');

      const res = await fetch('/upload-sample', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.ok) {
        status.textContent = `Saved ${data.filename} to /samples!`;
        input.value = '';
        await loadSamples(data.filename);
      } else {
        status.textContent = data.error || 'Upload failed';
      }
    }

    async function runAudioAnalysis() {
      const select = document.getElementById('sample-select');
      const caller = document.getElementById('caller-input').value.trim() || '+18005557777';
      const btn = document.getElementById('run-btn');
      const btnText = document.getElementById('run-btn-text');
      const player = document.getElementById('audio-player');
      const autoplay = document.getElementById('autoplay-check').checked;

      if (!select.value) {
        alert('Please select or upload an audio file in /samples first.');
        return;
      }

      btn.disabled = true;
      btnText.textContent = 'Transcribing with Groq Whisper & Scoring with Groq LLM...';
      document.getElementById('latency-badge').textContent = 'Processing...';

      if (autoplay && player.src) {
        player.currentTime = 0;
        player.play().catch(() => {});
      }

      try {
        const res = await fetch('/run-sample', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: select.value, caller_id: caller })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          alert(data.error || 'Failed to analyze audio');
          return;
        }

        document.getElementById('output-empty').classList.add('hidden');
        document.getElementById('output-results').classList.remove('hidden');

        document.getElementById('latency-badge').textContent =
          `Total: ${data.total_ms}ms (Whisper: ${data.stt_ms}ms • LLM: ${data.llm_ms}ms)`;
        document.getElementById('stt-time').textContent = `${data.stt_ms} ms`;
        document.getElementById('transcript-text').textContent = `"${data.transcript}"`;
        document.getElementById('verdict-score').textContent = `${data.score_pct}%`;
        document.getElementById('verdict-reason').textContent = data.reason;

        const vbox = document.getElementById('verdict-box');
        const vaction = document.getElementById('verdict-action');
        if (data.action === 'reject') {
          vbox.className = 'p-5 rounded-xl border bg-rose-50 border-rose-300 text-rose-950 space-y-3';
          vaction.textContent = 'AUTO-BLOCK & SEVER CALL (>90% Scam Risk)';
        } else if (data.action === 'silence') {
          vbox.className = 'p-5 rounded-xl border bg-amber-50 border-amber-300 text-amber-950 space-y-3';
          vaction.textContent = 'SILENCE RINGER & SEND TO CAREGIVER REVIEW (50–90%)';
        } else {
          vbox.className = 'p-5 rounded-xl border bg-emerald-50 border-emerald-300 text-emerald-950 space-y-3';
          vaction.textContent = 'ALLOW CALL THROUGH (<50% Safe Caller)';
        }

        const tagsContainer = document.getElementById('verdict-tags');
        tagsContainer.innerHTML = (data.tactics || []).map(t =>
          `<span class="px-2.5 py-1 text-xs font-semibold rounded-md bg-white text-slate-800 border border-slate-300">${t}</span>`
        ).join('');

        const syncText = document.getElementById('sync-text');
        if (data.dashboard_synced) {
          syncText.textContent = data.emulator_severed
            ? '✓ Pushed live transcript to KinGuard Dashboard (:5173) & severed active call on Android Emulator!'
            : '✓ Pushed live transcript & risk score to KinGuard Caregiver Dashboard (:5173)!';
        } else {
          syncText.textContent = 'Evaluated on server (start npm run dev on :5173 to sync to Caregiver Dashboard)';
        }

        pollLogs();
      } catch (e) {
        alert('Error running audio analysis: ' + e.message);
      } finally {
        btn.disabled = false;
        btnText.textContent = 'Transcribe & Evaluate Call Audio';
      }
    }

    async function pollLogs() {
      try {
        const res = await fetch('/server-logs');
        const logs = await res.json();
        const container = document.getElementById('server-log-list');
        if (!Array.isArray(logs) || logs.length === 0) return;
        container.innerHTML = logs.map(l => {
          const color = l.action === 'reject' || l.action === 'block'
            ? 'text-rose-400'
            : l.action === 'silence'
            ? 'text-amber-300'
            : 'text-emerald-400';
          const pct = Math.round((l.confidence_score || 0) * 100);
          return `<div><span class="text-slate-500">[${l.time}]</span> <span class="text-blue-400 font-semibold">${l.kind}</span> ${l.caller_id} &rarr; <span class="${color} font-bold uppercase">${l.action} (${pct}%)</span> <span class="text-slate-300">${l.reason}</span></div>`;
        }).join('');
      } catch {}
    }

    loadSamples();
    setInterval(pollLogs, 2000);
  </script>
</body>
</html>
"""


@app.get("/")
@app.get("/demo")
def demo_console():
    _ensure_sample_files()
    return Response(DEMO_CONSOLE_HTML, mimetype="text/html")


if __name__ == "__main__":
    _ensure_sample_files()
    port = int(os.getenv("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, threaded=True)
