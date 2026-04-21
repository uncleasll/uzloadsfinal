import { useState, useEffect, useRef } from 'react'
import client from '@/api/client'
import toast from 'react-hot-toast'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface Company {
  id?: number
  name: string
  legal_name: string
  mc_number: string
  dot_number: string
  address: string
  city: string
  state: string
  zip_code: string
  phone: string
  email: string
  website: string
  logo_path: string
}

const empty: Company = {
  name:'', legal_name:'', mc_number:'', dot_number:'',
  address:'', city:'', state:'', zip_code:'',
  phone:'', email:'', website:'', logo_path:''
}

export default function MyCompanyPage() {
  const [form, setForm]     = useState<Company>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [logoPreview, setLogoPreview] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    client.get('/api/v1/company')
      .then(r => { setForm(r.data); setLogoPreview(r.data.logo_path || '') })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const sf = (k: keyof Company, v: string) => setForm(p => ({...p, [k]: v}))

  const handleSave = () => {
    setSaving(true)
    client.put('/api/v1/company', form)
      .then(() => toast.success('Company settings saved'))
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setLogoPreview(preview)

    const fd = new FormData()
    fd.append('file', file)
    client.post('/api/v1/company/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(r => { setForm(p => ({...p, logo_path: r.data.logo_path})); toast.success('Logo uploaded') })
      .catch(e => toast.error(e.message))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">My Company</h1>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded disabled:opacity-50">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl space-y-6">

          {/* Logo section */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Company Logo</h2>
            <div className="flex items-center gap-5">
              <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-white">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain"/>
                ) : (
                  <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Upload your company logo. It will appear on all generated PDFs.</p>
                <button onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded hover:bg-gray-50">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  Upload Logo
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload}/>
                {logoPreview && (
                  <button onClick={() => { setLogoPreview(''); sf('logo_path','') }} className="ml-2 text-xs text-red-500 hover:text-red-700">Remove</button>
                )}
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG — recommended 300×100px</p>
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Company Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Company Name <span className="text-red-500">*</span></label>
                <input value={form.name} onChange={e=>sf('name',e.target.value)}
                  placeholder="e.g. TopTruck Company"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Legal Name</label>
                <input value={form.legal_name} onChange={e=>sf('legal_name',e.target.value)}
                  placeholder="e.g. TopTruck Company LLC"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">MC Number</label>
                <input value={form.mc_number} onChange={e=>sf('mc_number',e.target.value)}
                  placeholder="e.g. MC-123456"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">DOT Number</label>
                <input value={form.dot_number} onChange={e=>sf('dot_number',e.target.value)}
                  placeholder="e.g. 1234567"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Contact Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={e=>sf('phone',e.target.value)}
                  placeholder="e.g. (970) 610-8065"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                <input type="email" value={form.email} onChange={e=>sf('email',e.target.value)}
                  placeholder="e.g. info@company.com"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Website</label>
                <input value={form.website} onChange={e=>sf('website',e.target.value)}
                  placeholder="e.g. https://www.company.com"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Street Address</label>
                <input value={form.address} onChange={e=>sf('address',e.target.value)}
                  placeholder="e.g. 123 Main St"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">City</label>
                <input value={form.city} onChange={e=>sf('city',e.target.value)}
                  placeholder="e.g. Dallas"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">State</label>
                  <div className="relative">
                    <select value={form.state} onChange={e=>sf('state',e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                      <option value=""></option>
                      {US_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                    <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">ZIP Code</label>
                  <input value={form.zip_code} onChange={e=>sf('zip_code',e.target.value)}
                    placeholder="e.g. 75001"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
                </div>
              </div>
            </div>
          </div>

          {/* PDF Preview info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-1">PDF Documents</p>
              <p className="text-xs text-blue-700">
                Your company name, logo, and contact info will automatically appear on all generated PDFs —
                including <strong>invoices</strong>, <strong>driver settlements</strong>, and <strong>reports</strong>.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
