import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, CheckCircle2, QrCode, X, Wifi, BatteryCharging, Radio, Plus, ShieldCheck, ArrowRight } from 'lucide-react';

export default function DeviceSwitcherModal({
  isOpen,
  onClose,
  activeDeviceId = 'mom-s24',
  onSelectDevice,
  onShowToast
}) {
  const [showPairingQR, setShowPairingQR] = useState(false);
  const [pairingKey, setPairingKey] = useState('TS-NODE-9941-SLNT');

  const devices = [
    {
      id: 'mom-s24',
      name: "Mom's Galaxy S24",
      model: 'Active • Tailscale 100.84.12.5 • Android 14',
      meshIp: '100.84.12.5',
      status: 'Active • Zero-UI Engaged',
      battery: '84%',
      lastSeen: '4s ago',
      isActive: true,
      color: 'emerald'
    },
    {
      id: 'dad-pixel8',
      name: "Dad's Pixel 8 Pro",
      model: 'Slot 2 of 3 • Offline / Setup Pending',
      meshIp: '100.84.12.9',
      status: 'Slot 2 of 3 • Offline / Setup Pending',
      battery: 'N/A',
      lastSeen: '2 days ago',
      isActive: false,
      color: 'slate'
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="bg-slate-950/95 border border-white/10 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-2xl z-10"
          >
            {/* Glow ambient */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Smartphone className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Protected Ward Devices</h3>
                  <p className="text-xs text-slate-400">Family Guardian Plan • 2 of 3 Protected Slots Configured</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Device Switcher List */}
            <div className="space-y-3">
              {devices.map((device) => {
                const isSelected = device.id === activeDeviceId;
                return (
                  <div
                    key={device.id}
                    onClick={() => {
                      onSelectDevice(device.id);
                      onShowToast(`Switched active view to ${device.name}`);
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500/50 shadow-lg shadow-indigo-600/10'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isSelected
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-extrabold text-base text-white flex items-center gap-2">
                            {device.name}
                            {isSelected && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase tracking-wider">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 font-mono mt-0.5">{device.model}</div>
                        </div>
                      </div>

                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <span className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
                          Switch <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-xs font-mono text-slate-400">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-slate-300">
                          <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                          {device.meshIp}
                        </span>
                        <span>•</span>
                        <span className={isSelected ? 'text-emerald-400' : 'text-slate-400'}>
                          {device.status}
                        </span>
                      </div>
                      {device.battery !== 'N/A' && (
                        <span className="flex items-center gap-1 text-slate-300">
                          <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                          {device.battery}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pair New Device Action Button */}
            <div className="pt-2">
              {!showPairingQR ? (
                <button
                  onClick={() => setShowPairingQR(true)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600/40 hover:to-purple-600/40 border border-indigo-500/40 text-indigo-200 font-bold text-sm transition flex items-center justify-center gap-2.5 shadow-lg shadow-indigo-600/10"
                >
                  <QrCode className="w-4 h-4 text-indigo-300" />
                  <span>+ Pair New Protected Device via QR Code (1 Slot Remaining on Family Guardian Plan)</span>
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 space-y-4 text-center"
                >
                  <div className="text-sm font-bold text-white flex items-center justify-center gap-2">
                    <QrCode className="w-4 h-4 text-indigo-400" />
                    Scan to Provision SilentShield Android Service
                  </div>

                  {/* 100% Pure Dark High-tech QR Code Simulation */}
                  <div className="mx-auto w-40 h-40 bg-slate-900 border border-indigo-500/50 p-2.5 rounded-2xl shadow-[0_0_25px_rgba(99,102,241,0.25)] flex items-center justify-center relative overflow-hidden group">
                    <div className="w-full h-full bg-slate-950 rounded-xl p-2.5 flex flex-col justify-between text-[8px] font-mono text-indigo-300 select-none border border-indigo-500/20">
                      <div className="flex justify-between">
                        <div className="w-7 h-7 border-2 border-indigo-400 rounded-sm flex items-center justify-center">
                          <div className="w-3 h-3 bg-indigo-400 rounded-sm" />
                        </div>
                        <div className="w-7 h-7 border-2 border-indigo-400 rounded-sm flex items-center justify-center">
                          <div className="w-3 h-3 bg-indigo-400 rounded-sm" />
                        </div>
                      </div>
                      <div className="text-center font-bold tracking-widest text-[9px] text-white">
                        SILENT-SHIELD
                      </div>
                      <div className="flex justify-between items-end">
                        <div className="w-7 h-7 border-2 border-indigo-400 rounded-sm flex items-center justify-center">
                          <div className="w-3 h-3 bg-indigo-400 rounded-sm" />
                        </div>
                        <span className="text-[7px] text-indigo-300 font-mono font-bold">SLOT 3/3</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">Or enter Tailscale Mesh Provisioning PIN:</div>
                    <div className="font-mono text-sm font-black text-indigo-300 tracking-widest bg-slate-950 p-2 rounded-xl border border-slate-800 inline-block">
                      {pairingKey}
                    </div>
                  </div>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        setShowPairingQR(false);
                        onShowToast('Device pairing initiated. Awaiting Tailscale mesh handshake...');
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition"
                    >
                      Verify Pairing
                    </button>
                    <button
                      onClick={() => setShowPairingQR(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
              <span>Encrypted via WireGuard / Tailscale</span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
