import React, { useState } from 'react';
import { UserCheck, Plus, X, Search, Trash2, Phone, ShieldCheck, Check } from 'lucide-react';

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

  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newCategory] = useState('Family');

  if (!isOpen) return null;

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newNumber.trim()) {
      onShowToast('Please provide a phone number.', 'amber');
      return;
    }

    const label = newName.trim() || newNumber.trim();
    onAddContact({
      name: label,
      number: newNumber.trim(),
      category: newCategory,
      date: 'Just now'
    });

    setNewName('');
    setNewNumber('');
    setShowAddForm(false);
    onShowToast(`Added ${label} to allowed contacts.`);
  };

  const filtered = whitelist.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.number || '').includes(searchTerm)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="whitelist-title">
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
                <div className="w-10 h-10 rounded-xl bg-[#EFF5EC] border border-[#C3D7BC] flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-[#4F6B45]" aria-hidden="true" />
                </div>
                <div>
                  <h3 id="whitelist-title" className="font-display text-lg font-bold text-[#18365A] flex items-center gap-2">
                    Allowed Contacts
                    <span className="font-sans text-xs px-2.5 py-0.5 rounded-full bg-[#EFF5EC] text-[#4F6B45] font-bold border border-[#C3D7BC]">
                      {whitelist.length} Active
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600">Trusted callers that always ring Mom's phone right away</p>
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

            {/* Search & Add Bar */}
            <div className="mt-4 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search allowed phone numbers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#FBF9ED] border border-[#E5E0C8] rounded-lg pl-9 pr-3 py-2 text-xs text-[#18365A] placeholder-slate-400 focus:outline-none focus:border-[#6A8B5E] transition"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-3.5 py-2 bg-[#18365A] hover:bg-[#102540] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{showAddForm ? 'Cancel' : 'Add Number'}</span>
              </button>
            </div>

            {/* Manually Add Contact Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddSubmit}
                className="mt-4 p-4 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] space-y-3"
              >
                <div className="text-xs font-bold text-[#18365A]">
                  Add Allowed Number
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder="Phone number (e.g. +1 555-123-4567)"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="bg-white border border-[#E5E0C8] rounded-lg px-3 py-2 text-xs text-[#18365A] placeholder-slate-400 focus:outline-none focus:border-[#6A8B5E]"
                  />
                  <input
                    type="text"
                    placeholder="Optional label (e.g. Home)"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-white border border-[#E5E0C8] rounded-lg px-3 py-2 text-xs text-[#18365A] placeholder-slate-400 focus:outline-none focus:border-[#6A8B5E]"
                  />
                </div>

                <div className="flex items-center justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#6A8B5E] hover:bg-[#4F6B45] text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
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
              <div className="text-center py-12 bg-[#FBF9ED] rounded-xl border border-[#E5E0C8] text-slate-600 text-sm">
                No allowed contacts on phone or added yet.
              </div>
            ) : (
              filtered.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#FBF9ED] border border-[#E5E0C8] hover:border-[#C3D7BC] transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-[#6A8B5E] shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-bold text-sm text-[#18365A] flex items-center gap-2">
                        <span>{item.number || item.name}</span>
                        {item.name && item.name !== item.number && (
                          <span className="text-xs text-slate-500 font-medium">({item.name})</span>
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
          <div className="p-4 border-t border-[#E5E0C8] flex items-center justify-between text-xs text-slate-600 bg-[#FBF9ED]">
            <span className="flex items-center gap-1.5 text-[#4F6B45] font-bold">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Synced with Mom's phone contacts
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-[#EFF5EC] text-[#18365A] border border-[#E5E0C8] rounded-lg font-bold transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
