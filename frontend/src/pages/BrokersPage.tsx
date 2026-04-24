import { useEffect, useMemo, useState } from 'react'
import { brokersApi } from '@/api/entities'
import type { Broker } from '@/types'
import toast from 'react-hot-toast'

type TabType = 'brokers' | 'shippers'

type BrokerFormState = {
  companyName: string
  address: string
  addressLine2: string
  phone: string
  email: string
  city: string
  state: string
  zip: string
  fidEin: string
  mc: string
  notes: string
  isBroker: boolean
  isShipperReceiver: boolean
  billingType: 'direct' | 'factoring'
  factoringCompany: string
  quickpayFee: string
  credit: string
  avgDaysToPay: string
  status: 'Pending' | 'Approved' | 'No buy'
  payTerms: string
}

const INITIAL_FORM_STATE: BrokerFormState = {
  companyName: '',
  address: '',
  addressLine2: '',
  phone: '',
  email: '',
  city: '',
  state: '',
  zip: '',
  fidEin: '',
  mc: '',
  notes: '',
  isBroker: true,
  isShipperReceiver: false,
  billingType: 'factoring',
  factoringCompany: '',
  quickpayFee: '',
  credit: '',
  avgDaysToPay: '',
  status: 'Pending',
  payTerms: '',
}

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Icons
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[14px] w-[14px]">
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusDocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[14px] w-[14px]">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 6l4 4" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
    </svg>
  )
}

function DoubleChevronLeft() { return <span className="text-[10px]">«</span> }
function ChevronLeft() { return <span className="text-[10px]">‹</span> }
function ChevronRight() { return <span className="text-[10px]">›</span> }
function DoubleChevronRight() { return <span className="text-[10px]">»</span> }

