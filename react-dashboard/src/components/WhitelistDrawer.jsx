import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserCheck, Plus, X, Search, Trash2, Building2, Phone, ShieldCheck, Check, Sparkles } from 'lucide-react';

export default function WhitelistDrawer({
  isOpen,
  onClose,
  whitelist,
  onAddContact,
  onRemoveContact,
  onShowToast
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [institutionalEnabled, setInstitutionalEnabled] = useState(true);

  // Form states
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newCategory, setNewCategory] = useState('Family');

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newNumber.trim()) {
      onShowToast('Please provide both contact name and phone number.');
      return;
    }

    onAddContact({
      name: newName.trim(),
      number: newNumber.trim(),
      category: newCategory,
      date: 'Just now'
    });

    setNewName('');
    setNewNumber('');
    setShowAddForm(false);
    onShowToast(`Whitelisted ${newName.trim()} (${newNumber.trim()}). Pushed to Mom's device address book.`);
  };

  const filtered = whitelist.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.number.includes(searchTerm) ||
      c.category.toLowerCase().includes(searchTerm.toLowerCase())
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
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <UserCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                    Whitelisted Contacts
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">
                      {whitelist.length} Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Zero-latency callers authorized to ring Mom's Galaxy S24</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800/80 rounded-xl text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Institutional Whitelist Master Toggle */}
            <div className="mt-5 p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Institutional Whitelist</div>
                  <div className="text-xs text-slate-400">Hospitals, Pharmacies &amp; Bank 2FA Shortcodes</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !institutionalEnabled;
                  setInstitutionalEnabled(next);
                  onShowToast(
                    next
                      ? 'Institutional Whitelist Enabled: Verified clinics & 2FA will ring freely.'
                      : 'Institutional Whitelist Disabled: All non-personal callers will be screened.'
                  );
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  institutionalEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    institutionalEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Search & Add Bar */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search contacts, clinics, numbers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{showAddForm ? 'Cancel' : 'Add Safe Number'}</span>
              </button>
            </div>

            {/* Manually Add Contact Form Dropdown */}
            <AnimatePresence>
              {showAddForm && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleAddSubmit}
                  className="mt-4 p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/40 space-y-3"
                >
                  <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Manually Authorize Contact
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="Contact Name (e.g. Dr. Adams)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Phone (e.g. +1 555-123-4567)"
                      value={newNumber}
                      onChange={(e) => setNewNumber(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Family">Family Member</option>
                      <option value="Medical">Medical / Physician</option>
                      <option value="Pharmacy">Pharmacy</option>
                      <option value="Financial">Financial / Bank</option>
                      <option value="Caregiver Approved">Caregiver Approved</option>
                    </select>

                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/30"
                    >
                      <Check className="w-3.5 h-3.5" /> Save &amp; Push to S24
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">
                No matching contacts found.
              </div>
            ) : (
              filtered.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-sm text-white flex items-center gap-2">
                      {item.name}
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                      <Phone className="w-3 h-3 text-slate-500" />
                      <span>{item.number}</span>
                      <span className="text-slate-600">•</span>
                      <span>{item.date}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onRemoveContact(item.number);
                        onShowToast(`Removed ${item.name} from whitelist.`);
                      }}
                      className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition opacity-0 group-hover:opacity-100"
                      title="Remove contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-950">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <ShieldCheck className="w-4 h-4" /> Real-time address book synchronization active
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
