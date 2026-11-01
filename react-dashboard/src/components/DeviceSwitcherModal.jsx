import React, { useState } from 'react';
import { Smartphone, CheckCircle2, QrCode, X, Wifi, BatteryCharging, ArrowRight } from 'lucide-react';

export default function DeviceSwitcherModal({
  isOpen,
  onClose,
  activeDeviceId = 'mom-s24',
  onSelectDevice,
  onShowToast
}) {
  const [showPairingQR, setShowPairingQR] = useState(false);
  const [pairingKey] = useState('KINGUARD-9941');

  if (!isOpen) return null;

  const devices = [
    {
      id: 'mom-s24',
      name: "Mom's Galaxy S24",
      model: 'Android 14 • Connected',
      status: 'Protected • Quiet Mode On',
      battery: '84%'
    },
    {
      id: 'dad-pixel8',
      name: "Dad's Pixel 8 Pro",
      model: 'Android 14 • Setup Pending',
      status: 'Offline',
      battery: 'N/A'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="devices-title">
      <div
        onClick={onClose}
        className="fixed inset-0 bg-[#18365A]/40"
      />

      <div className="bg-white border border-[#E5E0C8] rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 relative z-10 isolated-panel">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E0C8]">
          <div className="flex items-center gap-3">
            <img
              src="/kinguard-mark.jpg"
              alt="KinGuard"
              className="w-10 h-10 rounded-xl object-cover border border-[#C3D7BC]"
            />
            <div>
              <h3 id="devices-title" className="font-display text-lg font-bold text-[#18365A]">Protected Family Phones</h3>
              <p className="text-xs text-slate-600">Family Guardian Plan • 2 of 3 phones added</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#FBF9ED] rounded-lg text-slate-500 hover:text-[#18365A] transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Device List */}
        <div className="space-y-3">
          {devices.map((device) => {
            const isSelected = device.id === activeDeviceId;
            return (
              <div
                key={device.id}
                onClick={() => {
                  onSelectDevice(device.id);
                  onShowToast(`Viewing ${device.name}`);
                }}
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  isSelected
                    ? 'bg-[#EFF5EC]/70 border-[#6A8B5E]'
                    : 'bg-[#FBF9ED] border-[#E5E0C8] hover:border-[#C3D7BC]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isSelected
                          ? 'bg-[#6A8B5E] text-white'
                          : 'bg-white text-[#18365A] border border-[#E5E0C8]'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-display font-bold text-sm text-[#18365A] flex items-center gap-2">
                        {device.name}
                        {isSelected && (
                          <span className="font-sans text-[11px] px-2 py-0.5 rounded-full bg-white text-[#4F6B45] border border-[#C3D7BC] font-bold">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">{device.model}</div>
                    </div>
                  </div>

                  {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-[#6A8B5E]" aria-hidden="true" />
                  ) : (
                    <span className="text-xs text-[#18365A] font-bold flex items-center gap-1">
                      Select <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#E5E0C8] text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" />
                    {device.status}
                  </span>
                  {device.battery !== 'N/A' && (
                    <span className="flex items-center gap-1 text-[#18365A] font-bold">
                      <BatteryCharging className="w-3.5 h-3.5 text-[#6A8B5E]" aria-hidden="true" />
                      {device.battery}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pair New Device */}
        <div>
          {!showPairingQR ? (
            <button
              type="button"
              onClick={() => setShowPairingQR(true)}
              className="w-full py-3 px-4 rounded-xl bg-[#FBF9ED] hover:bg-[#EFF5EC] border border-[#E5E0C8] text-[#18365A] font-bold text-xs transition flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4 text-[#6A8B5E]" aria-hidden="true" />
              <span>Link Another Family Phone (1 Slot Available)</span>
            </button>
          ) : (
            <div className="bg-[#FBF9ED] border border-[#E5E0C8] rounded-xl p-4 space-y-3 text-center">
              <div className="text-xs font-bold text-[#18365A]">
                Enter this code in the KinGuard app on your family member's phone:
              </div>
              <div className="font-mono text-base font-bold text-[#18365A] tracking-wider bg-white px-4 py-2 rounded-lg border border-[#C3D7BC] inline-block">
                {pairingKey}
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowPairingQR(false);
                    onShowToast('Waiting for phone to finish linking...');
                  }}
                  className="px-4 py-1.5 bg-[#6A8B5E] hover:bg-[#4F6B45] text-white rounded-lg text-xs font-bold transition"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => setShowPairingQR(false)}
                  className="px-4 py-1.5 bg-white hover:bg-slate-100 text-[#18365A] border border-[#E5E0C8] rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-[#E5E0C8]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#FBF9ED] hover:bg-[#EFF5EC] text-[#18365A] border border-[#E5E0C8] rounded-lg text-xs font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
