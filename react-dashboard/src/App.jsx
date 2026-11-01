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
                    "Call silenced before ringing Mom's phone. Awaiting caregiver decision.",
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

          // Live Audio Transcription Demo Event (from python-backend/audio_demo.py or :5001 web console)
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

    if (adbResult?.isWhitelisted) {
      showToast(
        `Dialing ${simDisplayNumber} on Android Emulator — Caller is now Allowed, so Mom's phone rings normally!`,
        'info'
      );
      return;
    }

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
    <div className="min-h-screen bg-white text-[#18365A] flex flex-col md:flex-row font-sans">
      {/* TOAST NOTIFICATION BANNER */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 text-sm font-semibold max-w-xl border transition-all ${
            toast.type === 'rose'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : toast.type === 'amber'
              ? 'bg-[#FFF3EB] border-[#F9C8A7] text-[#C24E0A]'
              : 'bg-[#EFF5EC] border-[#C3D7BC] text-[#18365A]'
          }`}
        >
          {toast.type === 'rose' ? (
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
          ) : toast.type === 'amber' ? (
            <PhoneOff className="w-4 h-4 text-[#FD7A2C] shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-[#6A8B5E] shrink-0" aria-hidden="true" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* LEFT SIDEBAR                                              */}
      {/* ========================================================= */}
      <aside className="w-full md:w-72 bg-[#FBF9ED]/70 border-b md:border-b-0 md:border-r border-[#E5E0C8] flex flex-col justify-between shrink-0 p-5 md:min-h-screen">
        <div>
          {/* Logo & Branding */}
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-[#E5E0C8]">
            <img
              src="/kinguard-mark.jpg"
              alt="KinGuard Shield Logo"
              className="w-12 h-12 rounded-xl object-cover shadow-sm border border-[#6A8B5E]/30 shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-[#18365A] text-xl tracking-tight">
                  KinGuard
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#FFF3EB] text-[#C24E0A] border border-[#F9C8A7] font-bold">
                  Family
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium">Caregiver Dashboard</p>
            </div>
          </div>

          {/* Protected Device Selector */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-xs font-bold text-slate-600">
                Protected Phone
              </span>
              <button
                type="button"
                onClick={() => setShowDeviceModal(true)}
                className="text-xs text-[#4F6B45] hover:text-[#18365A] font-bold"
              >
                Switch
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDeviceModal(true)}
              className="w-full text-left bg-white hover:bg-[#EFF5EC]/60 border border-[#C3D7BC] rounded-xl p-3 flex items-center justify-between transition shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#EFF5EC] flex items-center justify-center text-[#4F6B45] border border-[#C3D7BC]">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </div>
                <div>
                  <div className="font-bold text-sm text-[#18365A] flex items-center gap-2">
                    Mom's Galaxy S24
                    <span className="w-2 h-2 rounded-full bg-[#6A8B5E]" title="Online" />
                  </div>
                  <div className="text-xs text-[#4F6B45] font-semibold">
                    Quiet protection active
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5 mb-6" aria-label="Dashboard sections">
            <button
              type="button"
              onClick={() => {
                setShowWhitelistDrawer(false);
                setShowHistoryDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-sm transition ${
                !showWhitelistDrawer && !showHistoryDrawer && !showRulesDrawer
                  ? 'bg-[#6A8B5E] text-white shadow-sm'
                  : 'text-[#18365A] hover:bg-[#EFF5EC]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck
                  className={`w-4 h-4 ${
                    !showWhitelistDrawer && !showHistoryDrawer && !showRulesDrawer
                      ? 'text-[#FBF9ED]'
                      : 'text-[#6A8B5E]'
                  }`}
                  aria-hidden="true"
                />
                <span>Overview &amp; Review</span>
              </div>
              {quarantineQueue.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-[#FD7A2C] text-white">
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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-sm transition ${
                showWhitelistDrawer
                  ? 'bg-[#6A8B5E] text-white shadow-sm'
                  : 'text-[#18365A] hover:bg-[#EFF5EC]'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-4 h-4 text-[#6A8B5E]" aria-hidden="true" />
                <span>Allowed Contacts</span>
              </div>
              <span className="text-xs text-[#18365A] font-bold bg-white px-2 py-0.5 rounded-md border border-[#E5E0C8]">
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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-sm transition ${
                showHistoryDrawer
                  ? 'bg-[#6A8B5E] text-white shadow-sm'
                  : 'text-[#18365A] hover:bg-[#EFF5EC]'
              }`}
            >
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-[#FD7A2C]" aria-hidden="true" />
                <span>Blocked Call Log</span>
              </div>
              <span className="text-xs text-[#18365A] font-bold bg-white px-2 py-0.5 rounded-md border border-[#E5E0C8]">
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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-sm transition ${
                showRulesDrawer
                  ? 'bg-[#6A8B5E] text-white shadow-sm'
                  : 'text-[#18365A] hover:bg-[#EFF5EC]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sliders className="w-4 h-4 text-[#18365A]" aria-hidden="true" />
                <span>Screening Rules</span>
              </div>
              <span className="text-xs text-[#18365A] bg-white px-2 py-0.5 rounded-md border border-[#E5E0C8] font-semibold">
                &gt;{settings.autoDropThreshold}% Auto
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Plan & Profile Section */}
        <div className="pt-4 border-t border-[#E5E0C8] space-y-3">
          <div className="bg-white border border-[#E5E0C8] rounded-xl p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" /> Plan
              </span>
              <span className="text-[11px] bg-[#EFF5EC] text-[#4F6B45] px-2 py-0.5 rounded-full font-bold border border-[#C3D7BC]">
                Active
              </span>
            </div>

            <div className="font-display text-sm font-bold text-[#18365A]">Family Guardian</div>
            <div className="text-xs text-slate-500 mt-0.5 mb-3">1 of 3 devices protected</div>

            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full py-2 px-3 rounded-lg bg-[#FBF9ED] hover:bg-[#EFF5EC] text-[#18365A] border border-[#E5E0C8] font-bold text-xs transition flex items-center justify-center gap-1.5"
            >
              <span>Plan &amp; Server Settings</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center justify-between px-1 pt-1 text-xs text-slate-600">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#18365A] text-[#FBF9ED] flex items-center justify-center font-bold text-xs">
                SD
              </div>
              <div>
                <div className="text-[#18365A] font-bold text-xs">Sarah Davis</div>
                <div className="text-[11px] text-slate-500">Primary Caregiver</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSubscriptionModal(true)}
              className="p-2 text-slate-600 hover:text-[#18365A] rounded-lg hover:bg-[#EFF5EC] transition"
              title="Server &amp; Account Settings"
              aria-label="Server and Account Settings"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA (Crisp White Main Background)           */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Header */}
        <header className="border-b border-[#E5E0C8] px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-4 bg-white sticky top-0 z-20">
          <div>
            <h1 className="font-display text-xl lg:text-2xl font-bold text-[#18365A] tracking-tight">
              KinGuard Protection Overview
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Unknown calls are screened quietly so Mom isn't disturbed by scam callers
            </p>
          </div>

          {/* Demo Simulator Controls (Connected to Android Emulator) */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-xs text-slate-500 font-bold mr-1">
              Emulator Demo:
            </span>

            <button
              type="button"
              onClick={triggerScamSim}
              className="text-xs px-3 py-2 rounded-lg bg-[#FFF3EB] hover:bg-[#FDE6D6] text-[#C24E0A] border border-[#F9C8A7] transition flex items-center gap-1.5 font-bold"
              title="Dial +1 (800) 582-8888 on Android Emulator (Silenced unless whitelisted)"
            >
              <PhoneOff className="w-3.5 h-3.5 text-[#FD7A2C]" aria-hidden="true" />
              <span>Simulate Suspicious Call (88%)</span>
            </button>

            <button
              type="button"
              onClick={triggerHighRiskDrop}
              className="text-xs px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 transition flex items-center gap-1.5 font-bold"
              title="Dial +1 (888) 555-9999 on Android Emulator (Auto-rejected >90%)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />
              <span>Simulate Auto-Block (&gt;90%)</span>
            </button>

            <button
              type="button"
              onClick={triggerLiveAnswerDrop}
              className="text-xs px-3 py-2 rounded-lg bg-[#EDF2F8] hover:bg-[#DCE7F3] text-[#18365A] border border-[#C4D3E3] transition flex items-center gap-1.5 font-bold"
              title="Dial +1 (800) 555-7777 on Android Emulator (Hangs up 5s after answering)"
            >
              <PhoneIncoming className="w-3.5 h-3.5 text-[#18365A]" aria-hidden="true" />
              <span>Simulate 5s Answer Drop</span>
            </button>

            <button
              type="button"
              onClick={resetQueue}
              className="text-xs px-3 py-2 rounded-lg bg-[#FBF9ED] hover:bg-[#EFF5EC] text-[#18365A] border border-[#E5E0C8] transition flex items-center gap-1.5 font-semibold"
              title="Reset sample data &amp; hang up active emulator calls"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-600" aria-hidden="true" />
              <span>Reset</span>
            </button>

            <a
              href="http://localhost:5001"
              target="_blank"
              rel="noreferrer"
              className="text-xs px-3.5 py-2 rounded-lg bg-[#18365A] hover:bg-[#102540] text-[#FBF9ED] transition flex items-center gap-1.5 font-bold shadow-sm"
              title="Open the Python AI Voice &amp; Server Demo Console on port 5001"
            >
              <span>AI Voice Lab (:5001)</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#FD7A2C]" aria-hidden="true" />
            </a>
          </div>
        </header>

        {/* 2-PANEL WORKSPACE */}
        <main className="w-full flex-1 px-6 lg:px-8 py-6 bg-white">
          <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* ========================================================= */}
            {/* PANEL 1: PROTECTED PHONE SUMMARY                          */}
            {/* ========================================================= */}
            <section
              aria-labelledby="device-summary-heading"
              className="xl:col-span-5 bg-white border border-[#E5E0C8] rounded-2xl p-6 shadow-sm isolated-panel space-y-6"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#E5E0C8]">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-[#EFF5EC] border border-[#C3D7BC] flex items-center justify-center shrink-0">
                    <Smartphone className="w-6 h-6 text-[#4F6B45]" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 id="device-summary-heading" className="font-display text-lg font-bold text-[#18365A] flex items-center gap-2">
                      Mom's Galaxy S24
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Zero-UI Mode • No scam alerts shown on Mom's screen
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#EFF5EC] text-[#4F6B45] border border-[#C3D7BC] flex items-center gap-1.5 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" />
                  <span>Protected</span>
                </span>
              </div>

              {/* 3 Summary Metrics (Secondary Area Fill: Warm Cream & Sage Tint) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-[#EFF5EC]/70 p-4 rounded-xl border border-[#C3D7BC]">
                  <span className="text-xs text-[#4F6B45] font-bold block">
                    Interruptions Saved
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.wakesPrevented} colorClass="text-[#18365A]" />
                  </div>
                  <span className="text-xs text-[#4F6B45] font-semibold block mt-1">
                    Ringer kept quiet
                  </span>
                </div>

                <div className="bg-[#FFF3EB]/80 p-4 rounded-xl border border-[#F9C8A7]">
                  <span className="text-xs text-[#C24E0A] font-bold block">
                    Scams Blocked
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.threatsScrubbed} colorClass="text-[#18365A]" />
                  </div>
                  <span className="text-xs text-[#C24E0A] font-semibold block mt-1">
                    Hidden from call log
                  </span>
                </div>

                <div className="bg-[#FBF9ED] p-4 rounded-xl border border-[#E5E0C8]">
                  <span className="text-xs text-slate-600 font-bold block">
                    Screening Speed
                  </span>
                  <div className="mt-1">
                    <SpringCounter value={metrics.latencyMs} suffix="ms" colorClass="text-[#18365A]" />
                  </div>
                  <span className="text-xs text-slate-600 font-semibold block mt-1">
                    Instant check
                  </span>
                </div>
              </div>

              {/* Active Protection Rules Summary (Warm Cream Secondary Fill) */}
              <div className="bg-[#FBF9ED] rounded-xl p-4 border border-[#E5E0C8] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#18365A] uppercase tracking-wider">
                    How Calls Are Handled
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowRulesDrawer(true)}
                    className="text-xs text-[#4F6B45] hover:text-[#18365A] font-bold"
                  >
                    Edit rules
                  </button>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E5E0C8] text-sm">
                  <span className="text-[#18365A] font-medium">Saved Contacts &amp; Allowed List</span>
                  <span className="text-[#4F6B45] text-xs font-bold px-2.5 py-1 rounded-md bg-[#EFF5EC] border border-[#C3D7BC]">
                    Always rings through
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E5E0C8] text-sm">
                  <span className="text-[#18365A] font-medium">High-Risk Scam (&gt;{settings.autoDropThreshold}% score)</span>
                  <span className="text-rose-800 text-xs font-bold px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200">
                    Blocked silently
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E5E0C8] text-sm">
                  <span className="text-[#18365A] font-medium">
                    Uncertain Caller ({settings.quarantineThreshold}%–{settings.autoDropThreshold}%)
                  </span>
                  <span className="text-[#C24E0A] text-xs font-bold px-2.5 py-1 rounded-md bg-[#FFF3EB] border border-[#F9C8A7]">
                    Sent to caregiver review
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 text-sm">
                  <span className="text-[#18365A] font-medium">Repeat Caller Within 5 Minutes</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                      settings.emergencyRepeatBypass
                        ? 'text-[#18365A] bg-[#EDF2F8] border-[#C4D3E3]'
                        : 'text-slate-600 bg-slate-100 border-slate-300'
                    }`}
                  >
                    {settings.emergencyRepeatBypass ? 'Allowed (Emergency safety)' : 'Screened normally'}
                  </span>
                </div>
              </div>

              {/* Reassuring Footer */}
              <div className="pt-3 border-t border-[#E5E0C8] flex items-center justify-between text-xs text-slate-600">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" />
                  Synced with Android Emulator &amp; Python Backend
                </span>
                <button
                  type="button"
                  onClick={() => setShowWhitelistDrawer(true)}
                  className="text-[#4F6B45] hover:text-[#18365A] font-bold"
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
              className="xl:col-span-7 bg-white border border-[#E5E0C8] rounded-2xl p-6 shadow-sm isolated-panel flex flex-col justify-between space-y-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-4 border-b border-[#E5E0C8]">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-[#FFF3EB] border border-[#F9C8A7] flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6 text-[#FD7A2C]" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 id="review-queue-heading" className="font-display text-lg font-bold text-[#18365A]">
                        Calls Waiting for Your Review
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        These unknown callers were silenced so Mom wasn't bothered. Choose whether to allow or block them.
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#FFF3EB] text-[#C24E0A] border border-[#F9C8A7] shrink-0">
                    {quarantineQueue.length} Waiting
                  </span>
                </div>

                {/* Review Cards */}
                <div className="space-y-4">
                  {quarantineQueue.length === 0 ? (
                    <div className="text-center py-12 bg-[#FBF9ED] rounded-xl border border-[#E5E0C8] p-6">
                      <CheckCircle2 className="w-10 h-10 text-[#6A8B5E] mx-auto mb-2" aria-hidden="true" />
                      <div className="font-display text-base font-bold text-[#18365A]">You're all caught up</div>
                      <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                        No suspicious calls are waiting for review right now.
                      </p>
                    </div>
                  ) : (
                    quarantineQueue.map((call) => (
                      <div
                        key={call.id}
                        className="p-5 rounded-xl border border-[#E5E0C8] bg-[#FBF9ED] hover:border-[#C3D7BC] transition space-y-4"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-4">
                          <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="font-display text-lg font-bold text-[#18365A]">
                                {call.callerId}
                              </span>
                              <span className="text-xs px-2.5 py-0.5 rounded-md font-bold bg-[#FFF3EB] text-[#C24E0A] border border-[#F9C8A7]">
                                {call.stirShaken}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 font-medium mt-1">
                              {call.origin} • {call.timestamp}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-wrap">
                            <RadialRiskRing score={call.riskScore} size={52} />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAction(call.id, 'whitelist')}
                                className="px-3.5 py-2 bg-[#6A8B5E] hover:bg-[#4F6B45] text-white rounded-lg transition flex items-center gap-1.5 font-bold text-xs shadow-sm"
                                title="Allow this number to ring Mom's phone in the future"
                              >
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                <span>Allow Caller</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAction(call.id, 'block')}
                                className="px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 rounded-lg border border-rose-300 transition flex items-center gap-1.5 font-bold text-xs"
                                title="Block this number permanently"
                              >
                                <XCircle className="w-4 h-4 text-rose-600" aria-hidden="true" />
                                <span>Block Number</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Reason & Voicemail Transcript */}
                        <div className="bg-white p-4 rounded-xl border border-[#E5E0C8] space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-xs font-bold text-[#18365A]">
                              Why this call was held: <span className="font-medium text-slate-700">{call.reason}</span>
                            </span>
                          </div>
                          <p className="text-sm text-[#18365A] italic border-t border-[#FBF9ED] pt-2 leading-relaxed">
                            "{call.transcript}"
                          </p>
                        </div>

                        {/* Simple Readable Tags */}
                        <div className="flex flex-wrap gap-1.5">
                          {call.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-0.5 text-xs rounded-md bg-white text-[#18365A] border border-[#E5E0C8] font-semibold"
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
              <div className="text-xs text-slate-600 pt-4 border-t border-[#E5E0C8] flex items-center justify-between">
                <span>Approving a number syncs to Python &amp; the Android Emulator so future calls ring right through.</span>
                <span className="font-bold text-[#4F6B45]">
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
