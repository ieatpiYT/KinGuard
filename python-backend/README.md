# KinGuard Backend (Flask)

Scores incoming calls from call metadata and tells the Android app to `reject`, `silence`, or `allow`.

## Run

```bash
cd python-backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env          # then paste your GROQ_API_KEY
./venv/bin/python app.py      # serves on 0.0.0.0:5001 (override with PORT)
```

> The default port is 5001 because macOS AirPlay Receiver occupies 5000. To use another port:
> `PORT=8000 ./venv/bin/python app.py`, then point ngrok at that port.

Expose it publicly (in a second terminal):

```bash
ngrok http 5001
```

Copy the `https://....ngrok-free.app` URL ngrok prints. **The Android app's base URL must be that
https URL** (not `localhost`/LAN IP, and not `http://`). The free ngrok URL changes on every restart,
so share the new one with the team each time.

The dashboard should send the header `ngrok-skip-browser-warning: true` on its `fetch` calls,
otherwise ngrok's free tier can return its HTML warning page instead of JSON.

## Test

```bash
./venv/bin/python test_evaluate.py
```

Runs against Flask's test client (no server needed) with the LLM mocked. If `GROQ_API_KEY` is set, it
also makes one real Groq call.

Manual curl checks against a running server:

```bash
BASE=http://localhost:5001   # or your ngrok URL
curl $BASE/health
curl -X POST $BASE/evaluate -H 'Content-Type: application/json' \
  -d '{"caller_id":"+15550198372","verification_status":"FAILED","call_direction":"INCOMING","timestamp":1761916800}'
# same number again within 5 min -> allow (emergency bypass)
curl -X POST $BASE/evaluate -H 'Content-Type: application/json' \
  -d '{"caller_id":"+15550198372","verification_status":"FAILED","call_direction":"INCOMING","timestamp":1761916900}'
curl $BASE/flagged-calls
curl -X POST $BASE/resolve -H 'Content-Type: application/json' -d '{"id":1,"resolution":"whitelist"}'
```

## How /evaluate decides

These checks run in order; the first match wins:

1. Whitelisted number → `allow`. Blocked number → `reject`.
2. The same number was silenced or rejected in the last 5 min → `allow` (emergency bypass, no LLM call).
3. Groq LLM scores the call (2s hard timeout). Confidence > 0.90 → `reject`, < 0.50 → `allow`,
   otherwise `silence` and the call is added to `/flagged-calls`.
4. If the LLM errors, times out, or returns bad JSON → `silence` with a `Fallback (...)` reason.
   The confidence comes from a rule-based score, and the call is still added to `/flagged-calls`.

`/evaluate` always returns 200. All state is in memory and resets when the server restarts.

## API

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | | `{"status":"ok","llm_configured":true,"model":"..."}` |
| POST | `/evaluate` | `{"caller_id","verification_status","call_direction","timestamp"}` | `{"action","confidence_score","reason"}` |
| GET | `/flagged-calls` | | `[{"id","caller_id","confidence_score","reason","timestamp","status"}]`, newest first |
| POST | `/resolve` | `{"id": 1, "resolution": "whitelist" \| "block"}` | `{"ok":true,"call":{...}}` (400 bad input, 404 unknown id) |

`status` is one of `pending`, `whitelisted`, `blocked`.
