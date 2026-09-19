import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Save, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '@/api/client'
import PageShell from '@/components/ui/PageShell'
import { Field, Grid, Section, US_STATES, control } from '@/components/ui/Field'

interface Company {
  id?: number
  name: string; legal_name: string; mc_number: string; dot_number: string
  address: string; city: string; state: string; zip_code: string
  phone: string; email: string; website: string; logo_path: string
}

const empty: Company = { name: '', legal_name: '', mc_number: '', dot_number: '', address: '', city: '', state: '', zip_code: '', phone: '', email: '', website: '', logo_path: '' }
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')
const assetUrl = (p: string) => (!p ? '' : /^https?:\/\//i.test(p) || p.startsWith('blob:') ? p : `${API_BASE}${p.startsWith('/') ? p : `/${p}`}`)

/** Company identity for PDFs: name, numbers, contact and logo. Week rules live in Settings. */
export default function MyCompanyPage() {
  const [form, setForm] = useState<Company>(empty)
  const [saved, setSaved] = useState<Company>(empty)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logo, setLogo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    client.get('/api/v1/company')
      .then(r => { setForm(r.data); setSaved(r.data); setLogo(assetUrl(r.data.logo_path || '')) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const save = async () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    setSaving(true)
    try { await client.put('/api/v1/company', form); setSaved(form); toast.success('Company saved') }
    catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const uploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogo(URL.createObjectURL(file))
    const fd = new FormData(); fd.append('file', file)
    try {
      const r = await client.post('/api/v1/company/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm(p => ({ ...p, logo_path: r.data.logo_path })); setSaved(p => ({ ...p, logo_path: r.data.logo_path })); setLogo(assetUrl(r.data.logo_path))
      toast.success('Logo uploaded')
    } catch (err) { toast.error((err as Error).message) }
  }

  return (
    <PageShell
      title="My company" subtitle="Shown on every invoice, statement and report PDF"
      actions={<button onClick={save} disabled={saving || !dirty} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save changes'}</button>}
    >
      {loading ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          <Section title="Logo" description="PNG, JPG or SVG. About 300 × 100 works best.">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-36 place-items-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                {logo ? <img src={logo} alt="Company logo" className="h-full w-full object-contain p-1" /> : <ImageIcon className="h-6 w-6 text-slate-300" />}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => fileRef.current?.click()} className="btn-secondary h-9 rounded-lg px-3 text-xs"><Upload className="h-3.5 w-3.5" />Upload logo</button>
                {logo && <button onClick={() => { setLogo(''); setForm(p => ({ ...p, logo_path: '' })) }} className="btn-ghost h-9 rounded-lg px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">Remove</button>}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
              </div>
            </div>
          </Section>

          <Section title="Company">
            <Grid>
              <Field label="Company name" required><input value={form.name} onChange={set('name')} className={control} placeholder="Karvan" /></Field>
              <Field label="Legal name"><input value={form.legal_name} onChange={set('legal_name')} className={control} placeholder="Karvan LLC" /></Field>
              <Field label="MC number"><input value={form.mc_number} onChange={set('mc_number')} className={control} placeholder="MC-123456" /></Field>
              <Field label="DOT number"><input value={form.dot_number} onChange={set('dot_number')} className={control} placeholder="1234567" /></Field>
            </Grid>
          </Section>

          <Section title="Contact">
            <Grid>
              <Field label="Phone"><input value={form.phone} onChange={set('phone')} className={control} placeholder="(555) 555-5555" /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={set('email')} className={control} placeholder="office@company.com" /></Field>
              <Field label="Website" span={2}><input value={form.website} onChange={set('website')} className={control} placeholder="https://www.company.com" /></Field>
            </Grid>
          </Section>

          <Section title="Address">
            <Grid cols={3}>
              <Field label="Street" span={3}><input value={form.address} onChange={set('address')} className={control} /></Field>
              <Field label="City"><input value={form.city} onChange={set('city')} className={control} /></Field>
              <Field label="State"><select value={form.state} onChange={set('state')} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
              <Field label="ZIP"><input value={form.zip_code} onChange={set('zip_code')} className={control} /></Field>
            </Grid>
          </Section>
        </div>
      )}
    </PageShell>
  )
}
