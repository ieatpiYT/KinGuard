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
        className="fixed inset-0 bg-slate-900/40"
      />

      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 relative z-10 isolated-panel">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <h3 id="devices-title" className="text-lg font-bold text-slate-900">Protected Family Phones</h3>
              <p className="text-xs text-slate-500">Family Guardian Plan • 2 of 3 phones added</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition"
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
                    ? 'bg-blue-50/50 border-blue-300'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-slate-500 border border-slate-200'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        {device.name}
                        {isSelected && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{device.model}</div>
                    </div>
                  </div>

                  {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <span className="text-xs text-blue-600 font-semibold flex items-center gap-1">
                      Select <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {device.status}
                  </span>
                  {device.battery !== 'N/A' && (
                    <span className="flex items-center gap-1 text-slate-600 font-medium">
                      <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
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
              className="w-full py-3 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs transition flex items-center justify-center gap-2"
            >
              <QrCode className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span>Link Another Family Phone (1 Slot Available)</span>
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-center">
              <div className="text-xs font-bold text-slate-800">
                Enter this code in the KinGuard app on your family member's phone:
              </div>
              <div className="font-mono text-base font-bold text-blue-700 tracking-wider bg-white px-4 py-2 rounded-lg border border-slate-300 inline-block">
                {pairingKey}
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowPairingQR(false);
                    onShowToast('Waiting for phone to finish linking...');
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => setShowPairingQR(false)}
                  className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
