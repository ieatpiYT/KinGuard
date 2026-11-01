"""Tests for the KinGuard backend. Run: ./venv/bin/python test_evaluate.py

Uses Flask's test client, so no server is needed. The LLM is mocked so routing is deterministic.
If GROQ_API_KEY is set, one extra test hits the real Groq API.
"""

import time

import app as backend

client = backend.app.test_client()
passed = 0


def check(name, cond, detail=""):
    global passed
    if not cond:
        raise AssertionError(f"FAIL: {name} {detail}")
    passed += 1
    print(f"  PASS  {name}")


def evaluate(caller_id, verification="PASSED", **extra):
    body = {"caller_id": caller_id, "verification_status": verification,
            "call_direction": "INCOMING", "timestamp": int(time.time()), **extra}
    start = time.time()
    r = client.post("/evaluate", json=body)
    elapsed = time.time() - start
    print(f"        {caller_id or '<none>'} {verification} -> {r.status_code} {r.get_json()} ({elapsed:.2f}s)")
    return r, elapsed


def mock_llm(confidence, reason="mocked"):
    calls = []

    def fake(*args):
        calls.append(args)
        return confidence, reason

    backend.llm_score = fake
    return calls


def wait_for_flag(caller_id, timeout=1.0):
    end = time.time() + timeout
    while time.time() < end:
        if any(c["caller_id"] == caller_id for c in client.get("/flagged-calls").get_json()):
            return True
        time.sleep(0.02)
    return False


real_llm_score = backend.llm_score

print("\n/health")
r = client.get("/health")
check("health returns ok", r.status_code == 200 and r.get_json()["status"] == "ok", r.get_json())

print("\n1. Normal call (verified, LLM says low risk)")
mock_llm(0.12, "Verified domestic number")
r, _ = evaluate("+14155550123", "PASSED")
check("normal call -> allow", r.get_json()["action"] == "allow")
check("response has contract keys", set(r.get_json()) == {"action", "confidence_score", "reason"})

print("\n2. FAILED verification (LLM says medium risk)")
mock_llm(0.78, "Caller ID verification failed")
r, _ = evaluate("+15550198372", "FAILED")
check("FAILED call -> silence", r.get_json()["action"] == "silence")
check("silenced call appears in /flagged-calls", wait_for_flag("+15550198372"))

print("\n3. Same number calls again within 5 min")
calls = mock_llm(0.78)
r, _ = evaluate("+15550198372", "FAILED")
check("repeat caller -> allow", r.get_json()["action"] == "allow")
check("bypass reason", r.get_json()["reason"] == "Repeat caller within 5 min (emergency bypass)")
check("LLM not called on bypass", len(calls) == 0)

print("\n4. High-confidence scam")
mock_llm(0.95, "Spoofed number, high risk")
r, _ = evaluate("+18005550000", "FAILED")
check("confidence > 0.90 -> reject", r.get_json()["action"] == "reject")

print("\n5. Bypass window expires")
with backend._lock:
    backend.last_flagged_at["+18005550000"] -= 301
mock_llm(0.95)
r, _ = evaluate("+18005550000", "FAILED")
check("after 5 min, no bypass -> reject", r.get_json()["action"] == "reject")

print("\n6. LLM down -> rule-based fallback")


def broken(*args):
    raise ConnectionError("groq unreachable")


backend.llm_score = broken
r, _ = evaluate("+12025550111", "FAILED")
body = r.get_json()
check("LLM error -> 200 silence", r.status_code == 200 and body["action"] == "silence")
check("reason notes fallback", body["reason"].startswith("Fallback"), body["reason"])
check("fallback call still logged", wait_for_flag("+12025550111"))

r, _ = evaluate("+14155550177", "PASSED")
body = r.get_json()
check("LLM error + clean rule score (<0.5) -> allow", body["action"] == "allow" and body["reason"].startswith("Fallback"))
check("allowed fallback call NOT logged", not wait_for_flag("+14155550177", timeout=0.3))

print("\n7. LLM hangs -> real timeout path stays under 5s")
backend.llm_score = real_llm_score
backend._call_groq = lambda *a: time.sleep(backend.LLM_TIMEOUT_S + 1)
r, elapsed = evaluate("+13125550199", "FAILED")
check("hung LLM -> silence fallback", r.get_json()["action"] == "silence" and "timeout" in r.get_json()["reason"])
check("responded in under 5s", elapsed < 5, f"{elapsed:.2f}s")

print("\n8. LLM returns garbage")
backend._call_groq = lambda *a: float("not json")
r, _ = evaluate("+13125550200", "PASSED")
check("unparseable output -> fallback (allow, clean number)",
      r.get_json()["action"] == "allow" and r.get_json()["reason"].startswith("Fallback"))

print("\n9. Malformed requests never 500")
for name, kwargs in [("empty body", {}), ("not JSON", {"data": "hello"}),
                     ("wrong types", {"json": {"caller_id": 123, "timestamp": "soon"}})]:
    r = client.post("/evaluate", **kwargs)
    check(f"{name} -> 200 with action", r.status_code == 200 and "action" in r.get_json(), r.get_json())

print("\n10. /flagged-calls and /resolve")
r = client.get("/flagged-calls")
flagged = r.get_json()
print(f"        {flagged}")
check("flagged list is newest first", [c["id"] for c in flagged] == sorted((c["id"] for c in flagged), reverse=True))
check("events have dashboard fields",
      all(set(c) == {"id", "caller_id", "confidence_score", "reason", "timestamp", "status"} for c in flagged))
check("new events are pending", all(c["status"] == "pending" for c in flagged))

target = next(c for c in flagged if c["caller_id"] == "+15550198372")
r = client.post("/resolve", json={"id": target["id"], "resolution": "whitelist"})
print(f"        {r.get_json()}")
check("resolve whitelist ok", r.status_code == 200 and r.get_json()["call"]["status"] == "whitelisted")
mock_llm(0.99)
r, _ = evaluate("+15550198372", "FAILED")
check("whitelisted number -> allow even at 0.99", r.get_json()["action"] == "allow")

target = next(c for c in flagged if c["caller_id"] == "+12025550111")
r = client.post("/resolve", json={"id": target["id"], "resolution": "block"})
check("resolve block ok", r.status_code == 200 and r.get_json()["call"]["status"] == "blocked")
mock_llm(0.01)
r, _ = evaluate("+12025550111", "PASSED")
check("blocked number -> reject even at 0.01 (and beats bypass)", r.get_json()["action"] == "reject")

check("resolve bad resolution -> 400", client.post("/resolve", json={"id": 1, "resolution": "maybe"}).status_code == 400)
check("resolve unknown id -> 404", client.post("/resolve", json={"id": 9999, "resolution": "block"}).status_code == 404)

if backend.GROQ_API_KEY:
    print("\n11. Live Groq call")
    import importlib

    importlib.reload(backend)
    client = backend.app.test_client()
    r, elapsed = evaluate("+15559876543", "FAILED")
    body = r.get_json()
    print(f"        reason: {body['reason']}")
    check("live call returns valid action", body["action"] in ("allow", "silence", "reject"))
    check("live call under 5s", elapsed < 5, f"{elapsed:.2f}s")
    check("live call used LLM (not fallback)", not body["reason"].startswith("Fallback"), body["reason"])
else:
    print("\n(Skipping live Groq test: GROQ_API_KEY not set in .env)")

print(f"\nAll {passed} checks passed.")
