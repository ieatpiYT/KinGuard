"""Tests for the KinGuard backend.

Run: ./venv/bin/python test_evaluate.py
Uses Flask's test client, so no server is needed.
The LLM is mocked so routing is deterministic.
If GROQ_API_KEY is set, one extra test hits the real Groq API.
"""

import importlib
import time
import unittest
from unittest.mock import patch

import app as backend


class TestKinGuardBackend(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        # Reset in-memory state between tests so tests don't leak into each other
        with backend._lock:
            backend.last_flagged_at.clear()
            if hasattr(backend, "flagged_calls"):
                backend.flagged_calls.clear()
            if hasattr(backend, "whitelisted_numbers"):
                backend.whitelisted_numbers.clear()
            if hasattr(backend, "blocked_numbers"):
                backend.blocked_numbers.clear()

    def evaluate(self, caller_id, verification="PASSED", **extra):
        body = {
            "caller_id": caller_id,
            "verification_status": verification,
            "call_direction": "INCOMING",
            "timestamp": int(time.time()),
            **extra,
        }
        start = time.perf_counter()
        response = self.client.post("/evaluate", json=body)
        elapsed = time.perf_counter() - start
        return response, elapsed

    def wait_for_flag(self, caller_id, timeout=1.0):
        deadline = time.perf_counter() + timeout
        while time.perf_counter() < deadline:
            flagged = self.client.get("/flagged-calls").get_json()
            if any(c["caller_id"] == caller_id for c in flagged):
                return True
            time.sleep(0.02)
        return False

    def test_01_health_check(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json().get("status"), "ok")

    @patch.object(backend, "llm_score", return_value=(0.12, "Verified domestic number"))
    def test_02_normal_call_allowed(self, _mock_llm):
        r, _ = self.evaluate("+14155550123", "PASSED")
        data = r.get_json()
        self.assertEqual(data["action"], "allow")
        self.assertEqual(set(data.keys()), {"action", "confidence_score", "reason"})

    @patch.object(backend, "llm_score", return_value=(0.78, "Caller ID verification failed"))
    def test_03_failed_verification_silenced_and_flagged(self, _mock_llm):
        r, _ = self.evaluate("+15550198372", "FAILED")
        self.assertEqual(r.get_json()["action"], "silence")
        self.assertTrue(self.wait_for_flag("+15550198372"))

    @patch.object(backend, "llm_score", return_value=(0.78, "Caller ID verification failed"))
    def test_04_repeat_caller_within_5_min_bypass(self, mock_llm):
        # First call triggers flag
        self.evaluate("+15550198372", "FAILED")
        mock_llm.reset_mock()

        # Second call within 5 minutes bypasses LLM
        r, _ = self.evaluate("+15550198372", "FAILED")
        data = r.get_json()
        self.assertEqual(data["action"], "allow")
        self.assertEqual(data["reason"], "Repeat caller within 5 min (emergency bypass)")
        mock_llm.assert_not_called()

    @patch.object(backend, "llm_score", return_value=(0.95, "Spoofed number, high risk"))
    def test_05_high_confidence_scam_rejected_and_bypass_expires(self, _mock_llm):
        r, _ = self.evaluate("+18005550000", "FAILED")
        self.assertEqual(r.get_json()["action"], "reject")

        # Expire the 5-minute bypass window
        with backend._lock:
            backend.last_flagged_at["+18005550000"] -= 301

        r, _ = self.evaluate("+18005550000", "FAILED")
        self.assertEqual(r.get_json()["action"], "reject")

    @patch.object(backend, "llm_score", side_effect=ConnectionError("groq unreachable"))
    def test_06_llm_down_triggers_rule_fallback(self, _mock_llm):
        # High-risk fallback -> silence & log
        r, _ = self.evaluate("+12025550111", "FAILED")
        data = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(data["action"], "silence")
        self.assertTrue(data["reason"].startswith("Fallback"))
        self.assertTrue(self.wait_for_flag("+12025550111"))

        # Low-risk fallback -> allow & do not log
        r, _ = self.evaluate("+14155550177", "PASSED")
        data = r.get_json()
        self.assertEqual(data["action"], "allow")
        self.assertTrue(data["reason"].startswith("Fallback"))
        self.assertFalse(self.wait_for_flag("+14155550177", timeout=0.3))

    def test_07_llm_hang_respects_timeout(self):
        def slow_groq(*_args):
            time.sleep(backend.LLM_TIMEOUT_S + 1)

        with patch.object(backend, "_call_groq", side_effect=slow_groq):
            r, elapsed = self.evaluate("+13125550199", "FAILED")
            data = r.get_json()
            self.assertEqual(data["action"], "silence")
            self.assertIn("timeout", data["reason"])
            self.assertLess(elapsed, 5.0)

    def test_08_llm_garbage_output_triggers_fallback(self):
        with patch.object(backend, "_call_groq", return_value="not valid json"):
            r, _ = self.evaluate("+13125550200", "PASSED")
            data = r.get_json()
            self.assertEqual(data["action"], "allow")
            self.assertTrue(data["reason"].startswith("Fallback"))

    def test_09_malformed_requests_never_500(self):
        payloads = [
            ("empty body", {}),
            ("not JSON", {"data": "hello"}),
            ("wrong types", {"json": {"caller_id": 123, "timestamp": "soon"}}),
        ]
        for label, kwargs in payloads:
            with self.subTest(payload=label):
                r = self.client.post("/evaluate", **kwargs)
                self.assertEqual(r.status_code, 200)
                self.assertIn("action", r.get_json())

    def test_10_flagged_calls_and_resolve_workflow(self):
        with patch.object(backend, "llm_score", return_value=(0.78, "Suspicious")):
            self.evaluate("+15550198372", "FAILED")
            self.evaluate("+12025550111", "FAILED")
            self.assertTrue(self.wait_for_flag("+12025550111"))

        flagged = self.client.get("/flagged-calls").get_json()
        ids = [c["id"] for c in flagged]
        self.assertEqual(ids, sorted(ids, reverse=True))

        expected_keys = {"id", "caller_id", "confidence_score", "reason", "timestamp", "status"}
        for call in flagged:
            self.assertEqual(set(call.keys()), expected_keys)
            self.assertEqual(call["status"], "pending")

        # Test Whitelisting
        target_whitelist = next(c for c in flagged if c["caller_id"] == "+15550198372")
        r = self.client.post("/resolve", json={"id": target_whitelist["id"], "resolution": "whitelist"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["call"]["status"], "whitelisted")

        with patch.object(backend, "llm_score", return_value=(0.99, "Scam")):
            r, _ = self.evaluate("+15550198372", "FAILED")
            self.assertEqual(r.get_json()["action"], "allow")

        # Test Blocking
        target_block = next(c for c in flagged if c["caller_id"] == "+12025550111")
        r = self.client.post("/resolve", json={"id": target_block["id"], "resolution": "block"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["call"]["status"], "blocked")

        with patch.object(backend, "llm_score", return_value=(0.01, "Safe")):
            r, _ = self.evaluate("+12025550111", "PASSED")
            self.assertEqual(r.get_json()["action"], "reject")

        # Test Error Codes
        self.assertEqual(
            self.client.post("/resolve", json={"id": 1, "resolution": "maybe"}).status_code,
            400,
        )
        self.assertEqual(
            self.client.post("/resolve", json={"id": 9999, "resolution": "block"}).status_code,
            404,
        )

    @unittest.skipUnless(backend.GROQ_API_KEY, "GROQ_API_KEY not set in .env")
    def test_11_live_groq_integration(self):
        importlib.reload(backend)
        self.client = backend.app.test_client()
        r, elapsed = self.evaluate("+15559876543", "FAILED")
        data = r.get_json()
        self.assertIn(data["action"], ("allow", "silence", "reject"))
        self.assertLess(elapsed, 5.0)
        self.assertFalse(data["reason"].startswith("Fallback"), data["reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
