import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, PhoneOff, AlertTriangle,
  CheckCircle2, XCircle, RefreshCw, Smartphone,
  UserCheck, Trash2, CreditCard, Settings,
  History, Sliders, ChevronRight, ExternalLink, Lock, PhoneIncoming
} from 'lucide-react';

import SpringCounter from './components/SpringCounter';
import RadialRiskRing from './components/RadialRiskRing';

// Interactive Drawers & Modals
import DeviceSwitcherModal from './components/DeviceSwitcherModal';
import WhitelistDrawer from './components/WhitelistDrawer';
import HistoryDrawer from './components/HistoryDrawer';
import ProtectionRulesDrawer from './components/ProtectionRulesDrawer';
import SubscriptionModal from './components/SubscriptionModal';

function normalizeDigits(raw = '') {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function formatDisplayNumber(raw = '') {
  const ten = normalizeDigits(raw);
  if (ten.length === 10) {
    return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return raw || '';
}

const INITIAL_METRICS = {
  wakesPrevented: 1,
  latencyMs: 380,
  threatsScrubbed: 1,
  whitelistedTotal: 0
};

const INITIAL_QUEUE = [];
const INITIAL_WHITELIST = [];
const INITIAL_HISTORY = [
  {
    number: '+1 (888) 555-9999',
    reason: 'Automated Tech Support Scam',
    action: 'Auto-Blocked (>90%)',
    time: '12m ago',
    score: 97
  }
];

export default function App() {
  const [activeDeviceId, setActiveDeviceId] = useState('mom-s24');

  // --- DRAWERS & MODALS STATE ---
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showWhitelistDrawer, setShowWhitelistDrawer] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Toast Notification state: { message: string, type: 'info' | 'amber' | 'rose' }
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const seenEventIdsRef = useRef(new Set());
  const seenPythonFlagIdsRef = useRef(new Set());
  const localTriggeredNumsRef = useRef(new Map());

  // Metrics
  const [metrics, setMetrics] = useState({ ...INITIAL_METRICS });

  // Review Queue (50% - 90% confidence)
  const [quarantineQueue, setQuarantineQueue] = useState([...INITIAL_QUEUE]);

  // Whitelisted contacts list
  const [whitelist, setWhitelist] = useState([...INITIAL_WHITELIST]);

  // Call history
  const [history, setHistory] = useState([...INITIAL_HISTORY]);

  // Protection Rules / Settings State
  const [settings, setSettings] = useState({
    smsAlerts: true,
    pushAlerts: true,
    autoDropThreshold: 90,
    quarantineThreshold: 50,
    emergencyRepeatBypass: true,
    caregiverPhone: '+1 (555) 019-2273'
  });

  const showToast = (message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Poll /api/state to pick up calls from Android Emulator & Python Flask /flagged-calls
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const data = await res.json();

        // 1. Sync whitelist from phone / backend
        if (Array.isArray(data.whitelist)) {
          setWhitelist((prev) => {
            const existing = new Set(prev.map((c) => normalizeDigits(c.number)));
            const newEntries = data.whitelist
              .filter((num) => !existing.has(normalizeDigits(num)))
              .map((num) => ({
                number: formatDisplayNumber(num),
                name: formatDisplayNumber(num)
              }));
            if (newEntries.length === 0 && prev.length === data.whitelist.length) return prev;
            const merged = [...prev, ...newEntries].filter((item) =>
              data.whitelist.some((w) => normalizeDigits(w) === normalizeDigits(item.number))
            );
            setMetrics((m) => ({ ...m, whitelistedTotal: merged.length }));
            return merged;
          });
        }

        // 2. Sync blacklist from phone / backend
        if (Array.isArray(data.blacklist)) {
          setHistory((prev) => {
            const existing = new Set(prev.map((c) => normalizeDigits(c.number)));
            const newEntries = data.blacklist
              .filter((num) => !existing.has(normalizeDigits(num)))
              .map((num) => ({
                number: formatDisplayNumber(num),
                reason: 'Blocked Scam Call',
                action: 'Blocked',
                time: 'Synced',
                score: 95
              }));
            if (newEntries.length === 0 && prev.length === data.blacklist.length) return prev;
            const merged = [...prev, ...newEntries].filter((item) =>
              data.blacklist.some((b) => normalizeDigits(b) === normalizeDigits(item.number))
            );
            setMetrics((m) => ({ ...m, threatsScrubbed: merged.length }));
            return merged;
          });
        }

        // 3. Sync pending calls directly from Python backend /flagged-calls
        if (Array.isArray(data.flaggedCalls)) {
          for (const fc of data.flaggedCalls) {
            if (fc.status !== 'pending') continue;
            if (seenPythonFlagIdsRef.current.has(fc.id)) continue;
            seenPythonFlagIdsRef.current.add(fc.id);

            const norm = normalizeDigits(fc.caller_id);
            const displayCaller = formatDisplayNumber(fc.caller_id);
            const pctScore = Math.round((fc.confidence_score ?? 0.78) * 100);

            setQuarantineQueue((prev) => {
              const existingIdx = prev.findIndex(
                (c) => normalizeDigits(c.callerId) === norm
              );
              if (existingIdx !== -1) {
                // Attach Python backendId & real Groq LLM reason to existing card
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  backendId: fc.id,
                  riskScore: pctScore || updated[existingIdx].riskScore,
                  reason: fc.reason || updated[existingIdx].reason
                };
                return updated;
              }
              return [
                {
                  id: `py-${fc.id}`,
                  backendId: fc.id,
                  callerId: displayCaller,
                  origin: 'Screened by KinGuard AI',
                  riskScore: pctScore,
                  stirShaken: 'Unverified / Spoofed ID',
                  timestamp: 'Just now',
                  reason: fc.reason || 'Silenced for caregiver review',
                  transcript:
                    'Call silenced before ringing Mom\'s phone. Awaiting caregiver decision.',
                  tags: ['Silenced', 'Groq AI Scored']
                },
                ...prev
              ];
            });
          }
        }

        if (!Array.isArray(data.events)) return;

        for (const ev of data.events) {
          if (seenEventIdsRef.current.has(ev.id)) continue;
          seenEventIdsRef.current.add(ev.id);

          // Live Audio Transcription Demo Event (from python-backend/audio_demo.py)
          if (ev.isAudioDemo) {
            if (ev.backendId) {
              seenPythonFlagIdsRef.current.add(ev.backendId);
            }
            if (ev.latencyMs) {
              setMetrics((m) => ({ ...m, latencyMs: ev.latencyMs }));
            }

            const audioCard = {
              id: ev.id,
              backendId: ev.backendId ?? null,
              callerId: ev.callerId,
              origin: 'Live Voice AI (Groq Whisper + LLM)',
              riskScore: ev.score || 96,
              stirShaken: ev.action === 'reject' ? 'Scam Audio Severed' : 'Voice Flagged',
              timestamp: 'Just now',
              reason: ev.reason || 'Social engineering detected in call audio',
              transcript:
                ev.transcript ||
                'Audio stream transcribed and analyzed by KinGuard AI.',
              tags:
                Array.isArray(ev.tags) && ev.tags.length > 0
                  ? ev.tags
                  : ['Voice AI Flagged', 'Live Transcript']
            };

            setQuarantineQueue((prev) => [
              audioCard,
              ...prev.filter((c) => normalizeDigits(c.callerId) !== ev.rawNumber)
            ]);

            if (ev.action === 'reject') {
              setHistory((prev) => [
                {
                  number: ev.callerId,
                  reason: ev.reason || 'Voice Scam Detected',
                  action: 'Voice AI Auto-Blocked (>90%)',
                  time: 'Just now',
                  score: ev.score || 96
                },
                ...prev.filter((h) => normalizeDigits(h.number) !== ev.rawNumber)
              ]);
              setMetrics((m) => ({
                ...m,
                threatsScrubbed: m.threatsScrubbed + 1,
                wakesPrevented: m.wakesPrevented + 1
              }));
              showToast(
                `Voice AI Detected Scam (${ev.score}%): Transcribed & blocked ${ev.callerId}!`,
                'rose'
              );
            } else {
              setMetrics((m) => ({ ...m, wakesPrevented: m.wakesPrevented + 1 }));
              showToast(
                `Voice AI Transcribed ${ev.callerId} (${ev.score}% risk) — added to review queue.`,
                'amber'
              );
            }
            continue;
          }

          // Skip duplicating UI entries if this call was just triggered by a website Demo button (<4s ago)
          const recentButtonTs = localTriggeredNumsRef.current.get(ev.rawNumber);
          if (recentButtonTs && Date.now() - recentButtonTs < 4000) {
            continue;
          }

          if (ev.action === 'silence') {
            setQuarantineQueue((prev) => {
              if (prev.some((c) => normalizeDigits(c.callerId) === ev.rawNumber)) return prev;
              return [
                {
                  id: ev.id,
                  backendId: ev.backendId ?? null,
                  callerId: ev.callerId,
                  origin: 'Incoming Call',
                  riskScore: ev.score || 78,
                  stirShaken: 'Unverified ID',
                  timestamp: 'Just now',
                  reason: ev.reason || 'Unknown caller silenced for caregiver review',
                  transcript:
                    'Incoming call silenced so phone was not disturbed. Awaiting review.',
                  tags: ['Silenced', 'Review Needed']
                },
                ...prev
              ];
            });
            setMetrics((m) => ({ ...m, wakesPrevented: m.wakesPrevented + 1 }));
            showToast(`Call from ${ev.callerId} silenced and waiting for review.`, 'amber');
          } else if (ev.action === 'reject') {
            setHistory((prev) => [
              {
                number: ev.callerId,
                reason: ev.reason || 'Blocked Scam Call',
                action: 'Auto-Blocked (>90%)',
                time: 'Just now',
                score: ev.score || 97
              },
              ...prev
            ]);
            setMetrics((m) => ({ ...m, threatsScrubbed: m.threatsScrubbed + 1 }));
            showToast(`Auto-blocked scam call from ${ev.callerId}.`, 'rose');
          } else if (ev.action === 'allow') {
            const isRepeat = ev.reason?.toLowerCase().includes('repeat');
            showToast(
              isRepeat
                ? `Emergency Repeat Caller (${ev.callerId}) bypassed suppression and is ringing phone!`
                : `Allowed caller ${ev.callerId} is ringing through.`,
              'info'
            );
          }
        }
      } catch {
        // Ignore polling errors if server is restarting
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  // Queue resolution handlers
  const handleAction = async (callId, action) => {
    const target = quarantineQueue.find((c) => c.id === callId);
    setQuarantineQueue((prev) => prev.filter((c) => c.id !== callId));

    if (action === 'whitelist') {
      const allowedNum = target ? target.callerId : '+1 (555) 000-0000';
      setWhitelist((prev) => {
        const next = [
          { number: allowedNum, name: allowedNum },
          ...prev.filter((c) => normalizeDigits(c.number) !== normalizeDigits(allowedNum))
        ];
        setMetrics((m) => ({ ...m, whitelistedTotal: next.length }));
        return next;
      });

      try {
        await fetch('/api/whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: target?.callerId,
            backendId: target?.backendId ?? null
          })
        });
        await fetch('/api/sim-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: target?.callerId, action: 'cancel' })
        });
      } catch {
        // Continue gracefully if offline
      }

      showToast(
        `Allowed ${target?.callerId}. Future calls will ring normally!`,
        'info'
      );
    } else {
      const blockedNum = target?.callerId || 'Blocked';
      setHistory((prev) => {
        const next = [
          {
            number: blockedNum,
            reason: target?.reason || 'Scam Call',
            action: 'Blocked by Caregiver',
            time: 'Just now',
            score: target?.riskScore || 80
          },
          ...prev.filter((h) => normalizeDigits(h.number) !== normalizeDigits(blockedNum))
        ];
        setMetrics((m) => ({ ...m, threatsScrubbed: next.length }));
        return next;
      });

      try {
        await fetch('/api/blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number: target?.callerId,
            backendId: target?.backendId ?? null
          })
        });
      } catch {
        // Continue gracefully if offline
      }

      showToast(
        `Blocked ${target?.callerId} and hung up.`,
        'rose'
      );
    }
  };

  // DEMO SIMULATOR TRIGGERS (Wired to Android Studio Emulator via /api/sim-call)
  const triggerScamSim = async () => {
    const simDisplayNumber = '+1 (800) 582-8888';
    const simRawDigits = '8005828888';
    localTriggeredNumsRef.current.set(simRawDigits, Date.now());

    let adbResult = null;
    try {
      const res = await fetch('/api/sim-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '+18005828888' })
      });
      if (res.ok) {
        adbResult = await res.json();
      }
    } catch {
      // Fallback to UI simulation if offline
    }

    // If caregiver already whitelisted +1 (800) 582-8888, it will ring out loud on the emulator!
    if (adbResult?.isWhitelisted) {
      showToast(
        `Dialing ${simDisplayNumber} on Android Emulator — Caller is now Allowed, so Mom's phone rings normally!`,
        'info'
      );
      return;
    }

    // If caregiver already blocked +1 (800) 582-8888, it will be rejected on the emulator!
    if (adbResult?.isBlacklisted) {
      setMetrics((m) => ({ ...m, threatsScrubbed: m.threatsScrubbed + 1 }));
      showToast(
        `Dialing ${simDisplayNumber} on Android Emulator — Number is on Blocklist, so the call was rejected automatically.`,
        'rose'
      );
      return;
    }

    const newCall = {
      id: `call-${Date.now()}`,
      backendId: null,
      callerId: simDisplayNumber,
      origin: 'Unknown VoIP Caller',
      riskScore: 88,
      stirShaken: 'Unverified ID',
      timestamp: 'Just now',
      reason: 'IRS tax threat pattern detected',
      transcript:
        'This is the Internal Revenue Service criminal division. Local county deputies are currently dispatched to your address for immediate arrest unless payment is processed today.',
      tags: ['Immediate threat', 'IRS impersonation', 'Payment demand']
    };

    setQuarantineQueue((prev) => [
      newCall,
      ...prev.filter((c) => c.callerId !== simDisplayNumber)
    ]);
    setMetrics((m) => ({ ...m, wakesPrevented: m.wakesPrevented + 1 }));

    showToast(
      adbResult?.ok
        ? `Sent ${simDisplayNumber} to Android Emulator: ringer silenced and added to your review queue.`
        : `Simulated ${simDisplayNumber} (88% risk): added to review queue (start Android Emulator for live call).`,
      'amber'
    );
  };

  const triggerHighRiskDrop = async () => {
    const simDisplayNumber = '+1 (888) 555-9999';
    const simRawDigits = '8885559999';
    localTriggeredNumsRef.current.set(simRawDigits, Date.now());

    let adbResult = null;
    try {
      const res = await fetch('/api/sim-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '+18885559999' })
      });
      if (res.ok) {
        adbResult = await res.json();
      }
    } catch {
      // Fallback if offline
    }

    setMetrics((m) => ({
      ...m,
      threatsScrubbed: m.threatsScrubbed + 1
    }));

    setHistory((prev) => [
      {
        number: simDisplayNumber,
        reason: 'Automated Tech Support Scam',
        action: 'Auto-Blocked (>90%)',
        time: 'Just now',
        score: 97
      },
      ...prev
    ]);

    showToast(
      adbResult?.ok
        ? `Sent ${simDisplayNumber} to Android Emulator: call silently rejected and hidden from Mom's call log.`
        : `High-risk scam call (${simDisplayNumber}) auto-blocked.`,
      'rose'
    );
  };

  const triggerLiveAnswerDrop = async () => {
    const simDisplayNumber = '+1 (800) 555-7777';
    const simRawDigits = '8005557777';
    localTriggeredNumsRef.current.set(simRawDigits, Date.now());

    let adbResult = null;
    try {
      const res = await fetch('/api/sim-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: '+18005557777' })
      });
      if (res.ok) {
        adbResult = await res.json();
      }
    } catch {
      // Fallback if offline
    }

    showToast(
      adbResult?.ok
        ? `Ringing ${simDisplayNumber} on Android Emulator — Answer the call on the emulator to see it auto-hangup after 5 seconds!`
        : `Triggered 5-second live call drop demo (${simDisplayNumber}).`,
      'amber'
    );
  };

  const resetQueue = async () => {
    setQuarantineQueue([]);
    setHistory([...INITIAL_HISTORY]);
    setWhitelist([]);
    setMetrics({ ...INITIAL_METRICS });
    seenEventIdsRef.current.clear();
    seenPythonFlagIdsRef.current.clear();
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {
      // Ignore if offline
    }
    showToast('Reset to clean demo baseline.', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row font-sans">
      {/* TOAST NOTIFICATION BANNER */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-medium max-w-xl border transition-all ${
            toast.type === 'rose'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : toast.type === 'amber'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-white border-slate-300 text-slate-800'
          }`}
        >
          {toast.type === 'rose' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
          ) : toast.type === 'amber' ? (
            <PhoneOff className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* LEFT SIDEBAR                                              */}
      {/* ========================================================= */}
      <aside className="w-full md:w-72 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between shrink-0 p-5 md:min-h-screen">
        <div>
          {/* Logo & Branding */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base tracking-tight">KinGuard</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-semibold">
                  Family
                </span>
              </div>
              <p className="text-xs text-slate-500">Caregiver Dashboard</p>
            </div>
          </div>

          {/* Protected Device Selector */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-semibold text-slate-500">
                Protected Phone
              </span>
              <button
                type="button"
                onClick={() => setShowDeviceModal(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Switch
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDeviceModal(true)}
              className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl p-3 flex items-center justify-between transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-slate-700 border border-slate-200">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                    Mom's Galaxy S24
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                  </div>
                  <div className="text-xs text-emerald-700 font-medium">
                    Quiet protection active
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 mb-6" aria-label="Dashboard sections">
            <button
              type="button"
              onClick={() => {
                setShowWhitelistDrawer(false);
                setShowHistoryDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition ${
                !showWhitelistDrawer && !showHistoryDrawer && !showRulesDrawer
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-600" aria-hidden="true" />
                <span>Overview &amp; Review</span>
              </div>
              {quarantineQueue.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  {quarantineQueue.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setShowWhitelistDrawer(true);
                setShowHistoryDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition ${
                showWhitelistDrawer
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                <span>Allowed Contacts</span>
              </div>
              <span className="text-xs text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {whitelist.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowHistoryDrawer(true);
                setShowWhitelistDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition ${
                showHistoryDrawer
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-rose-600" aria-hidden="true" />
                <span>Blocked Call Log</span>
              </div>
              <span className="text-xs text-slate-600 font-semibold bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                {history.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowRulesDrawer(true);
                setShowWhitelistDrawer(false);
                setShowHistoryDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition ${
                showRulesDrawer
                  ? 'bg-blue-50 text-blue-800 border border-blue-200 font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sliders className="w-4 h-4 text-slate-600" aria-hidden="true" />
                <span>Screening Rules</span>
              </div>
              <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-medium">
                &gt;{settings.autoDropThreshold}% Auto
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Plan & Profile Section */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" /> Plan
              </span>
              <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
                Active
              </span>
            </div>

            <div className="text-sm font-bold text-slate-900">Family Guardian</div>
            <div className="text-xs text-slate-500 mt-0.5 mb-3">1 of 3 devices protected</div>

            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1.5"
            >
              <span>Plan &amp; Server Settings</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between px-1 pt-1 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                SD
              </div>
              <div>
                <div className="text-slate-900 font-semibold text-xs">Sarah Davis</div>
                <div className="text-[11px] text-slate-500">Primary Caregiver</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
              title="Server &amp; Account Settings"
              aria-label="Server and Account Settings"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA                                         */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="border-b border-slate-200 px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 bg-white sticky top-0 z-20">
          <div>
            <h1 className="text-lg lg:text-xl font-bold text-slate-900 tracking-tight">
              KinGuard Protection Overview
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Unknown calls are screened quietly so Mom isn't disturbed by scam callers
            </p>
          </div>

          {/* Demo Simulator Controls (Connected to Android Emulator) */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs text-slate-500 font-semibold mr-1">
              Emulator Demo:
            </span>

            <button
              type="button"
              onClick={triggerScamSim}
              className="text-xs px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition flex items-center gap-1.5 font-semibold"
              title="Dial +1 (800) 582-8888 on Android Emulator (Silenced unless whitelisted)"
            >
              <PhoneOff className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
              <span>Simulate Suspicious Call (88%)</span>
            </button>

            <button
              type="button"
              onClick={triggerHighRiskDrop}
              className="text-xs px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 transition flex items-center gap-1.5 font-semibold"
              title="Dial +1 (888) 555-9999 on Android Emulator (Auto-rejected >90%)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />
              <span>Simulate Auto-Block (&gt;90%)</span>
            </button>

            <button
              type="button"
              onClick={triggerLiveAnswerDrop}
              className="text-xs px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 transition flex items-center gap-1.5 font-semibold"
              title="Dial +1 (800) 555-7777 on Android Emulator (Hangs up 5s after answering)"
            >
              <PhoneIncoming className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
              <span>Simulate 5s Answer Drop</span>
            </button>

            <button
              type="button"
              onClick={resetQueue}
              className="text-xs px-3 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition flex items-center gap-1.5 font-medium"
              title="Reset sample data &amp; hang up active emulator calls"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </header>

        {/* 2-PANEL WORKSPACE */}
        <main className="w-full flex-1 px-6 lg:px-8 py-6">
          <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* ========================================================= */}
            {/* PANEL 1: PROTECTED PHONE SUMMARY                          */}
            {/* ========================================================= */}
            <section
              aria-labelledby="device-summary-heading"
              className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm isolated-panel space-y-6"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                    <Smartphone className="w-6 h-6 text-blue-600" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="device-summary-heading" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      Mom's Galaxy S24
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Zero-UI Mode • No scam alerts shown on Mom's screen
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Protected</span>
                </span>
              </div>

              {/* 3 Summary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium block">
                    Interruptions Saved
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.wakesPrevented} colorClass="text-slate-900" />
                  </div>
                  <span className="text-xs text-emerald-700 font-medium block mt-1">
                    Ringer kept quiet
                  </span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium block">
                    Scams Blocked
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.threatsScrubbed} colorClass="text-slate-900" />
                  </div>
                  <span className="text-xs text-slate-600 font-medium block mt-1">
                    Hidden from call log
                  </span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500 font-medium block">
                    Screening Speed
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.latencyMs} suffix="ms" colorClass="text-slate-900" />
                  </div>
                  <span className="text-xs text-slate-600 font-medium block mt-1">
                    Instant check
                  </span>
                </div>
              </div>

              {/* Active Protection Rules Summary */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    How Calls Are Handled
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRulesDrawer(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Edit rules
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-200/80 text-sm">
                  <span className="text-slate-700">Saved Contacts &amp; Allowed List</span>
                  <span className="text-emerald-800 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200">
                    Always rings through
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-200/80 text-sm">
                  <span className="text-slate-700">High-Risk Scam (&gt;{settings.autoDropThreshold}% score)</span>
                  <span className="text-rose-800 text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200">
                    Blocked silently
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-slate-200/80 text-sm">
                  <span className="text-slate-700">
                    Uncertain Caller ({settings.quarantineThreshold}%–{settings.autoDropThreshold}%)
                  </span>
                  <span className="text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200">
                    Sent to caregiver review
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 text-sm">
                  <span className="text-slate-700">Repeat Caller Within 5 Minutes</span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${
                      settings.emergencyRepeatBypass
                        ? 'text-blue-800 bg-blue-50 border-blue-200'
                        : 'text-slate-600 bg-slate-100 border-slate-300'
                    }`}
                  >
                    {settings.emergencyRepeatBypass ? 'Allowed (Emergency safety)' : 'Screened normally'}
                  </span>
                </div>
              </div>

              {/* Reassuring Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  Synced with Android Emulator &amp; Python Backend
                </span>
                <button
                  type="button"
                  onClick={() => setShowWhitelistDrawer(true)}
                  className="text-blue-600 hover:text-blue-700 font-semibold"
                >
                  {whitelist.length} allowed contacts &rarr;
                </button>
              </div>
            </section>

            {/* ========================================================= */}
            {/* PANEL 2: CALLS NEEDING CAREGIVER REVIEW                   */}
            {/* ========================================================= */}
            <section
              aria-labelledby="review-queue-heading"
              className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm isolated-panel flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6 text-amber-600" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 id="review-queue-heading" className="text-lg font-bold text-slate-900">
                        Calls Waiting for Your Review
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        These unknown callers were silenced so Mom wasn't bothered. Choose whether to allow or block them.
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 shrink-0">
                    {quarantineQueue.length} Waiting
                  </span>
                </div>

                {/* Review Cards */}
                <div className="space-y-4">
                  {quarantineQueue.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 p-6">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
                      <div className="text-base font-bold text-slate-900">You're all caught up</div>
                      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                        No suspicious calls are waiting for review right now.
                      </p>
                    </div>
                  ) : (
                    quarantineQueue.map((call) => (
                      <div
                        key={call.id}
                        className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 hover:border-slate-300 transition space-y-4"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="text-lg font-bold text-slate-900">
                                {call.callerId}
                              </span>
                              <span className="text-xs px-2.5 py-0.5 rounded-md font-medium bg-amber-100/80 text-amber-900 border border-amber-300">
                                {call.stirShaken}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {call.origin} • {call.timestamp}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-wrap">
                            <RadialRiskRing score={call.riskScore} size={52} />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAction(call.id, 'whitelist')}
                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition flex items-center gap-1.5 font-semibold text-xs shadow-sm"
                                title="Allow this number to ring Mom's phone in the future"
                              >
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                <span>Allow Caller</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAction(call.id, 'block')}
                                className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 rounded-lg border border-rose-300 transition flex items-center gap-1.5 font-semibold text-xs"
                                title="Block this number permanently"
                              >
                                <XCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
                                <span>Block Number</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Reason & Voicemail Transcript */}
                        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-semibold text-slate-700">
                              Why this call was held: <span className="font-normal text-slate-600">{call.reason}</span>
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 italic border-t border-slate-100 pt-2 leading-relaxed">
                            "{call.transcript}"
                          </p>
                        </div>

                        {/* Simple Readable Tags */}
                        <div className="flex flex-wrap gap-1.5">
                          {call.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-0.5 text-xs rounded-md bg-white text-slate-600 border border-slate-200 font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="text-xs text-slate-500 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span>Approving a number syncs to Python &amp; the Android Emulator so future calls ring right through.</span>
                <span className="font-semibold text-slate-700">
                  {metrics.whitelistedTotal} Allowed Total
                </span>
              </div>
            </section>
          </div>
        </main>
      </div>

      {/* ========================================================= */}
      {/* DRAWERS & MODALS                                          */}
      {/* ========================================================= */}
      <DeviceSwitcherModal
        isOpen={showDeviceModal}
        onClose={() => setShowDeviceModal(false)}
        activeDeviceId={activeDeviceId}
        onSelectDevice={(id) => {
          setActiveDeviceId(id);
          setShowDeviceModal(false);
        }}
        onShowToast={showToast}
      />

      <WhitelistDrawer
        isOpen={showWhitelistDrawer}
        onClose={() => setShowWhitelistDrawer(false)}
        whitelist={whitelist}
        onAddContact={async (contact) => {
          setWhitelist((prev) => [contact, ...prev]);
          setMetrics((m) => ({ ...m, whitelistedTotal: m.whitelistedTotal + 1 }));
          try {
            await fetch('/api/whitelist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number: contact.number })
            });
          } catch {
            // Ignore if offline
          }
        }}
        onRemoveContact={async (number) => {
          setWhitelist((prev) => prev.filter((c) => c.number !== number));
          setMetrics((m) => ({ ...m, whitelistedTotal: Math.max(0, m.whitelistedTotal - 1) }));
          try {
            await fetch('/api/whitelist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ number, remove: true })
            });
          } catch {
            // Ignore if offline
          }
        }}
        onShowToast={showToast}
      />

      <HistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        history={history}
        onClearHistory={() => setHistory([])}
        onShowToast={showToast}
      />

      <ProtectionRulesDrawer
        isOpen={showRulesDrawer}
        onClose={() => setShowRulesDrawer(false)}
        settings={settings}
        onSaveSettings={async (newSettings) => {
          setSettings(newSettings);
          try {
            await fetch('/api/rules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newSettings)
            });
          } catch {
            // Ignore if offline
          }
        }}
        onShowToast={showToast}
      />

      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onShowToast={showToast}
      />
    </div>
  );
}
