import React, { useState } from 'react';
import { UserCheck, Plus, X, Search, Trash2, Building2, Phone, ShieldCheck, Check } from 'lucide-react';

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

  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newCategory, setNewCategory] = useState('Family');

  if (!isOpen) return null;

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newNumber.trim()) {
      onShowToast('Please provide both contact name and phone number.', 'amber');
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
    onShowToast(`Added ${newName.trim()} (${newNumber.trim()}) to allowed contacts.`);
  };

  const filtered = whitelist.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.number.includes(searchTerm) ||
      c.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="whitelist-title">
      {/* Backdrop without expensive backdrop-blur */}
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
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-emerald-600" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="whitelist-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Allowed Contacts
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                      {whitelist.length} Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Trusted callers that always ring Mom's phone right away</p>
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

            {/* Search & Add Bar */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search allowed phone numbers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{showAddForm ? 'Cancel' : 'Add Number'}</span>
              </button>
            </div>

            {/* Manually Add Contact Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddSubmit}
                className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
              >
                <div className="text-xs font-bold text-slate-700">
                  Add Allowed Number
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Phone number (e.g. +1 555-123-4567)"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                  <input
                    type="text"
                    placeholder="Optional label (e.g. Home)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" /> Save Number
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-2.5 scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No allowed contacts on phone or added yet.
              </div>
            ) : (
              filtered.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                        <span>{item.number || item.name}</span>
                        {item.name && item.name !== item.number && (
                          <span className="text-xs text-slate-500 font-normal">({item.name})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onRemoveContact(item.number);
                      onShowToast(`Removed ${item.number || item.name} from allowed contacts.`);
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition"
                    title="Remove from allowed list"
                    aria-label={`Remove ${item.number || item.name}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50">
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Synced with Mom's phone contacts
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
