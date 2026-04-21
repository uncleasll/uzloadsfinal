import { useState } from 'react'
import type { LoadFilters } from '@/types'
import { ALL_STATUSES, ALL_BILLING_STATUSES } from '@/utils'
import type { useEntities } from '@/hooks/useEntities'

type Entities = ReturnType<typeof useEntities>

interface Props {
  initial: LoadFilters
  entities: Entities
  onApply: (f: LoadFilters) => void
  onClose: () => void
}

export default function FilterDrawer({ initial, entities, onApply, onClose }: Props) {
  const [f, setF] = useState<LoadFilters>({ ...initial })
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    initial.status ? initial.status.split(',') : []
  )
  const [selectedBillingStatuses, setSelectedBillingStatuses] = useState<string[]>(
    initial.billing_status ? initial.billing_status.split(',') : []
  )

  const toggleStatus = (s: string) =>
    setSelectedStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const toggleBilling = (s: string) =>
    setSelectedBillingStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const handleApply = () => {
    onApply({
      ...f,
      status: selectedStatuses.length > 0 ? selectedStatuses.join(',') : undefined,
      billing_status: selectedBillingStatuses.length > 0 ? selectedBillingStatuses.join(',') : undefined,
    })
  }

  const handleReset = () => {
    setF({})
    setSelectedStatuses([])
    setSelectedBillingStatuses([])
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-80 bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Advanced Filters</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {/* Period */}
          <Section label="Period">
            <select value="" className="select-base text-sm" onChange={() => {}}>
              <option value="">All</option>
            </select>
          </Section>

          {/* Pickup date */}
          <Section label="Pickup date">
            <input type="date" value={f.date_from || ''} onChange={e => setF(p => ({ ...p, date_from: e.target.value || undefined }))}
              className="input-base text-sm w-full mb-1" placeholder="Select Date" />
            <span className="text-xs text-gray-400">+/- 3 days</span>
          </Section>

          {/* Delivery date */}
          <Section label="Delivery date">
            <input type="date" value={f.date_to || ''} onChange={e => setF(p => ({ ...p, date_to: e.target.value || undefined }))}
              className="input-base text-sm w-full mb-1" placeholder="Select Date" />
            <span className="text-xs text-gray-400">+/- 3 days</span>
          </Section>

          {/* Broker */}
          <Section label="Broker">
            <select value={f.broker_id || ''} onChange={e => setF(p => ({ ...p, broker_id: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="select-base text-sm">
              <option value="">All brokers</option>
              {entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Section>

          {/* Driver */}
          <Section label="Driver">
            <select value={f.driver_id || ''} onChange={e => setF(p => ({ ...p, driver_id: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="select-base text-sm">
              <option value="">All drivers</option>
              {entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
            </select>
          </Section>

          {/* Dispatcher */}
          <Section label="Dispatcher">
            <select value={f.dispatcher_id || ''} onChange={e => setF(p => ({ ...p, dispatcher_id: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="select-base text-sm">
              <option value="">All dispatchers</option>
              {entities.dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Section>

          {/* Truck */}
          <Section label="Truck">
            <select value={f.truck_id || ''} onChange={e => setF(p => ({ ...p, truck_id: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="select-base text-sm">
              <option value="">All trucks</option>
              {entities.trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </Section>

          {/* Trailer */}
          <Section label="Trailer">
            <select value={f.trailer_id || ''} onChange={e => setF(p => ({ ...p, trailer_id: e.target.value ? parseInt(e.target.value) : undefined }))}
              className="select-base text-sm">
              <option value="">All trailers</option>
              {entities.trailers.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </Section>

          {/* Direct billing */}
          <Section label="Direct billing / Factoring">
            <div className="flex gap-3">
              {[{ label: 'Direct', val: true }, { label: 'Factoring', val: false }].map(opt => (
                <label key={String(opt.val)} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="direct_billing"
                    checked={f.direct_billing === opt.val}
                    onChange={() => setF(p => ({ ...p, direct_billing: opt.val }))}
                    className="accent-brand-600" />
                  {opt.label}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="direct_billing"
                  checked={f.direct_billing === undefined}
                  onChange={() => setF(p => { const n = { ...p }; delete n.direct_billing; return n })}
                  className="accent-brand-600" />
                All
              </label>
            </div>
          </Section>

          {/* Status */}
          <Section label="Status">
            <div className="flex flex-wrap gap-1.5">
              {ALL_STATUSES.map(s => (
                <button key={s}
                  onClick={() => toggleStatus(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    selectedStatuses.includes(s)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>

          {/* Billing status */}
          <Section label="Billing status">
            <div className="flex flex-wrap gap-1.5">
              {ALL_BILLING_STATUSES.map(s => (
                <button key={s}
                  onClick={() => toggleBilling(s)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    selectedBillingStatuses.includes(s)
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>

          {/* Location status */}
          <Section label="Location status">
            <div className="flex gap-3">
              {['No', 'Yes'].map(opt => (
                <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="location_status" className="accent-brand-600" />
                  {opt}
                </label>
              ))}
            </div>
          </Section>

        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-gray-200">
          <button onClick={handleReset} className="btn-secondary flex-1 justify-center">Reset</button>
          <button onClick={handleApply} className="btn-primary flex-1 justify-center">Apply</button>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  )
}
