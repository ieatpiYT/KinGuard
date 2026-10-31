import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sliders, X, ShieldAlert, Bell, MessageSquare, PhoneCall, Radio, Check, Lock } from 'lucide-react';

export default function ProtectionRulesDrawer({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onShowToast
}) {
  const [autoDrop, setAutoDrop] = useState(settings?.autoDropThreshold ?? 90);
  const [quarantineFloor, setQuarantineFloor] = useState(settings?.quarantineThreshold ?? 50);
  const [repeatBypass, setRepeatBypass] = useState(settings?.emergencyRepeatBypass ?? true);
  const [pushAlerts, setPushAlerts] = useState(settings?.pushAlerts ?? true);
  const [smsAlerts, setSmsAlerts] = useState(settings?.smsAlerts ?? true);
  const [liveTranscript, setLiveTranscript] = useState(true);
  const [caregiverPhone, setCaregiverPhone] = useState(settings?.caregiverPhone ?? '+1 (555) 019-CARE');

  const handleSave = () => {
    onSaveSettings({
      autoDropThreshold: autoDrop,
      quarantineThreshold: quarantineFloor,
      emergencyRepeatBypass: repeatBypass,
      pushAlerts,
      smsAlerts,
      caregiverPhone
    });
    onShowToast(`Protection Rules saved: Auto-drop at >${autoDrop}%, Quarantine between ${quarantineFloor}%–${autoDrop}%.`);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          {/* Slide-over panel */}
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-screen max-w-xl bg-slate-950/95 border-l border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col justify-between"
            >
          {/* Header */}
          <div className="p-6 border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Sliders className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight">
                    AI Screening &amp; Escape Hatch Rules
                  </h3>
                  <p className="text-xs text-slate-400">Configure on-device edge interception thresholds for Mom's Galaxy S24</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            
            {/* Rule 1: Auto-Scrub Threshold Slider */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    Auto-Scrub Threshold
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Silently Drop &amp; Delete
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Calls at or above this score are instantly terminated and wiped from Mom's phone log.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-rose-400">&gt;{autoDrop}%</span>
                  <span className="text-[10px] text-slate-400 block uppercase font-mono">Confidence</span>
                </div>
              </div>

              <input
                type="range"
                min="75"
                max="99"
                value={autoDrop}
                onChange={(e) => setAutoDrop(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>75% (Aggressive)</span>
                <span className="text-rose-400 font-bold">Default: 90%</span>
                <span>99% (Strict)</span>
              </div>
            </div>

            {/* Rule 2: Quarantine Triage Window Slider */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    Quarantine Triage Window
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Silence Ringer &rarr; Caregiver Queue
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Ambiguous calls routed to your Caregiver Queue without waking Mom's phone.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black font-mono text-amber-400">{quarantineFloor}% – {autoDrop}%</span>
                  <span className="text-[10px] text-slate-400 block uppercase font-mono">Range</span>
                </div>
              </div>

              <input
                type="range"
                min="30"
                max="70"
                value={quarantineFloor}
                onChange={(e) => setQuarantineFloor(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>30% Floor</span>
                <span className="text-amber-400 font-bold">Standard 50%</span>
                <span>70% Floor</span>
              </div>
            </div>

            {/* Rule 3: Emergency Repeat-Caller Escape Hatch */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    Emergency Repeat-Caller Escape Hatch
                    <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Life-Safety Bypass
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    5-Minute Sliding Window: if an unknown number calls a 2nd time within 5 minutes, allow ringer through in case of true family or hospital emergency.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setRepeatBypass(!repeatBypass)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    repeatBypass ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      repeatBypass ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 p-2 rounded-xl border border-emerald-500/20">
                Status: {repeatBypass ? 'ENABLED (Safe: Emergency Hospital & Doctor callbacks will not be blocked)' : 'DISABLED (Strict: All repeat callers screened)'}
              </div>
            </div>

            {/* Rule 4: Caregiver Alert Channels */}
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-400" />
                Caregiver Alert Channels
              </div>

              {/* Push Webhook */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Push Webhook Notification</div>
                  <div className="text-[11px] text-slate-400">Instant notification to Caregiver mobile app</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPushAlerts(!pushAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    pushAlerts ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      pushAlerts ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Instant SMS Alert */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Instant SMS Alert</div>
                  <div className="text-[11px] text-slate-400">Sends text with 1-click whitelist link to:</div>
                  <input
                    type="text"
                    value={caregiverPhone}
                    onChange={(e) => setCaregiverPhone(e.target.value)}
                    className="mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-indigo-300 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSmsAlerts(!smsAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    smsAlerts ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      smsAlerts ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Live Audio Transcript Preview */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Live Audio Transcript Preview</div>
                  <div className="text-[11px] text-slate-400">Display streaming Whisper transcript in Caregiver Triage</div>
                </div>
                <button
                  type="button"
                  onClick={() => setLiveTranscript(!liveTranscript)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    liveTranscript ? 'bg-indigo-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      liveTranscript ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="p-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950">
            <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-400" /> Changes sync to Mom's S24 via Tailscale WireGuard
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Save Rules
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
      )}
    </AnimatePresence>
  );
}
