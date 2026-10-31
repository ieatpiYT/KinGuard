import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, Search, Trash2, ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';

export default function HistoryDrawer({
  isOpen,
  onClose,
  history,
  onClearHistory,
  onShowToast
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = history.filter(
    (item) =>
      item.number.includes(searchTerm) ||
      item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shadow-lg shadow-rose-500/20">
                  <History className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                    Scam Call Audit Log
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-mono font-bold border border-rose-500/30">
                      {history.length} Neutralized
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">All predatory threats auto-scrubbed or blocked by caregiver</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search & Export Bar */}
            <div className="mt-5 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by caller number or fraud pattern..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <button
                onClick={() => onShowToast('Audit report exported to PDF / CSV for legal proof.')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
                title="Export forensic audit log"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3.5 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No scam call logs found matching your filter.
              </div>
            ) : (
              filtered.map((item, idx) => {
                const isExpanded = expandedId === idx;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="space-y-0.5">
                        <div className="font-extrabold text-base text-white font-mono flex items-center gap-2">
                          {item.number}
                          <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                            {item.score}% Risk
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 font-medium">{item.reason}</div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono text-slate-400 block">{item.time}</span>
                        <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded border border-rose-800/50 inline-block mt-0.5">
                          {item.action}
                        </span>
                      </div>
                    </div>

                    {/* Required Badge: "Scrubbed from Native Call Log" */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Scrubbed from Native Call Log
                      </span>

                      <button
                        onClick={() => setExpandedId(isExpanded ? null : idx)}
                        className="text-[11px] text-slate-400 hover:text-indigo-300 font-mono flex items-center gap-1"
                      >
                        {isExpanded ? 'Hide Evidence' : 'View Evidence'}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    {/* Expandable Forensic Insight */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-2 text-xs text-slate-400 space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800 font-mono"
                        >
                          <div className="text-slate-300 font-semibold">Edge Interceptor Forensics:</div>
                          <div>STIR/SHAKEN Attestation: <span className="text-rose-400">FAILED (Spoofed Caller ID)</span></div>
                          <div>Carrier Signature: <span className="text-slate-200">Unregistered VoIP gateway</span></div>
                          <div>Screen Status: <span className="text-emerald-400">Mom's S24 display remained OFF</span></div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950">
            <span className="flex items-center gap-1 text-slate-400">
              <ShieldAlert className="w-4 h-4 text-rose-400" /> Zero-UI Rule: 0 ringers activated
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </div>
      )}
    </AnimatePresence>
  );
}