export default function BrokersPage() {
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('brokers')
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(50)
  const [page, setPage] = useState(1)
  const [form, setForm] = useState<BrokerFormState>(INITIAL_FORM_STATE)

  const load = async () => {
    try {
      setLoading(true)
      const data = await brokersApi.list()
      setBrokers(data)
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredBrokers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return brokers
    return brokers.filter((b) =>
      [b.name, b.mc_number, b.city, b.state, b.phone, b.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
  }, [brokers, search])

  const totalPages = Math.max(1, Math.ceil(filteredBrokers.length / perPage))
  const safePage = Math.min(page, totalPages)

  const paginatedBrokers = useMemo(() => {
    const start = (safePage - 1) * perPage
    return filteredBrokers.slice(start, start + perPage)
  }, [filteredBrokers, safePage, perPage])

  const startEntry = filteredBrokers.length === 0 ? 0 : (safePage - 1) * perPage + 1
  const endEntry = Math.min(safePage * perPage, filteredBrokers.length)

  const resetForm = () => setForm(INITIAL_FORM_STATE)
  
  const closeModal = () => {
    setShowForm(false)
    resetForm()
  }

  const updateForm = <K extends keyof BrokerFormState>(key: K, value: BrokerFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.companyName.trim()) {
      toast.error('Company Name is required')
      return
    }
    setSaving(true)
    try {
      await brokersApi.create({
        name: form.companyName.trim(),
        mc_number: form.mc.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        factoring: form.billingType === 'factoring',
        factoring_company: form.factoringCompany.trim() || undefined,
        is_active: true,
      })
      toast.success('Customer created')
      closeModal()
      await load()
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f6f8]">
      <div className="border-b border-[#d9dee5] bg-white px-5 pt-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-[#1f2937]">Customers</h1>
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#3f4954]">
              <button className="hover:text-black hover:underline">Pdf</button>
              <span className="text-gray-300">|</span>
              <button className="hover:text-black hover:underline">Excel</button>
              <span className="text-gray-300">|</span>
              <button className="hover:text-black hover:underline">Email</button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa4b2]">
                <SearchIcon />
              </span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search"
                className="h-9 w-[260px] rounded border border-[#d7dce2] bg-white pl-8 pr-3 text-sm text-[#1f2937] outline-none placeholder:text-[#b1b7c0] focus:border-[#94a3b8]"
              />
            </div>

            <button
              onClick={() => setShowForm(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded bg-[#58c777] px-3.5 text-sm font-semibold text-white transition hover:bg-[#4ab668]"
            >
              <PlusDocIcon />
              New customer
            </button>
          </div>
        </div>

        <div className="flex items-end gap-[1px]">
          <button
            onClick={() => setActiveTab('brokers')}
            className={clsx(
              'rounded-t border border-b-0 px-5 py-2 text-sm font-semibold transition-colors',
              activeTab === 'brokers'
                ? 'border-[#cfd6de] bg-[#f8f9fb] text-[#2d3748]'
                : 'border-transparent bg-transparent text-[#38b26b] hover:bg-gray-50'
            )}
          >
            Brokers
          </button>
          <button
            onClick={() => setActiveTab('shippers')}
            className={clsx(
              'rounded-t border border-b-0 px-5 py-2 text-sm font-semibold transition-colors',
              activeTab === 'shippers'
                ? 'border-[#cfd6de] bg-[#f8f9fb] text-[#2d3748]'
                : 'border-transparent bg-transparent text-[#38b26b] hover:bg-gray-50'
            )}
          >
            Shippers/Receivers
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#f5f6f8]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10 border-y border-[#dfe4ea] bg-[#f8f9fb] shadow-sm">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-[#526071]">
              {['Name', 'Address', 'Phone', 'MC', 'Pay Method', 'Credit', 'Avg DTP', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <span>{h}</span>
                    {['Name', 'Phone', 'MC', 'Pay Method', 'Credit', 'Avg DTP', 'Status'].includes(h) && (
                      <span className="text-[9px] text-[#9ba6b5]">↕</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="bg-white">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-[#94a3b8]">
                  Loading...
                </td>
              </tr>
            ) : activeTab === 'shippers' ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-[#94a3b8]">
                  Shippers/Receivers UI tayyor, backend list hali brokerlardan alohida ulanmagan.
                </td>
              </tr>
            ) : paginatedBrokers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-[#94a3b8]">
                  No customers found
                </td>
              </tr>
            ) : (
              paginatedBrokers.map((broker) => (
                <tr key={broker.id} className="border-b border-[#f1f4f8] text-sm text-[#1f2937] transition-colors hover:bg-[#fafbfd]">
                  <td className="px-4 py-2.5">
                    <button className="font-medium text-[#1a73e8] underline-offset-2 hover:underline">
                      {broker.name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-[#475569]">{broker.city ? `${broker.city}${broker.state ? `, ${broker.state}` : ''}` : '—'}</td>
                  <td className="px-4 py-2.5 text-[#475569]">{broker.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-[#475569]">{broker.mc_number || '—'}</td>
                  <td className="px-4 py-2.5 text-[#475569]">{broker.factoring ? 'Factoring' : 'Direct billing'}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#6ad08a] text-xs font-medium text-[#4ebd72]">
                      B
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#475569]">—</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full border border-[#f4b14f] bg-[#fff8ef] px-2.5 py-[2px] text-xs font-semibold text-[#ef9b1f]">
                      Pending
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#59c879] text-white transition hover:bg-[#4eb96d]">
                        <EditIcon />
                      </button>
                      <button className="text-[#64748b] hover:text-black">
                        <ChevronDownIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[#dfe4ea] bg-white px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-[#526071]">
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPage(1)} className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#e3e8ee] bg-[#f8fafc] text-[#a8b1bc] hover:bg-gray-100">
                <DoubleChevronLeft />
              </button>
              <button onClick={() => setPage(Math.max(1, page - 1))} className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#e3e8ee] bg-[#f8fafc] text-[#a8b1bc] hover:bg-gray-100">
                <ChevronLeft />
              </button>
              <button className="inline-flex h-6 min-w-[24px] items-center justify-center rounded bg-[#58c777] px-2 text-xs font-semibold text-white">
                {safePage}
              </button>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#e3e8ee] bg-[#f8fafc] text-[#a8b1bc] hover:bg-gray-100">
                <ChevronRight />
              </button>
              <button onClick={() => setPage(totalPages)} className="inline-flex h-6 w-6 items-center justify-center rounded border border-[#e3e8ee] bg-[#f8fafc] text-[#a8b1bc] hover:bg-gray-100">
                <DoubleChevronRight />
              </button>
            </div>

            <span>
              Showing {startEntry} to {endEntry} of {filteredBrokers.length} entries
            </span>

            <button className="font-semibold text-[#1f2937] underline underline-offset-2 hover:text-black">
              Show inactive partners
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#526071]">
            <span className="font-medium">Show records</span>
            {[10, 25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => {
                  setPerPage(size)
                  setPage(1)
                }}
                className={clsx(
                  'font-semibold',
                  perPage === size ? 'text-[#3b82f6] underline underline-offset-2' : 'text-[#8a94a6] hover:text-[#526071]'
                )}
              >
                {size}
              </button>
            ))}
            <span className="font-medium">on page</span>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[95vh] w-full max-w-[1100px] flex-col overflow-hidden rounded bg-white shadow-2xl">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-[#f8f9fb] px-6 py-3">
              <h2 className="text-[16px] font-bold text-gray-800">New Customer</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto px-8 py-6">
              <div className="flex flex-col gap-10 md:flex-row">
                
                {/* LEFT COLUMN - General Info */}
                <div className="flex flex-1 flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Company Name</label>
                    <div className="relative">
                      <input
                        value={form.companyName}
                        onChange={(e) => updateForm('companyName', e.target.value)}
                        placeholder="Search by name or MC number"
                        className="h-[36px] w-full rounded border border-gray-200 bg-[#fcfcfd] px-3 text-sm outline-none placeholder:text-gray-400 focus:border-[#58c777] focus:ring-1 focus:ring-[#58c777]"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <SearchIcon />
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Address</label>
                    <input
                      value={form.address}
                      onChange={(e) => updateForm('address', e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Address line 2</label>
                    <input
                      value={form.addressLine2}
                      onChange={(e) => updateForm('addressLine2', e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Phone</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <PhoneIcon />
                        </span>
                        <input
                          value={form.phone}
                          onChange={(e) => updateForm('phone', e.target.value)}
                          className="h-[36px] w-full rounded border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-[#58c777]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Email</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                          @
                        </span>
                        <input
                          value={form.email}
                          onChange={(e) => updateForm('email', e.target.value)}
                          className="h-[36px] w-full rounded border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-[#58c777]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">City</label>
                      <input
                        value={form.city}
                        onChange={(e) => updateForm('city', e.target.value)}
                        className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">State</label>
                      <select
                        value={form.state}
                        onChange={(e) => updateForm('state', e.target.value)}
                        className="h-[36px] w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#58c777] bg-white"
                      >
                        <option value=""></option>
                        {STATES.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Zip</label>
                      <input
                        value={form.zip}
                        onChange={(e) => updateForm('zip', e.target.value)}
                        className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">FID/EIN</label>
                      <input
                        value={form.fidEin}
                        onChange={(e) => updateForm('fidEin', e.target.value)}
                        className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-gray-600">MC</label>
                      <input
                        value={form.mc}
                        onChange={(e) => updateForm('mc', e.target.value)}
                        className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => updateForm('notes', e.target.value)}
                      rows={3}
                      className="w-full rounded border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#58c777]"
                    />
                  </div>
                </div>

                {/* RIGHT COLUMN - Settings / Billing */}
                <div className="w-full md:w-[480px] flex flex-col">
                  
                  {/* Customer Type Section */}
                  <div className="mb-8">
                    <h3 className="mb-3 text-[15px] font-bold text-gray-800">Customer type</h3>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                        <div className={clsx("flex h-4 w-4 items-center justify-center rounded", form.isBroker ? "bg-[#58c777]" : "border border-gray-300")}>
                           {form.isBroker && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <input type="checkbox" className="hidden" checked={form.isBroker} onChange={(e) => updateForm('isBroker', e.target.checked)} />
                        Broker
                      </label>
                      <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                        <div className={clsx("flex h-4 w-4 items-center justify-center rounded", form.isShipperReceiver ? "bg-[#58c777]" : "border border-gray-300")}>
                           {form.isShipperReceiver && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <input type="checkbox" className="hidden" checked={form.isShipperReceiver} onChange={(e) => updateForm('isShipperReceiver', e.target.checked)} />
                        Shipper/Receiver
                      </label>
                    </div>
                  </div>

                  {/* Billing Section */}
                  <div>
                    <h3 className="mb-3 text-[15px] font-bold text-gray-800">Billing</h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* Radio Buttons */}
                      <div className="flex flex-col gap-3 justify-center">
                        <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                          <div className={clsx("flex h-[18px] w-[18px] items-center justify-center rounded-full border", form.billingType === 'direct' ? "border-[#58c777]" : "border-gray-300")}>
                            {form.billingType === 'direct' && <div className="h-2.5 w-2.5 rounded-full bg-[#58c777]"></div>}
                          </div>
                          <input type="radio" className="hidden" checked={form.billingType === 'direct'} onChange={() => updateForm('billingType', 'direct')} />
                          Direct billing
                        </label>

                        <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                          <div className={clsx("flex h-[18px] w-[18px] items-center justify-center rounded-full border", form.billingType === 'factoring' ? "border-[#58c777]" : "border-gray-300")}>
                            {form.billingType === 'factoring' && <div className="h-2.5 w-2.5 rounded-full bg-[#58c777]"></div>}
                          </div>
                          <input type="radio" className="hidden" checked={form.billingType === 'factoring'} onChange={() => updateForm('billingType', 'factoring')} />
                          Factoring
                        </label>
                      </div>

                      {/* Factoring Dropdown */}
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Factoring</label>
                        <select
                          value={form.factoringCompany}
                          onChange={(e) => updateForm('factoringCompany', e.target.value)}
                          disabled={form.billingType !== 'factoring'}
                          className="h-[36px] w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#58c777] disabled:bg-gray-50 bg-white"
                        >
                          <option value=""></option>
                          <option value="RTS">RTS</option>
                          <option value="OTR Solutions">OTR Solutions</option>
                          <option value="Triumph">Triumph</option>
                        </select>
                      </div>
                    </div>

                    {/* 3 Column Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Quickpay fee, %</label>
                        <input
                          value={form.quickpayFee}
                          onChange={(e) => updateForm('quickpayFee', e.target.value)}
                          placeholder="e.g. 2.25"
                          className="h-[36px] w-full rounded border border-gray-200 bg-[#cbd5e1] px-3 text-sm outline-none text-gray-700 placeholder:text-gray-500" 
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Credit</label>
                        <select
                          value={form.credit}
                          onChange={(e) => updateForm('credit', e.target.value)}
                          className="h-[36px] w-full rounded border border-gray-200 px-2 text-sm outline-none focus:border-[#58c777] bg-white"
                        >
                          <option value=""></option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Avg days to pay</label>
                        <input
                          value={form.avgDaysToPay}
                          onChange={(e) => updateForm('avgDaysToPay', e.target.value)}
                          className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                        />
                      </div>
                    </div>

                    {/* Status & Pay terms */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Status</label>
                        <select
                          value={form.status}
                          onChange={(e) => updateForm('status', e.target.value as BrokerFormState['status'])}
                          className="h-[36px] w-full rounded border border-[#6ea8fe] px-2 text-sm font-medium text-gray-800 outline-none ring-1 ring-[#6ea8fe] focus:border-[#6ea8fe] bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Approved">Approved</option>
                          <option value="No buy">No buy</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-medium text-gray-600">Pay terms</label>
                        <input
                          value={form.payTerms}
                          onChange={(e) => updateForm('payTerms', e.target.value)}
                          className="h-[36px] w-full rounded border border-gray-200 px-3 text-sm outline-none focus:border-[#58c777]"
                        />
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-[#f8f9fb] px-6 py-4">
              <button
                onClick={closeModal}
                className="inline-flex h-9 items-center gap-2 rounded bg-[#1e293b] px-4 text-sm font-medium text-white transition hover:bg-black"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                Close
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-9 items-center gap-2 rounded bg-[#58c777] px-5 text-sm font-medium text-white transition hover:bg-[#4ab668] disabled:opacity-70"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}