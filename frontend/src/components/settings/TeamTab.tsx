import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi, inviteLink, isOffice, ROLE_LABELS, type AuthUser, type Invitation, type Role } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { useEntities } from '@/hooks/useEntities'
import { formatDate } from '@/utils'
import Drawer from '@/components/ui/Drawer'
import { Field, Grid, Section, control } from '@/components/ui/Field'
import { Pill } from '@/components/ui/PageShell'

const ROLES: Role[] = ['admin', 'accountant', 'dispatcher', 'driver']

/** Who can sign in to this company, and the invitations still waiting. Owner only. */
export default function TeamTab() {
  const { user: me } = useAuth()
  const entities = useEntities()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [invites, setInvites] = useState<Invitation[]>([])
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<AuthUser | null>(null)
  const owner = me?.role === 'admin'

  const load = useCallback(async () => {
    try {
      setUsers(await authApi.listUsers())
      if (owner) setInvites(await authApi.listInvitations())
    } catch (e) { toast.error((e as Error).message) }
  }, [owner])
  useEffect(() => { load() }, [load])

  const copy = async (inv: Invitation) => {
    try { await navigator.clipboard.writeText(inviteLink(inv.token)); toast.success('Link copied. Send it to them.') }
    catch { toast(inviteLink(inv.token)) }
  }
  const revoke = async (inv: Invitation) => {
    if (!confirm(`Cancel the invitation for ${inv.name}?`)) return
    try { await authApi.revokeInvitation(inv.id); load() } catch (e) { toast.error((e as Error).message) }
  }
  const deactivate = async (u: AuthUser) => {
    if (!confirm(`Deactivate ${u.name}? They will not be able to sign in.`)) return
    try { await authApi.deactivateUser(u.id); toast.success('Deactivated'); load() } catch (e) { toast.error((e as Error).message) }
  }
  const linkedName = (u: AuthUser) =>
    u.role === 'driver' ? entities.drivers.find(d => d.id === u.driver_id)?.name
    : u.role === 'dispatcher' ? entities.dispatchers.find(d => d.id === u.dispatcher_id)?.name : undefined

  return (
    <div className="space-y-3">
      <Section title="People" description="Everyone who can sign in. Drivers use the driver app, the rest use this office."
        action={owner && <button onClick={() => setInviting(true)} className="btn-primary h-8 rounded-lg px-3 text-xs"><Plus className="h-3.5 w-3.5" />Invite</button>}>
        <table className="w-full text-xs">
          <thead><tr className="border-b border-slate-200 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">Role</th><th className="px-2 py-2 text-left">Linked to</th><th className="px-2 py-2 text-left">Last sign-in</th><th className="px-2 py-2 text-left">Status</th><th />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-blue-50/40">
                <td className="px-2 py-2.5"><div className="font-semibold text-slate-900">{u.name}{u.id === me?.id && <span className="ml-1.5 font-normal text-slate-400">(you)</span>}</div><div className="text-[0.6875rem] text-slate-500">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></td>
                <td className="px-2 py-2.5"><Pill tone={u.role === 'admin' ? 'blue' : isOffice(u.role) ? 'slate' : 'amber'}>{ROLE_LABELS[u.role]}</Pill></td>
                <td className="px-2 py-2.5 text-slate-700">{linkedName(u) || <span className="text-slate-300">—</span>}</td>
                <td className="px-2 py-2.5 text-slate-500">{u.last_login ? formatDate(u.last_login) : 'Never'}</td>
                <td className="px-2 py-2.5">{u.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}</td>
                <td className="px-2 py-2.5 text-right whitespace-nowrap">
                  {owner && u.id !== me?.id && <>
                    <button onClick={() => setEditing(u)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">Edit</button>
                    {u.is_active && <button onClick={() => deactivate(u)} aria-label={`Deactivate ${u.name}`} className="ml-1 text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {owner && (
        <Section title="Invitations waiting" description="Each link works once and expires after 7 days.">
          {invites.length === 0 ? <p className="py-4 text-center text-slate-400">Nobody is waiting. Invite a driver or a dispatcher above.</p> : (
            <ul className="divide-y divide-slate-100">
              {invites.map(inv => (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><Link2 className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{inv.name} <span className="font-normal text-slate-500">· {ROLE_LABELS[inv.role]}</span></div>
                    <div className="text-[0.6875rem] text-slate-500">{inv.email} · {inv.expired ? <span className="text-red-600">expired</span> : `expires ${formatDate(inv.expires_at)}`}</div>
                  </div>
                  <button onClick={() => copy(inv)} className="btn-secondary h-8 rounded-lg px-2.5 text-xs"><Copy className="h-3.5 w-3.5" />Copy link</button>
                  <button onClick={() => revoke(inv)} aria-label="Cancel invitation" className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {inviting && <InviteDrawer drivers={entities.drivers} dispatchers={entities.dispatchers} users={users} onClose={() => setInviting(false)} onDone={() => { setInviting(false); load() }} />}
      {editing && <EditDrawer user={editing} drivers={entities.drivers} dispatchers={entities.dispatchers} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
    </div>
  )
}

function InviteDrawer({ drivers, dispatchers, users, onClose, onDone }: { drivers: { id: number; name: string; email?: string; phone?: string }[]; dispatchers: { id: number; name: string; email?: string }[]; users: AuthUser[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', role: 'driver' as Role, driver_id: '', dispatcher_id: '' })
  const [created, setCreated] = useState<Invitation | null>(null)
  const [busy, setBusy] = useState(false)
  const taken = new Set(users.map(u => u.driver_id).filter(Boolean))
  const pickDriver = (id: string) => {
    const d = drivers.find(x => String(x.id) === id)
    setF({ ...f, driver_id: id, name: d ? d.name : f.name, email: d?.email || f.email })
  }
  const pickDispatcher = (id: string) => {
    const d = dispatchers.find(x => String(x.id) === id)
    setF({ ...f, dispatcher_id: id, name: d ? d.name : f.name, email: d?.email || f.email })
  }
  const send = async () => {
    if (!f.name.trim() || !f.email.trim()) return toast.error('Name and email are required')
    setBusy(true)
    try {
      const inv = await authApi.invite({ name: f.name, email: f.email, role: f.role, driver_id: f.driver_id ? Number(f.driver_id) : null, dispatcher_id: f.dispatcher_id ? Number(f.dispatcher_id) : null })
      setCreated(inv)
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const copy = async () => {
    if (!created) return
    try { await navigator.clipboard.writeText(inviteLink(created.token)); toast.success('Link copied') } catch { /* shown below anyway */ }
  }
  return (
    <Drawer title="Invite someone" subtitle="They get a link, set a password, and are in." width={560} onClose={onClose}>
      {created ? (
        <Section title="Invitation ready" description={`Send this link to ${created.name}. It works once and expires in 7 days.`}>
          <div className="flex items-center gap-2">
            <input readOnly value={inviteLink(created.token)} className={`${control} font-mono text-[0.6875rem]`} onFocus={e => e.target.select()} />
            <button onClick={copy} className="btn-primary h-9 shrink-0 rounded-lg px-3 text-xs"><Copy className="h-3.5 w-3.5" />Copy</button>
          </div>
          <div className="mt-4 flex justify-end"><button onClick={onDone} className="btn-secondary h-9 rounded-lg px-4 text-xs">Done</button></div>
        </Section>
      ) : (
        <div className="space-y-3">
          <Section title="Who">
            <Grid>
              <Field label="Role"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role, driver_id: '', dispatcher_id: '' })} className={control}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
              {f.role === 'driver' && <Field label="Driver record" hint="Links the account to the driver's pay and truck."><select value={f.driver_id} onChange={e => pickDriver(e.target.value)} className={control}><option value="">Pick a driver…</option>{drivers.map(d => <option key={d.id} value={d.id} disabled={taken.has(d.id)}>{d.name}{taken.has(d.id) ? ' (has an account)' : ''}</option>)}</select></Field>}
              {f.role === 'dispatcher' && <Field label="Dispatcher record" hint="Links the account to their commission."><select value={f.dispatcher_id} onChange={e => pickDispatcher(e.target.value)} className={control}><option value="">Pick a dispatcher…</option>{dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
              <Field label="Name" required span={2}><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={control} /></Field>
              <Field label="Email" required span={2}><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={control} placeholder="They sign in with this" /></Field>
            </Grid>
          </Section>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost h-9 rounded-lg px-3 text-xs">Cancel</button>
            <button onClick={send} disabled={busy} className="btn-primary h-9 rounded-lg px-4 text-xs">{busy ? 'Creating…' : 'Create invitation link'}</button>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function EditDrawer({ user, drivers, dispatchers, onClose, onDone }: { user: AuthUser; drivers: { id: number; name: string }[]; dispatchers: { id: number; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: user.name, email: user.email, phone: user.phone || '', role: user.role, driver_id: user.driver_id ? String(user.driver_id) : '', dispatcher_id: user.dispatcher_id ? String(user.dispatcher_id) : '', is_active: user.is_active, password: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await authApi.updateUser(user.id, { name: f.name, email: f.email, phone: f.phone, role: f.role, is_active: f.is_active,
        driver_id: f.role === 'driver' && f.driver_id ? Number(f.driver_id) : null, dispatcher_id: f.role === 'dispatcher' && f.dispatcher_id ? Number(f.dispatcher_id) : null,
        ...(f.password ? { password: f.password } : {}) })
      toast.success('Saved'); onDone()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Drawer title={user.name} subtitle={user.email} width={560} onClose={onClose}>
      <div className="space-y-3">
        <Section title="Account">
          <Grid>
            <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={control} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} className={control} /></Field>
            <Field label="Email" hint="They sign in with this." span={2}><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} className={control} /></Field>
            <Field label="Role"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })} className={control}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
            {f.role === 'driver' && <Field label="Driver record"><select value={f.driver_id} onChange={e => setF({ ...f, driver_id: e.target.value })} className={control}><option value="">Not linked</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
            {f.role === 'dispatcher' && <Field label="Dispatcher record"><select value={f.dispatcher_id} onChange={e => setF({ ...f, dispatcher_id: e.target.value })} className={control}><option value="">Not linked</option>{dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>}
            <Field label="New password" hint="Leave empty to keep the current one." span={2}><input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} className={control} autoComplete="new-password" /></Field>
          </Grid>
        </Section>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />Can sign in</label>
          <button onClick={save} disabled={busy} className="btn-primary h-9 rounded-lg px-4 text-xs">{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </Drawer>
  )
}
