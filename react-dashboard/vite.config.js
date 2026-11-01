import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:5001';

function normalizeDigits(raw = '') {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function formatE164(raw = '') {
  const ten = normalizeDigits(raw);
  if (ten.length === 10) {
    return `+1${ten}`;
  }
  const s = String(raw).trim();
  return s.startsWith('+') ? s : ten ? `+${ten}` : s;
}

function formatDisplayNumber(raw = '') {
  const ten = normalizeDigits(raw);
  if (ten.length === 10) {
    return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return raw;
}

function resolveAdbPath() {
  const candidates = [
    'C:\\Users\\Luke\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
      : null,
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb.exe')
      : null
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'adb';
}

function runAdbCommand(args) {
  const adbPath = resolveAdbPath();
  return new Promise((resolve) => {
    execFile(adbPath, args, { timeout: 4000 }, (error, stdout, stderr) => {
      if (error) {
        console.warn(`[KinGuard Bridge] ADB command failed (${adbPath}):`, error.message);
      } else {
        console.log(`[KinGuard Bridge] ADB command succeeded:`, args.join(' '));
      }
      resolve({
        ok: !error,
        adbPath,
        command: `${adbPath} ${args.join(' ')}`,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: error ? error.message : null
      });
    });
  });
}

async function callPythonBackend(endpoint, method = 'GET', bodyObj = null, timeoutMs = 2800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      signal: controller.signal
    };
    if (bodyObj !== null && method !== 'GET') {
      opts.body = JSON.stringify(bodyObj);
    }
    const res = await fetch(`${PYTHON_BACKEND_URL}${endpoint}`, opts);
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning');
  res.end(JSON.stringify(payload));
}

function kinGuardBridgePlugin() {
  const whitelist = new Set();
  const blacklist = new Set(['8885559999']);
  const events = [];
  let activeEmulatorCalls = new Set();
  let lastResetTime = 0;
  const callTimestamps = new Map();
  let rules = {
    autoDropThreshold: 90,
    quarantineThreshold: 50,
    emergencyRepeatBypass: true
  };

  return {
    name: 'kinguard-emulator-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';

        if (
          req.method === 'OPTIONS' &&
          (url.startsWith('/api/') || url === '/evaluate' || url === '/flagged-calls' || url === '/resolve' || url === '/health')
        ) {
          return sendJson(res, 200, { ok: true });
        }

        // Direct proxy for /health, /flagged-calls, /resolve
        if (req.method === 'GET' && url === '/health') {
          const pyHealth = await callPythonBackend('/health', 'GET');
          return sendJson(res, 200, pyHealth || { status: 'ok', llm_configured: false, model: 'bridge-fallback' });
        }

        if (req.method === 'GET' && url === '/flagged-calls') {
          const pyFlagged = await callPythonBackend('/flagged-calls', 'GET');
          return sendJson(res, 200, Array.isArray(pyFlagged) ? pyFlagged : []);
        }

        // 1. GET /api/state — Poll current whitelist, blacklist, live emulator call events, & Python /flagged-calls
        if (req.method === 'GET' && url === '/api/state') {
          const pyFlagged = await callPythonBackend('/flagged-calls', 'GET', null, 1200);
          return sendJson(res, 200, {
            ok: true,
            pythonConnected: Array.isArray(pyFlagged),
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist),
            events,
            flaggedCalls: Array.isArray(pyFlagged) ? pyFlagged : [],
            rules
          });
        }

        // 2. POST /api/sim-call — Trigger or cancel a simulated GSM call on the Android Emulator via ADB
        if (req.method === 'POST' && url === '/api/sim-call') {
          const body = await readJsonBody(req);
          const rawNumber = String(body.number || '+18005828888');
          const dialDigits = rawNumber.replace(/[^\d+]/g, '');
          const norm = normalizeDigits(rawNumber);

          if (body.action === 'cancel') {
            const result = await runAdbCommand(['emu', 'gsm', 'cancel', dialDigits]);
            activeEmulatorCalls.delete(dialDigits);
            return sendJson(res, 200, { ...result, dialDigits });
          }

          // Cancel any previous lingering simulated call from the same number first so the emulator re-rings cleanly
          await runAdbCommand(['emu', 'gsm', 'cancel', dialDigits]);

          const result = await runAdbCommand(['emu', 'gsm', 'call', dialDigits]);
          if (result.ok) {
            activeEmulatorCalls.add(dialDigits);
          }

          const isWhitelisted = whitelist.has(norm);
          const isBlacklisted = blacklist.has(norm);

          return sendJson(res, 200, {
            ...result,
            dialDigits,
            normalized: norm,
            isWhitelisted,
            isBlacklisted
          });
        }

        // 3. POST /api/whitelist — Add or remove a number from the shared whitelist & sync with Python /resolve & /sync
        if (req.method === 'POST' && url === '/api/whitelist') {
          const body = await readJsonBody(req);
          const norm = normalizeDigits(body.number || '');
          const e164 = formatE164(body.number || '');

          if (norm) {
            if (body.remove) {
              whitelist.delete(norm);
              await callPythonBackend('/sync', 'POST', { remove_whitelist: [norm, e164] });
            } else {
              whitelist.add(norm);
              blacklist.delete(norm);
              if (body.backendId != null) {
                await callPythonBackend('/resolve', 'POST', { id: Number(body.backendId), resolution: 'whitelist' });
              } else {
                // Also resolve any matching pending call in Python /flagged-calls
                const pyFlagged = await callPythonBackend('/flagged-calls', 'GET');
                if (Array.isArray(pyFlagged)) {
                  for (const fc of pyFlagged) {
                    if (fc.status === 'pending' && normalizeDigits(fc.caller_id) === norm) {
                      await callPythonBackend('/resolve', 'POST', { id: fc.id, resolution: 'whitelist' });
                    }
                  }
                }
              }
              await callPythonBackend('/sync', 'POST', { add_whitelist: [norm, e164] });
            }
          }
          return sendJson(res, 200, {
            ok: true,
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist)
          });
        }

        // 4. POST /api/blacklist — Add a number to the shared blacklist, sync with Python /resolve, & hang up on emulator
        if (req.method === 'POST' && url === '/api/blacklist') {
          const body = await readJsonBody(req);
          const rawNumber = String(body.number || '');
          const norm = normalizeDigits(rawNumber);
          const e164 = formatE164(rawNumber);

          if (norm) {
            blacklist.add(norm);
            whitelist.delete(norm);

            if (body.backendId != null) {
              await callPythonBackend('/resolve', 'POST', { id: Number(body.backendId), resolution: 'block' });
            } else {
              const pyFlagged = await callPythonBackend('/flagged-calls', 'GET');
              if (Array.isArray(pyFlagged)) {
                for (const fc of pyFlagged) {
                  if (fc.status === 'pending' && normalizeDigits(fc.caller_id) === norm) {
                    await callPythonBackend('/resolve', 'POST', { id: fc.id, resolution: 'block' });
                  }
                }
              }
            }
            await callPythonBackend('/sync', 'POST', { add_blocklist: [norm, e164] });

            await runAdbCommand(['emu', 'gsm', 'cancel', `+1${norm}`]);
            await runAdbCommand(['emu', 'gsm', 'cancel', norm]);
          }
          return sendJson(res, 200, {
            ok: true,
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist)
          });
        }

        // 5. POST /api/sync-contacts — Sync phone contacts into whitelist & Python backend
        if (req.method === 'POST' && url === '/api/sync-contacts') {
          const body = await readJsonBody(req);
          const toSync = [];
          if (Array.isArray(body.contacts)) {
            body.contacts.forEach((num) => {
              const norm = normalizeDigits(num);
              if (norm) {
                whitelist.add(norm);
                toSync.push(norm, formatE164(norm));
              }
            });
          }
          if (toSync.length > 0) {
            await callPythonBackend('/sync', 'POST', { add_whitelist: toSync });
          }
          return sendJson(res, 200, {
            ok: true,
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist)
          });
        }

        // 6. POST /api/rules — Update screening thresholds
        if (req.method === 'POST' && url === '/api/rules') {
          const body = await readJsonBody(req);
          rules = { ...rules, ...body };
          return sendJson(res, 200, { ok: true, rules });
        }

        // 6b. POST /api/audio-event — Receive live Whisper transcript + Groq LLM verdict from python-backend/audio_demo.py
        if (req.method === 'POST' && url === '/api/audio-event') {
          const body = await readJsonBody(req);
          const rawNumber = String(body.callerId || '+18005557777');
          const norm = normalizeDigits(rawNumber);
          const displayCaller = formatDisplayNumber(rawNumber || norm);
          const action = String(body.action || 'reject').toLowerCase();
          const score = Number(body.score ?? 96);
          const reason = String(body.reason || 'High-risk scam language detected in audio');
          const transcript = String(body.transcript || '');
          const tags = Array.isArray(body.tags) && body.tags.length > 0
            ? body.tags
            : ['Voice AI Flagged', 'Live Transcript'];

          let emulatorSevered = false;
          if (body.hangupEmulator || action === 'reject' || action === 'silence') {
            if (norm) {
              blacklist.add(norm);
              await runAdbCommand(['emu', 'gsm', 'cancel', `+1${norm}`]);
              await runAdbCommand(['emu', 'gsm', 'cancel', norm]);
            }
            for (const activeNum of activeEmulatorCalls) {
              await runAdbCommand(['emu', 'gsm', 'cancel', activeNum]);
            }
            activeEmulatorCalls.clear();
            emulatorSevered = true;
          }

          const event = {
            id: `audio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            backendId: body.backendId ?? null,
            isAudioDemo: true,
            callerId: displayCaller,
            rawNumber: norm,
            action,
            score,
            reason,
            transcript,
            tags,
            latencyMs: Number(body.latencyMs || 420),
            timestamp: Date.now()
          };
          events.unshift(event);
          if (events.length > 30) events.pop();

          console.log('[KinGuard Bridge] Synced live Whisper audio transcript event:', event.callerId, `(${score}%)`);

          return sendJson(res, 200, {
            ok: true,
            emulatorSevered,
            event
          });
        }

        // 7. POST /api/reset — Reset demo state, Python backend state, and cancel active emulator calls
        if (req.method === 'POST' && url === '/api/reset') {
          whitelist.clear();
          blacklist.clear();
          blacklist.add('8885559999');
          events.length = 0;
          lastResetTime = Date.now();
          callTimestamps.clear();

          await callPythonBackend('/reset', 'POST', {});
          await callPythonBackend('/sync', 'POST', { add_blocklist: ['8885559999', '+18885559999'] });

          for (const num of activeEmulatorCalls) {
            await runAdbCommand(['emu', 'gsm', 'cancel', num]);
          }
          activeEmulatorCalls.clear();
          await runAdbCommand(['emu', 'gsm', 'cancel', '+18005828888']);
          await runAdbCommand(['emu', 'gsm', 'cancel', '+18885559999']);
          await runAdbCommand(['emu', 'gsm', 'cancel', '+18005557777']);

          return sendJson(res, 200, {
            ok: true,
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist)
          });
        }

        // 8. POST /evaluate (or /api/evaluate) — Called by Android ScamCallScreeningService & Dashboard healthcheck
        if (req.method === 'POST' && (url === '/evaluate' || url === '/api/evaluate')) {
          const body = await readJsonBody(req);

          if (body.ping) {
            const pyHealth = await callPythonBackend('/health', 'GET');
            return sendJson(res, 200, {
              status: 'ok',
              pythonHealth: pyHealth,
              whitelist: Array.from(whitelist),
              blacklist: Array.from(blacklist)
            });
          }

          console.log('[KinGuard Bridge] Received call screening request from Android:', body);

          if (Array.isArray(body.contacts)) {
            const contactList = [];
            body.contacts.forEach((num) => {
              const norm = normalizeDigits(num);
              if (norm) {
                whitelist.add(norm);
                contactList.push(norm, formatE164(norm));
              }
            });
            if (contactList.length > 0) {
              await callPythonBackend('/sync', 'POST', { add_whitelist: contactList });
            }
          }

          const rawNumber = String(body.caller_id || body.number || '');
          const norm = normalizeDigits(rawNumber);
          const e164 = formatE164(rawNumber || norm);

          // Verify repeat caller against session reset time
          const prevCallTime = callTimestamps.get(norm) || 0;
          const isRepeatCaller = prevCallTime > lastResetTime && Date.now() - prevCallTime < 5 * 60 * 1000;
          callTimestamps.set(norm, Date.now());

          // Forward to Python Flask backend (:5001/evaluate) so Groq LLM scores & logs the call!
          const pyPayload = {
            caller_id: e164,
            verification_status: body.verification_status || 'FAILED',
            call_direction: body.call_direction || 'INCOMING',
            timestamp: body.timestamp || Math.floor(Date.now() / 1000)
          };
          const pyRes = await callPythonBackend('/evaluate', 'POST', pyPayload, 2600);

          let action = 'allow';
          let score = 15;
          let reason = 'Verified safe caller';

          if (whitelist.has(norm)) {
            action = 'allow';
            score = 5;
            reason = 'Allowed by caregiver whitelist';
          } else if (blacklist.has(norm) || norm.endsWith('9999')) {
            action = 'reject';
            score = pyRes ? Math.max(97, Math.round((pyRes.confidence_score || 0.97) * 100)) : 97;
            reason =
              pyRes && pyRes.reason && pyRes.reason !== 'Blocked number'
                ? pyRes.reason
                : norm.endsWith('9999')
                ? 'Automated Tech Support Scam (>90% Auto-Block)'
                : 'Blocked scam number';
          } else if (isRepeatCaller && rules.emergencyRepeatBypass) {
            action = 'allow';
            score = 0;
            reason = (pyRes && pyRes.reason) || 'Repeat caller within 5-minute emergency window';
          } else if (norm.endsWith('7777')) {
            action = 'drop_after_answer';
            score = 92;
            reason = 'Live Call Audio Scam Detected (Auto-hangup 5s after answer)';
          } else if (pyRes && pyRes.action) {
            // Use the live Python Flask + Groq LLM decision!
            action = pyRes.action;
            score = Math.round((pyRes.confidence_score ?? 0.78) * 100);
            reason = pyRes.reason || 'Flagged by KinGuard AI screening';
            // Guarantee demo button 8888 silences for review if LLM returned <0.50
            if (norm.endsWith('8888') && action === 'allow') {
              action = 'silence';
              score = 88;
            }
          } else if (norm.endsWith('8888')) {
            action = 'silence';
            score = 88;
            reason = 'IRS tax threat pattern detected';
          } else {
            action = 'silence';
            score = 74;
            reason = 'Unknown caller silenced for caregiver review';
          }

          // Fetch latest backendId if Python logged this call in /flagged-calls
          let backendId = null;
          if (action === 'silence') {
            const pyFlagged = await callPythonBackend('/flagged-calls', 'GET', null, 1000);
            if (Array.isArray(pyFlagged)) {
              const match = pyFlagged.find(
                (fc) => fc.status === 'pending' && normalizeDigits(fc.caller_id) === norm
              );
              if (match) {
                backendId = match.id;
              }
            }
          }

          const event = {
            id: backendId ? `py-${backendId}` : `emu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            backendId,
            callerId: formatDisplayNumber(rawNumber || norm),
            rawNumber: norm,
            action,
            score,
            reason,
            timestamp: Date.now()
          };
          events.unshift(event);
          if (events.length > 30) events.pop();

          return sendJson(res, 200, {
            action,
            confidence_score: Number((score / 100).toFixed(2)),
            score,
            reason,
            clearRecentCache: prevCallTime <= lastResetTime,
            whitelist: Array.from(whitelist),
            blacklist: Array.from(blacklist)
          });
        }

        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), kinGuardBridgePlugin()],
  server: {
    host: true,
    port: 5173
  }
});
