import React, { useState } from 'react';
import { History, X, Search, ShieldAlert, CheckCircle2, ChevronDown, ChevronUp, Download } from 'lucide-react';

export default function HistoryDrawer({
  isOpen,
  onClose,
  history,
  onShowToast
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  if (!isOpen) return null;

  const filtered = history.filter(
    (item) =>
      item.number.includes(searchTerm) ||
      item.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.action.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 transition-opacity"
      />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white border-l border-slate-200 shadow-xl flex flex-col justify-between isolated-panel">
          {/* Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
                  <History className="w-5 h-5 text-rose-600" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="history-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Blocked Call Log
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-800 font-semibold border border-rose-200">
                      {history.length} Blocked
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Scam calls quietly blocked before ringing Mom's phone</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Search & Export Bar */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search by phone number or reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <button
                type="button"
                onClick={() => onShowToast('Call history exported to CSV.')}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No blocked calls recorded yet.
              </div>
            ) : (
              filtered.map((item, idx) => {
                const isExpanded = expandedId === idx;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                          {item.number}
                          <span className="text-xs px-2 py-0.5 rounded-md font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                            {item.score}% Risk
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">{item.reason}</div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">{item.time}</span>
                        <span className="text-[11px] font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                          {item.action}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 text-xs">
                      <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Hidden from Mom's call log
                      </span>

                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : idx)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                      >
                        {isExpanded ? 'Hide details' : 'View details'}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="text-xs text-slate-600 space-y-1 bg-white p-3 rounded-lg border border-slate-200">
                        <div><strong className="text-slate-800">Caller ID Check:</strong> Unverified / Likely Spoofed</div>
                        <div><strong className="text-slate-800">Line Type:</strong> Internet (VoIP) number</div>
                        <div><strong className="text-slate-800">Phone Status:</strong> Ringer stayed silent</div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
            <span className="flex items-center gap-1.5 text-slate-600">
              <ShieldAlert className="w-4 h-4 text-rose-600" aria-hidden="true" /> Blocked calls never ring Mom's phone
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-semibold transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
