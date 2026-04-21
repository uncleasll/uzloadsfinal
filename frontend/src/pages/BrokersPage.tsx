import { useState, useEffect } from 'react'
import { brokersApi } from '@/api/entities'
import type { Broker } from '@/types'
import toast from 'react-hot-toast'

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', mc_number: '', city: '', state: '', phone: '', email: '', factoring: false, factoring_company: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try { setBrokers(await brokersApi.list()) }
    catch (e: unknown) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      await brokersApi.create({ name: form.name, mc_number: form.mc_number || undefined, city: form.city || undefined, state: form.state || undefined, phone: form.phone || undefined, email: form.email || undefined, factoring: form.factoring, factoring_company: form.factoring_company || undefined, is_active: true })
      toast.success('Broker created')
      setShowForm(false)
      setForm({ name: '', mc_number: '', city: '', state: '', phone: '', email: '', factoring: false, factoring_company: '' })
      load()
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Brokers</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary">+ New Broker</button>
      </div>
      {showForm && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[{ key: 'name', label: 'Name *', ph: 'Global Freight LLC' }, { key: 'mc_number', label: 'MC #', ph: 'MC123456' }, { key: 'city', label: 'City', ph: 'Dallas' }, { key: 'state', label: 'State', ph: 'TX' }, { key: 'phone', label: 'Phone', ph: '555-0100' }, { key: 'email', label: 'Email', ph: 'broker@example.com' }].map(({ key, label, ph }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input value={(form as Record<string, string | boolean>)[key] as string} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="input-base text-sm" placeholder={ph} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.factoring} onChange={e => setForm(f => ({ ...f, factoring: e.target.checked }))} className="rounded" />
              Factoring
            </label>
            {form.factoring && (
              <input value={form.factoring_company} onChange={e => setForm(f => ({ ...f, factoring_company: e.target.value }))} className="input-base text-sm w-48" placeholder="Factoring company" />
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
            <tr>{['Name', 'MC #', 'City', 'State', 'Phone', 'Factoring', 'Status'].map(h => <th key={h} className="table-th">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={7} className="py-16 text-center text-gray-400">Loading...</td></tr>
              : brokers.length === 0 ? <tr><td colSpan={7} className="py-16 text-center text-gray-400">No brokers</td></tr>
              : brokers.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="table-td font-medium text-blue-600">{b.name}</td>
                  <td className="table-td text-gray-600">{b.mc_number || '—'}</td>
                  <td className="table-td text-gray-600">{b.city || '—'}</td>
                  <td className="table-td text-gray-600">{b.state || '—'}</td>
                  <td className="table-td text-gray-600">{b.phone || '—'}</td>
                  <td className="table-td">{b.factoring ? <span className="badge bg-purple-100 text-purple-700">Yes{b.factoring_company ? ` - ${b.factoring_company}` : ''}</span> : <span className="text-gray-400">No</span>}</td>
                  <td className="table-td"><span className={`badge ${b.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{b.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
