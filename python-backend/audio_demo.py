"""Live Audio Transcription & Scam Detection Demo (Option A: Reliable Audio File Pipeline).

Usage:
  1. Drop any .mp3, .wav, or .m4a scam audio clip (e.g. from YouTube) into python-backend/samples/
     (or run .\generate_samples.ps1 in PowerShell to create 3 ready-to-use .wav files).
  2. Run:
       .\venv\Scripts\python audio_demo.py
     or pass a specific file:
       .\venv\Scripts\python audio_demo.py samples\my_youtube_scam.mp3
"""

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
FLASK_URL = os.getenv("FLASK_URL", "http://127.0.0.1:5001")
DASHBOARD_BRIDGE_URL = os.getenv("DASHBOARD_BRIDGE_URL", "http://127.0.0.1:5173")

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac", ".mp4"}


def find_default_audio_file() -> Path | None:
    base_dir = Path(__file__).resolve().parent
    samples_dir = base_dir / "samples"
    for search_dir in (samples_dir, base_dir):
        if search_dir.exists():
            files = sorted(
                p for p in search_dir.iterdir()
                if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS
            )
            if files:
                return files[0]
    return None


def play_wav_if_supported(audio_path: Path, no_play: bool):
    if no_play or audio_path.suffix.lower() != ".wav":
        return
    try:
        import winsound
        winsound.PlaySound(str(audio_path), winsound.SND_FILENAME | winsound.SND_ASYNC)
    except Exception:
        pass


def transcribe_with_groq_whisper(audio_path: Path) -> tuple[str, int]:
    """Transcribe audio file using Groq Whisper (whisper-large-v3-turbo). Returns (transcript, latency_ms)."""
    if not GROQ_API_KEY:
        raise RuntimeError(
            "GROQ_API_KEY is not set in python-backend/.env. "
            "Add GROQ_API_KEY=gsk_... to python-backend/.env to run live Whisper transcription."
        )
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


def post_json(url: str, payload: dict, timeout_s: float = 6.0) -> dict | None:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def evaluate_transcript(caller_id: str, transcript: str) -> tuple[dict, int]:
    """Send transcript to Flask /evaluate-audio (or evaluate directly with Groq LLM if Flask is not running)."""
    start = time.perf_counter()
    flask_res = post_json(
        f"{FLASK_URL}/evaluate-audio",
        {"caller_id": caller_id, "transcript": transcript},
        timeout_s=7.0,
    )
    if flask_res and "action" in flask_res:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return flask_res, elapsed_ms

    # Direct fallback if python app.py wasn't started in another terminal
    import app as backend_app

    confidence, reason, tactics = backend_app.score_transcript(caller_id, transcript)
    if confidence > backend_app.REJECT_ABOVE:
        action = "reject"
    elif confidence < backend_app.ALLOW_BELOW:
        action = "allow"
    else:
        action = "silence"
    elapsed_ms = int((time.perf_counter() - start) * 1000)
    return {
        "id": None,
        "caller_id": caller_id,
        "action": action,
        "confidence_score": round(confidence, 2),
        "reason": reason,
        "tactics": tactics,
        "transcript": transcript,
    }, elapsed_ms


def main():
    parser = argparse.ArgumentParser(description="KinGuard Live Audio Transcription & Scam Detection Demo")
    parser.add_argument(
        "audio_file",
        nargs="?",
        help="Path to .mp3 / .wav / .m4a audio file (defaults to first file in samples/)",
    )
    parser.add_argument(
        "--caller",
        default="+18005557777",
        help="Simulated caller ID for this audio stream (default: +18005557777)",
    )
    parser.add_argument(
        "--no-play",
        action="store_true",
        help="Do not play .wav audio through speakers during transcription",
    )
    args = parser.parse_args()

    audio_path = Path(args.audio_file) if args.audio_file else find_default_audio_file()
    if not audio_path or not audio_path.exists():
        print("\n[!] No audio file found.")
        print("    Drop a YouTube scam .mp3 or .wav file into: python-backend/samples/")
        print("    Or generate ready-made sample .wav files by running:")
        print("      powershell -ExecutionPolicy Bypass -File .\\generate_samples.ps1\n")
        sys.exit(1)

    size_kb = audio_path.stat().st_size / 1024.0

    print("\n" + "=" * 74)
    print("  KinGuard AI Voice & Transcript Threat Engine (Groq Whisper + LLM)")
    print("=" * 74)
    print(f"[1/4] Ingesting Call Audio : {audio_path.name} ({size_kb:.1f} KB)")
    print(f"      Incoming Caller ID   : {args.caller}")

    play_wav_if_supported(audio_path, args.no_play)

    print(f"\n[2/4] Running Speech-to-Text via Groq Whisper ({WHISPER_MODEL})...")
    transcript, stt_ms = transcribe_with_groq_whisper(audio_path)
    print(f"      Completed in {stt_ms} ms:")
    print("      " + "-" * 66)
    print(f'      "{transcript}"')
    print("      " + "-" * 66)

    print(f"\n[3/4] Evaluating Scam Intent via Groq LLM ({GROQ_MODEL})...")
    verdict, llm_ms = evaluate_transcript(args.caller, transcript)
    score_pct = int(round(float(verdict.get("confidence_score", 0.95)) * 100))
    action = verdict.get("action", "reject").upper()
    reason = verdict.get("reason", "Scam pattern detected")
    tactics = verdict.get("tactics") or ["Social Engineering", "Voice AI Flagged"]

    action_label = (
        "REJECT & SEVER CALL (>90% Auto-Block)"
        if action == "REJECT"
        else "SILENCE & QUEUE FOR CAREGIVER (50-90%)"
        if action == "SILENCE"
        else "ALLOW CALL (<50% Safe)"
    )

    print(f"      Completed in {llm_ms} ms:")
    print(f"      • Risk Score      : {score_pct}% ({verdict.get('confidence_score', 0.95):.2f})")
    print(f"      • AI Decision     : {action_label}")
    print(f"      • Threat Summary  : {reason}")
    print(f"      • Detected Tactics: {', '.join(tactics)}")

    print("\n[4/4] Syncing Verdict & Transcript to KinGuard Caregiver Dashboard...")
    bridge_res = post_json(
        f"{DASHBOARD_BRIDGE_URL}/api/audio-event",
        {
            "backendId": verdict.get("id"),
            "callerId": args.caller,
            "action": verdict.get("action", "reject"),
            "score": score_pct,
            "reason": reason,
            "transcript": transcript,
            "tags": tactics,
            "latencyMs": stt_ms + llm_ms,
            "hangupEmulator": verdict.get("action") in ("reject", "silence"),
        },
        timeout_s=5.0,
    )

    if bridge_res and bridge_res.get("ok"):
        print("      [OK] Live transcript card & risk score pushed to KinGuard Dashboard (:5173)")
        if bridge_res.get("emulatorSevered"):
            print("      [OK] Active call on Android Emulator automatically severed via ADB")
    else:
        print("      [i] Dashboard bridge (:5173) not running — start 'npm run dev' in react-dashboard/ for live UI sync.")

    print("=" * 74 + "\n")


if __name__ == "__main__":
    main()

