import React, { useState } from 'react';
import { Sliders, X, Bell, Check, Lock } from 'lucide-react';

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
  const [caregiverPhone, setCaregiverPhone] = useState(settings?.caregiverPhone ?? '+1 (555) 019-2273');

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveSettings({
      autoDropThreshold: autoDrop,
      quarantineThreshold: quarantineFloor,
      emergencyRepeatBypass: repeatBypass,
      pushAlerts,
      smsAlerts,
      caregiverPhone
    });
    onShowToast(`Saved screening rules: Auto-block above ${autoDrop}%, Review between ${quarantineFloor}% and ${autoDrop}%.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-[#18365A]/40 transition-opacity"
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white border-l border-[#E5E0C8] shadow-xl flex flex-col justify-between isolated-panel">
          {/* Header */}
          <div className="p-6 border-b border-[#E5E0C8]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EDF2F8] border border-[#C4D3E3] flex items-center justify-center">
                  <Sliders className="w-5 h-5 text-[#18365A]" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="rules-title" className="font-display text-lg font-bold text-[#18365A]">
                    Screening Rules &amp; Alerts
                  </h3>
                  <p className="text-xs text-slate-600">Choose how unknown callers are handled on Mom's Galaxy S24</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-[#FBF9ED] rounded-lg text-slate-500 hover:text-[#18365A] transition"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
            {/* Rule 1: Auto-Block Slider */}
            <div className="p-4 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-display font-bold text-sm text-[#18365A]">
                    Automatic Scam Blocking
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Calls scoring above this risk level are blocked immediately without ringing.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-display text-xl font-bold text-rose-700">&gt;{autoDrop}%</span>
                  <span className="text-[11px] text-slate-500 block">Risk score</span>
                </div>
              </div>

              <input
                type="range"
                min="75"
                max="99"
                aria-label="Automatic scam blocking threshold"
                value={autoDrop}
                onChange={(e) => setAutoDrop(Number(e.target.value))}
                className="w-full h-2 bg-[#E5E0C8] rounded-lg cursor-pointer accent-rose-600"
              />
              <div className="flex justify-between text-xs text-slate-600">
                <span>75% (More strict)</span>
                <span className="font-bold text-[#18365A]">Recommended: 90%</span>
                <span>99% (Only obvious scams)</span>
              </div>
            </div>

            {/* Rule 2: Caregiver Review Window */}
            <div className="p-4 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-display font-bold text-sm text-[#18365A]">
                    Caregiver Review Range
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Uncertain calls in this range are silenced and sent to your review queue.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-display text-xl font-bold text-[#C24E0A]">{quarantineFloor}%–{autoDrop}%</span>
                  <span className="text-[11px] text-slate-500 block">Review range</span>
                </div>
              </div>

              <input
                type="range"
                min="30"
                max="70"
                aria-label="Caregiver review minimum threshold"
                value={quarantineFloor}
                onChange={(e) => setQuarantineFloor(Number(e.target.value))}
                className="w-full h-2 bg-[#E5E0C8] rounded-lg cursor-pointer accent-[#FD7A2C]"
              />
              <div className="flex justify-between text-xs text-slate-600">
                <span>30%</span>
                <span className="font-bold text-[#18365A]">Recommended: 50%</span>
                <span>70%</span>
              </div>
            </div>

            {/* Rule 3: Emergency Repeat-Caller Bypass */}
            <div className="p-4 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] space-y-2.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-display font-bold text-sm text-[#18365A]">
                    Emergency Repeat-Caller Safety
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    If an unknown number calls twice within 5 minutes, let it ring through in case of a family or medical emergency.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={repeatBypass}
                  onClick={() => setRepeatBypass(!repeatBypass)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 ${
                    repeatBypass ? 'bg-[#6A8B5E] border-[#4F6B45]' : 'bg-slate-300 border-slate-400'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-150 ${
                      repeatBypass ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Rule 4: Caregiver Alert Channels */}
            <div className="p-4 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] space-y-3.5">
              <div className="font-display font-bold text-sm text-[#18365A] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FD7A2C]" aria-hidden="true" />
                Caregiver Notifications
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#E5E0C8]">
                <div>
                  <div className="text-xs font-bold text-[#18365A]">Push Notifications</div>
                  <div className="text-xs text-slate-600">Alert me when a call needs review</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pushAlerts}
                  onClick={() => setPushAlerts(!pushAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 ${
                    pushAlerts ? 'bg-[#6A8B5E] border-[#4F6B45]' : 'bg-slate-300 border-slate-400'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-150 ${
                      pushAlerts ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#E5E0C8]">
                <div>
                  <div className="text-xs font-bold text-[#18365A]">Text Message (SMS) Alerts</div>
                  <div className="text-xs text-slate-600">Send a text with a quick-approve link to:</div>
                  <input
                    type="text"
                    value={caregiverPhone}
                    onChange={(e) => setCaregiverPhone(e.target.value)}
                    aria-label="Caregiver phone number"
                    className="mt-1.5 bg-white border border-[#E5E0C8] rounded-lg px-2.5 py-1 text-xs text-[#18365A] focus:outline-none focus:border-[#6A8B5E]"
                  />
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={smsAlerts}
                  onClick={() => setSmsAlerts(!smsAlerts)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 ${
                    smsAlerts ? 'bg-[#6A8B5E] border-[#4F6B45]' : 'bg-slate-300 border-slate-400'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-150 ${
                      smsAlerts ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#18365A]">Voicemail Transcript Preview</div>
                  <div className="text-xs text-slate-600">Show written summary of held calls</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={liveTranscript}
                  onClick={() => setLiveTranscript(!liveTranscript)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors duration-150 ${
                    liveTranscript ? 'bg-[#6A8B5E] border-[#4F6B45]' : 'bg-slate-300 border-slate-400'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-150 ${
                      liveTranscript ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#E5E0C8] flex items-center justify-between text-xs text-slate-600 bg-[#FBF9ED]">
            <span className="flex items-center gap-1.5 font-semibold">
              <Lock className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" /> Syncs automatically to Mom's phone
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-[#EFF5EC] text-[#18365A] border border-[#E5E0C8] rounded-lg font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 bg-[#6A8B5E] hover:bg-[#4F6B45] text-white rounded-lg font-bold transition flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" aria-hidden="true" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
