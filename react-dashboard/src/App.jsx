import React, { useState, useRef } from 'react';
import {
  ShieldCheck, ShieldAlert, PhoneOff, Radio, AlertTriangle,
  CheckCircle2, XCircle, Activity, RefreshCw, Smartphone, Building2,
  UserCheck, Trash2, Sparkles, CreditCard, Settings, Bell,
  History, Sliders, ChevronRight, Plus, ExternalLink, Zap, Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Specialized Motion & Cybersecurity Components
import CyberBackground3D from './components/CyberBackground3D';
import OrbitalShieldVisualizer from './components/OrbitalShieldVisualizer';
import SpringCounter from './components/SpringCounter';
import RadialRiskRing from './components/RadialRiskRing';

// Interactive Drawers & Modals
import DeviceSwitcherModal from './components/DeviceSwitcherModal';
import WhitelistDrawer from './components/WhitelistDrawer';
import HistoryDrawer from './components/HistoryDrawer';
import ProtectionRulesDrawer from './components/ProtectionRulesDrawer';
import SubscriptionModal from './components/SubscriptionModal';

const INITIAL_METRICS = {
  wakesPrevented: 18,
  latencyMs: 412,
  threatsScrubbed: 14,
  whitelistedTotal: 4
};

const INITIAL_QUEUE = [
  {
    id: 'call-1',
    callerId: '+1 (555) 019-8372',
    origin: 'VoIP (Unverified Bandwidth.com)',
    riskScore: 78,
    stirShaken: 'FAILED',
    timestamp: '2m ago',
    reason: 'Unverified VoIP origin matching known Social Security scam pattern',
    transcript: 'Hello, this is officer James from the Social Security Administration. Your SSN has been suspended due to criminal activity in Texas. You must purchase Target gift cards immediately to settle the bond...',
    tags: ['URGENCY_INDUCEMENT', 'AUTHORITY_IMPERSONATION', 'GIFT_CARD_DEMAND']
  },
  {
    id: 'call-2',
    callerId: '+1 (555) 438-9921',
    origin: 'Private Cellular',
    riskScore: 62,
    stirShaken: 'UNVERIFIED',
    timestamp: '6m ago',
    reason: 'Unlisted number redial pattern; flagged for caregiver review',
    transcript: 'Hi Mrs. Davis, I am calling from St. Jude Medical Outpatient Clinic regarding your prescription renewal. Please give our nursing desk a callback...',
    tags: ['HEALTHCARE_CONTEXT', 'POTENTIAL_SAFE']
  }
];

const INITIAL_WHITELIST = [
  { name: 'Dr. Sarah Henderson (Cardiologist)', number: '+1 (555) 902-1144', category: 'Medical', date: 'Added Oct 2026' },
  { name: 'Walgreens Pharmacy #4102', number: '+1 (555) 321-9988', category: 'Pharmacy', date: 'Added Sep 2026' },
  { name: 'Chase Bank Fraud & 2FA Alert', number: '+1 (800) 935-9935', category: 'Financial', date: 'Institutional' },
  { name: 'Michael Davis (Son)', number: '+1 (555) 672-4411', category: 'Family', date: 'Native Sync' }
];

const INITIAL_HISTORY = [
  { number: '+1 (800) 275-2273', reason: 'IRS Impersonation / Arrest Threat', action: 'Auto-Scrubbed (>90%)', time: '18m ago', score: 94 },
  { number: '+1 (888) 492-0199', reason: 'Chinese Consulate Robocall', action: 'Auto-Scrubbed (>90%)', time: '1h ago', score: 91 },
  { number: '+1 (555) 881-2309', reason: 'Amazon Gift Card Fraud Ring', action: 'Blocked by Caregiver', time: '3h ago', score: 86 }
];

export default function App() {
  // --- SYSTEM & ANIMATION STATE ---
  const [systemState, setSystemState] = useState('normal'); // 'normal' | 'ambiguous' | 'scrubbed'
  const [visualizerTrigger, setVisualizerTrigger] = useState({ type: 'normal', timestamp: Date.now() });
  const resetTimerRef = useRef(null);

  const [activeDeviceId, setActiveDeviceId] = useState('mom-s24');

  // --- DRAWERS & MODALS STATE ---
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showWhitelistDrawer, setShowWhitelistDrawer] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Toast Notification state: { message: string, type: 'indigo' | 'amber' | 'crimson' }
  const [toast, setToast] = useState(null);

  // Sentinel Metrics (Node 1 Telemetry)
  const [metrics, setMetrics] = useState({ ...INITIAL_METRICS });

  // Ambiguous Triage Queue (50% - 90% Scam Confidence per PRD 3.1)
  const [quarantineQueue, setQuarantineQueue] = useState([ ...INITIAL_QUEUE ]);

  // Whitelisted contacts list
  const [whitelist, setWhitelist] = useState([ ...INITIAL_WHITELIST ]);

  // Call history
  const [history, setHistory] = useState([ ...INITIAL_HISTORY ]);

  // Protection Rules / Settings State
  const [settings, setSettings] = useState({
    smsAlerts: true,
    pushAlerts: true,
    autoDropThreshold: 90,
    quarantineThreshold: 50,
    emergencyRepeatBypass: true,
    caregiverPhone: '+1 (555) 019-CARE'
  });

  // Helper for notification toast
  const showToast = (message, type = 'indigo') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Queue resolution handlers (PRD Section 3.1 & 3.2)
  const handleAction = (callId, action) => {
    const target = quarantineQueue.find((c) => c.id === callId);
    setQuarantineQueue((prev) => prev.filter((c) => c.id !== callId));

    if (action === 'whitelist') {
      setMetrics((m) => ({ ...m, whitelistedTotal: m.whitelistedTotal + 1 }));
      setWhitelist((prev) => [
        {
          name: target ? `Approved (${target.callerId})` : 'New Contact',
          number: target?.callerId || '+1 (555) 000-0000',
          category: 'Caregiver Approved',
          date: 'Just now'
        },
        ...prev
      ]);
      showToast(
        `Whitelisted ${target?.callerId}. Pushed to Mom's phone address book; future calls will ring with zero latency.`,
        'indigo'
      );
    } else {
      setMetrics((m) => ({ ...m, threatsScrubbed: m.threatsScrubbed + 1 }));
      setHistory((prev) => [
        {
          number: target?.callerId || 'Blocked',
          reason: target?.reason || 'Scam Threat',
          action: 'Blocked by Caregiver',
          time: 'Just now',
          score: target?.riskScore || 80
        },
        ...prev
      ]);
      setSystemState('scrubbed');
      setVisualizerTrigger({ type: 'scrubbed', timestamp: Date.now() });

      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => {
        setSystemState('normal');
        setVisualizerTrigger({ type: 'normal', timestamp: Date.now() });
      }, 4000);

      showToast(
        `Blocked & permanently scrubbed ${target?.callerId} from Mom's device call log.`,
        'crimson'
      );
    }
  };

  // DEMO SIMULATOR TRIGGERS
  const triggerScamSim = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setSystemState('ambiguous');
    setVisualizerTrigger({ type: 'ambiguous', timestamp: Date.now() });

    const newCall = {
      id: `call-${Date.now()}`,
      callerId: '+1 (800) 582-9142',
      origin: 'Incoming Unknown VoIP',
      riskScore: 88,
      stirShaken: 'FAILED',
      timestamp: 'Just now',
      reason: 'Aggressive IRS tax fraud pattern & fake badge number',
      transcript:
        'This is the Internal Revenue Service criminal division. Local county deputies are currently dispatched to your address for immediate arrest unless payment is processed today.',
      tags: ['IMMEDIATE_ARREST', 'IRS_IMPERSONATION', 'EXTORTION']
    };

    setQuarantineQueue((prev) => [newCall, ...prev]);
    // Simulate Ambiguous: Wakes Prevented ticks up (18 -> 19) per specification
    setMetrics((m) => ({ ...m, wakesPrevented: m.wakesPrevented + 1 }));

    showToast(
      'Inbound Ambiguous Call (88% threat) intercepted: Phone silenced, ringer suppressed, escalated to Caregiver queue.',
      'amber'
    );

    resetTimerRef.current = setTimeout(() => {
      setSystemState('normal');
      setVisualizerTrigger({ type: 'normal', timestamp: Date.now() });
    }, 4500);
  };

  const triggerHighRiskDrop = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    setSystemState('scrubbed');
    setVisualizerTrigger({ type: 'scrubbed', timestamp: Date.now() });

    // Simulate Auto-Scrub: Threats Scrubbed ticks up (14 -> 15) and Scam Call History increments (3 -> 4) per specification
    setMetrics((m) => ({
      ...m,
      threatsScrubbed: m.threatsScrubbed + 1
    }));

    setHistory((prev) => [
      {
        number: '+1 (888) 555-0199',
        reason: 'Automated Tech Support Pop-up Scam',
        action: 'Auto-Scrubbed (>90%)',
        time: 'Just now',
        score: 97
      },
      ...prev
    ]);

    showToast(
      "Auto-Scrubbed >90% Scam Call • Mom's S24 Screen Remained Off",
      'crimson'
    );

    resetTimerRef.current = setTimeout(() => {
      setSystemState('normal');
      setVisualizerTrigger({ type: 'normal', timestamp: Date.now() });
    }, 4500);
  };

  const resetQueue = () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setQuarantineQueue([ ...INITIAL_QUEUE ]);
    setMetrics({ ...INITIAL_METRICS });
    setHistory([ ...INITIAL_HISTORY ]);
    setWhitelist([ ...INITIAL_WHITELIST ]);
    setSystemState('normal');
    setVisualizerTrigger({ type: 'normal', timestamp: Date.now() });
    showToast('Reset sample triage queue and sentinel metrics to initial state.', 'indigo');
  };

  return (
    <div className="min-h-screen bg-[#03050c] text-slate-100 flex flex-col md:flex-row font-sans selection:bg-indigo-500/30 relative overflow-hidden">
      
      {/* 3D MOTIONSITES.AI LIVE INTERACTIVE WALLPAPER */}
      <CyberBackground3D systemState={systemState} />

      {/* DYNAMIC HIGH-CONTRAST TOAST NOTIFICATION POPUP */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed top-5 left-1/2 -translate-x-1/2 z-50 px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3.5 backdrop-blur-2xl text-sm font-semibold max-w-2xl text-center border ${
              toast.type === 'crimson'
                ? 'bg-rose-950/90 border-rose-500/70 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.35)]'
                : toast.type === 'amber'
                ? 'bg-amber-950/90 border-amber-500/70 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.35)]'
                : 'bg-slate-900/90 border-indigo-500/60 text-indigo-100 shadow-[0_0_30px_rgba(99,102,241,0.3)]'
            }`}
          >
            {toast.type === 'crimson' ? (
              <Zap className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
            ) : toast.type === 'amber' ? (
              <PhoneOff className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
            ) : (
              <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 animate-spin" />
            )}
            <span className="leading-snug">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* LEFT SIDEBAR: SILENTSHIELD PRO & INTERACTIVE NAVIGATION   */}
      {/* ========================================================= */}
      <aside className="w-full md:w-80 bg-slate-950/80 border-r border-white/10 flex flex-col justify-between shrink-0 p-5 md:min-h-screen backdrop-blur-2xl z-20">
        
        <div>
          {/* Logo & Branding */}
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-800/80">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-lg tracking-tight">SilentShield</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  PRO
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Caregiver Protection Network</p>
            </div>
          </div>

          {/* Interactive Ward Device Selector Card */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Protected Ward Device:
              </span>
              <button
                onClick={() => setShowDeviceModal(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono font-semibold"
              >
                Switch
              </button>
            </div>

            <div
              onClick={() => setShowDeviceModal(true)}
              className="bg-slate-900/80 hover:bg-slate-900 border border-slate-700/80 hover:border-indigo-500/60 rounded-2xl p-3.5 flex items-center justify-between shadow-lg cursor-pointer transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-indigo-400 border border-slate-700 group-hover:border-indigo-500/50 transition">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    Mom's Galaxy S24
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
                  </div>
                  <div className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-spin" /> Silent Interceptor Active
                  </div>
                </div>
              </div>
              <div className="text-slate-400 group-hover:text-white transition p-1">
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Interactive Left Navigation Links */}
          <nav className="space-y-1.5 mb-6">
            {/* Live Triage & HUD */}
            <button
              onClick={() => {
                setShowWhitelistDrawer(false);
                setShowHistoryDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-semibold text-sm transition ${
                !showWhitelistDrawer && !showHistoryDrawer && !showRulesDrawer
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4" />
                <span>Live Triage &amp; HUD</span>
              </div>
              {quarantineQueue.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-indigo-950 text-indigo-300 border border-indigo-400/30 shadow-sm font-mono">
                  {quarantineQueue.length}
                </span>
              )}
            </button>

            {/* Whitelisted Contacts Slide-over */}
            <button
              onClick={() => {
                setShowWhitelistDrawer(true);
                setShowHistoryDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition group ${
                showWhitelistDrawer
                  ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40 shadow-lg shadow-emerald-600/10'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
                <span>Whitelisted Contacts</span>
              </div>
              <span className="text-xs text-slate-300 font-mono font-bold bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700">
                {whitelist.length}
              </span>
            </button>

            {/* Scam Call History Slide-over */}
            <button
              onClick={() => {
                setShowHistoryDrawer(true);
                setShowWhitelistDrawer(false);
                setShowRulesDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition group ${
                showHistoryDrawer
                  ? 'bg-rose-600/30 text-rose-200 border border-rose-500/40 shadow-lg shadow-rose-600/10'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-rose-400 group-hover:scale-110 transition" />
                <span>Scam Call History</span>
              </div>
              <span className="text-xs text-rose-300 font-mono font-bold bg-rose-500/15 px-2 py-0.5 rounded-lg border border-rose-500/30">
                {history.length}
              </span>
            </button>

            {/* Protection Rules Slide-over */}
            <button
              onClick={() => {
                setShowRulesDrawer(true);
                setShowWhitelistDrawer(false);
                setShowHistoryDrawer(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition group ${
                showRulesDrawer
                  ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 shadow-lg shadow-indigo-600/10'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Sliders className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition" />
                <span>Protection Rules</span>
              </div>
              <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-lg border border-indigo-500/25 font-mono font-bold">
                &gt;{settings.autoDropThreshold}% Auto
              </span>
            </button>
          </nav>
        </div>

        {/* Bottom Subscription & Billing Card */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          
          {/* Subscription Tier Box */}
          <div className="bg-gradient-to-b from-[#141a2e] to-[#0f1322] border border-indigo-500/30 rounded-2xl p-4 shadow-xl relative overflow-hidden backdrop-blur-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-400" /> Subscription Plan
              </span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            <div className="mb-2">
              <div className="text-base font-extrabold text-white">Family Guardian Plan</div>
              <div className="text-xs text-slate-400 mt-0.5">$14.99 / month • Renews Nov 30</div>
            </div>

            <div className="text-xs text-slate-300 space-y-1 mb-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Protected Slots:</span>
                <span className="font-bold text-white">1 of 3 Used</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Instant SMS Webhook:</span>
                <span className="font-bold text-emerald-400">Enabled</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">AI Edge Screening:</span>
                <span className="font-bold text-indigo-400">Unlimited</span>
              </div>
            </div>

            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5"
            >
              <span>Manage Subscription &amp; Billing</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Caregiver Profile Footer */}
          <div className="flex items-center justify-between px-2 pt-2 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-xs shadow-inner">
                SD
              </div>
              <div>
                <div className="text-white font-semibold text-xs">Sarah Davis</div>
                <div className="text-[10px] text-slate-400">Primary Caregiver</div>
              </div>
            </div>
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="p-2 hover:text-white rounded-xl hover:bg-slate-800/80 transition"
              title="Settings &amp; Backend Node"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA: EXPANDED 2-PANEL WORKSPACE             */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        
        {/* Top Header with Simulator Controls */}
        <header className="border-b border-white/10 px-8 py-4 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70 backdrop-blur-2xl sticky top-0 z-30">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Caregiver Mission Control</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono font-semibold">
                Live Interception
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Protecting Mom's Galaxy S24 from phone fraud with Zero-UI on-device screening
            </p>
          </div>

          {/* Demo Simulator Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-extrabold mr-1">
              DEMO TRIGGERS:
            </span>
            
            {/* Simulate Ambiguous (88%) Button */}
            <button
              onClick={triggerScamSim}
              className="text-xs px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition flex items-center gap-2 font-bold shadow-lg shadow-amber-500/10 active:scale-95"
              title="Simulate Ambiguous Scam (50-90%)"
            >
              <PhoneOff className="w-4 h-4 text-amber-400" />
              <span>Simulate Ambiguous (88%)</span>
            </button>

            {/* Simulate Auto-Scrub (>90%) Button */}
            <button
              onClick={triggerHighRiskDrop}
              className="text-xs px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 transition flex items-center gap-2 font-bold shadow-lg shadow-rose-500/10 active:scale-95"
              title="Simulate >90% Auto Drop &amp; Scrub"
            >
              <Trash2 className="w-4 h-4 text-rose-400" />
              <span>Simulate Auto-Scrub (&gt;90%)</span>
            </button>

            {/* Reset Button */}
            <button
              onClick={resetQueue}
              className="text-xs px-3.5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 font-medium shadow-sm active:scale-95"
              title="Reset Demo Triage Queue"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset</span>
            </button>
          </div>
        </header>

        {/* FULL-VIEWPORT EXPANDED 2-PANEL GRID CONTAINER */}
        <main className="w-full flex-1 px-8 py-6 flex flex-col">
          <div className="w-full flex-1 grid grid-cols-1 xl:grid-cols-12 gap-8 items-stretch">
            
            {/* ========================================================= */}
            {/* PANEL 1 (xl:col-span-6): PROTECTED DEVICE SENTINEL HUD    */}
            {/* ========================================================= */}
            <div className="xl:col-span-6 bg-slate-950/65 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              
              <div className="space-y-6">
                {/* Panel Title & Status Badge */}
                <div className="flex items-center justify-between pb-5 border-b border-slate-800/80">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
                      <Smartphone className="w-7 h-7 text-indigo-300" />
                    </div>
                    <div>
                      {/* Scaled-up Panel Header */}
                      <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        Mom's Galaxy S24
                        <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_#10b981]" />
                      </h2>
                      {/* Scaled-up Subheader */}
                      <p className="text-base text-slate-300 leading-relaxed mt-0.5">
                        Silent Fallback Interceptor • Android Edge Service
                      </p>
                    </div>
                  </div>
                  
                  <span className="px-4 py-2 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-2 shadow-sm shrink-0">
                    <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
                    <span>Zero-UI Engaged</span>
                  </span>
                </div>

                {/* Scaled-up 3 KPI Numbers with Glowing Drop-Shadows */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* KPI 1: Wakes Prevented */}
                  <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800/80 shadow-md">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-extrabold block">
                      Wakes Prevented
                    </span>
                    <div className="mt-2">
                      <SpringCounter
                        value={metrics.wakesPrevented}
                        colorClass="text-emerald-400"
                        glowFilter="drop-shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                      />
                    </div>
                    <span className="text-xs text-emerald-400 font-semibold block mt-1.5">
                      0 Anxiety / Panic Events
                    </span>
                  </div>

                  {/* KPI 2: Edge Latency */}
                  <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800/80 shadow-md">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-extrabold block">
                      Edge Latency
                    </span>
                    <div className="mt-2">
                      <SpringCounter
                        value={metrics.latencyMs}
                        suffix="ms"
                        colorClass="text-white"
                        glowFilter="drop-shadow-[0_0_20px_rgba(99,102,241,0.25)]"
                      />
                    </div>
                    <span className="text-xs text-indigo-400 font-semibold block mt-1.5">
                      &lt;5s Android Intercept SLA
                    </span>
                  </div>

                  {/* KPI 3: Threats Scrubbed */}
                  <div className="bg-slate-900/70 p-5 rounded-2xl border border-slate-800/80 shadow-md">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-extrabold block">
                      Threats Scrubbed
                    </span>
                    <div className="mt-2">
                      <SpringCounter
                        value={metrics.threatsScrubbed}
                        colorClass="text-rose-400"
                        glowFilter="drop-shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                      />
                    </div>
                    <span className="text-xs text-rose-400 font-semibold block mt-1.5">
                      Deleted From Call Log
                    </span>
                  </div>
                </div>

                {/* Scaled-up Active On-Device Screening Policies (Dynamic Settings Binding) */}
                <div className="bg-slate-900/70 rounded-2xl p-5 border border-slate-800/80 space-y-4">
                  <div className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    ACTIVE ON-DEVICE SCREENING POLICIES:
                  </div>
                  
                  {/* Policy 1 */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
                    <span className="text-base font-medium text-slate-200">
                      Deterministic Address Book Passthrough:
                    </span>
                    <span className="font-mono text-emerald-400 text-sm font-semibold px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 shadow-sm">
                      Active (0ms Delay)
                    </span>
                  </div>

                  {/* Policy 2 */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
                    <span className="text-base font-medium text-slate-200">
                      Scam Confidence Auto-Action:
                    </span>
                    <span className="font-mono text-rose-400 text-sm font-semibold px-3.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 shadow-sm">
                      &gt;{settings.autoDropThreshold}% Instant Drop &amp; Scrub
                    </span>
                  </div>

                  {/* Policy 3 */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800/70">
                    <span className="text-base font-medium text-slate-200">
                      Ambiguous Threat Handling ({settings.quarantineThreshold}%–{settings.autoDropThreshold}%):
                    </span>
                    <span className="font-mono text-amber-300 text-sm font-semibold px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 shadow-sm">
                      Silent Voicemail &rarr; Caregiver Queue
                    </span>
                  </div>

                  {/* Policy 4: Escape Hatch Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-medium text-slate-200">
                      Emergency Repeat Escape Hatch:
                    </span>
                    <span className={`font-mono text-sm font-semibold px-3.5 py-1.5 rounded-xl shadow-sm ${
                      settings.emergencyRepeatBypass
                        ? 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/25'
                        : 'text-slate-400 bg-slate-800/60 border border-slate-700'
                    }`}>
                      {settings.emergencyRepeatBypass ? 'Active (5-Min Window)' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {/* MOTIONSITES.AI LIVE ORBITAL SHIELD VISUALIZER (Zero-UI Telemetry Wave Bar) */}
                <OrbitalShieldVisualizer triggerEvent={visualizerTrigger} />
              </div>

              {/* Device Telemetry Footer */}
              <div className="pt-5 mt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400 font-mono">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>Tailscale Mesh:</span>
                  <span className="text-emerald-400 font-bold">100.84.12.5 (Online)</span>
                </div>
                <div>
                  System Role: <span className="text-indigo-300 font-bold">ROLE_CALL_SCREENING</span>
                </div>
              </div>
            </div>

            {/* ========================================================= */}
            {/* PANEL 2 (xl:col-span-6): QUARANTINE TRIAGE QUEUE          */}
            {/* ========================================================= */}
            <div className="xl:col-span-6 bg-slate-950/65 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="space-y-5 flex-1 flex flex-col">
                {/* Panel Title & Status Badge */}
                <div className="flex items-center justify-between pb-5 border-b border-slate-800/80">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                      <AlertTriangle className="w-7 h-7 text-amber-400" />
                    </div>
                    <div>
                      {/* Scaled-up Panel Header */}
                      <h2 className="text-2xl xl:text-3xl font-extrabold tracking-tight text-white">
                        Quarantine Triage Queue
                      </h2>
                      <p className="text-base text-slate-300 leading-relaxed mt-0.5">
                        Silenced ambiguous calls awaiting caregiver verification
                      </p>
                    </div>
                  </div>

                  <span className="text-sm font-mono font-bold px-3.5 py-1.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                    {quarantineQueue.length} Pending Decision
                  </span>
                </div>

                {/* Subheader description */}
                <p className="text-base text-slate-300 leading-relaxed">
                  Calls scored between 50%–90% threat risk did not ring Mom's phone. As caregiver proxy, you can one-click whitelist legitimate callers or permanently block scammers:
                </p>

                {/* Triage Call Items Container with Zero White Scrollbars and Expanded View */}
                <div className="space-y-4 overflow-y-auto pr-2 flex-1 scrollbar-thin">
                  <AnimatePresence>
                    {quarantineQueue.length === 0 ? (
                      <div className="text-center py-16 bg-slate-900/60 rounded-3xl border border-slate-800/80 p-8">
                        <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-3 opacity-90 shadow-sm" />
                        <div className="text-lg font-bold text-white">All Ambiguous Calls Resolved</div>
                        <p className="text-base text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                          Mom's ringer was protected with zero panic events. Any newly flagged calls will appear here in real time.
                        </p>
                      </div>
                    ) : (
                      quarantineQueue.map((call) => (
                        <motion.div
                          key={call.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ type: 'spring', damping: 24, stiffness: 260 }}
                          className="p-5 rounded-2xl border bg-slate-900/80 border-slate-700/80 hover:border-slate-600 transition shadow-xl space-y-4"
                        >
                          {/* Card Top: Scaled Phone Number, STIR/SHAKEN, Radial Score & Big Action Buttons */}
                          <div className="flex items-center justify-between flex-wrap gap-4">
                            <div>
                              <div className="flex items-center gap-3">
                                {/* Scaled-up Phone Number */}
                                <span className="text-xl xl:text-2xl font-bold font-mono tracking-tight text-white">
                                  {call.callerId}
                                </span>
                                <span
                                  className={`text-[11px] px-2.5 py-0.5 rounded-lg font-mono font-bold uppercase ${
                                    call.stirShaken === 'FAILED'
                                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {call.stirShaken}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-1 font-mono">
                                {call.origin} • {call.timestamp}
                              </div>
                            </div>

                            {/* Radial Progress Ring & Large Action Buttons */}
                            <div className="flex items-center gap-4">
                              <RadialRiskRing score={call.riskScore} size={62} />

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleAction(call.id, 'whitelist')}
                                  className="px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-xl border border-emerald-500/40 transition active:scale-95 flex items-center gap-2 font-bold text-sm shadow-md shadow-emerald-500/10"
                                  title="Whitelist & Push to Mom's Phone"
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  <span>Whitelist</span>
                                </button>

                                <button
                                  onClick={() => handleAction(call.id, 'block')}
                                  className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl border border-rose-500/40 transition active:scale-95 flex items-center gap-2 font-bold text-sm shadow-md shadow-rose-500/10"
                                  title="Block & Scrub Permanently"
                                >
                                  <XCircle className="w-4 h-4 text-rose-400" />
                                  <span>Block</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Threat Tags */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {call.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 text-xs rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/25 font-mono font-bold"
                              >
                                [{tag}]
                              </span>
                            ))}
                          </div>

                          {/* Scaled-up Live Transcript / AI Threat Reasoning Preview */}
                          <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-2">
                            <span className="text-xs text-slate-400 uppercase tracking-wider font-extrabold block">
                              AI THREAT REASONING:
                            </span>
                            <p className="text-sm xl:text-base leading-relaxed text-slate-200">
                              {call.reason}
                            </p>
                            <p className="text-sm xl:text-base leading-relaxed text-slate-300 italic font-mono border-t border-slate-800/80 pt-2">
                              "{call.transcript}"
                            </p>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Panel 2 Footer */}
              <div className="text-sm text-slate-400 pt-5 mt-4 border-t border-slate-800/80 flex items-center justify-between">
                <span>Caregiver approvals instantly push to Mom's phone address book.</span>
                <span className="font-mono text-indigo-400 font-bold">
                  {metrics.whitelistedTotal} Whitelisted Total
                </span>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ========================================================= */}
      {/* INTERACTIVE SLIDE-OVER DRAWERS & POPUP MODALS             */}
      {/* ========================================================= */}

      {/* 1. Device Switcher & QR Code Pairing Modal */}
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

      {/* 2. Whitelisted Contacts Slide-over Drawer */}
      <WhitelistDrawer
        isOpen={showWhitelistDrawer}
        onClose={() => setShowWhitelistDrawer(false)}
        whitelist={whitelist}
        onAddContact={(contact) => {
          setWhitelist((prev) => [contact, ...prev]);
          setMetrics((m) => ({ ...m, whitelistedTotal: m.whitelistedTotal + 1 }));
        }}
        onRemoveContact={(number) => {
          setWhitelist((prev) => prev.filter((c) => c.number !== number));
          setMetrics((m) => ({ ...m, whitelistedTotal: Math.max(0, m.whitelistedTotal - 1) }));
        }}
        onShowToast={showToast}
      />

      {/* 3. Scam Call History Slide-over Drawer */}
      <HistoryDrawer
        isOpen={showHistoryDrawer}
        onClose={() => setShowHistoryDrawer(false)}
        history={history}
        onClearHistory={() => setHistory([])}
        onShowToast={showToast}
      />

      {/* 4. AI Protection Rules & Escape Hatch Settings Drawer */}
      <ProtectionRulesDrawer
        isOpen={showRulesDrawer}
        onClose={() => setShowRulesDrawer(false)}
        settings={settings}
        onSaveSettings={(newSettings) => setSettings(newSettings)}
        onShowToast={showToast}
      />

      {/* 5. Subscription & Live Backend Node Modal */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onShowToast={showToast}
      />

    </div>
  );
}
