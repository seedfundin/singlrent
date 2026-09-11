'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, KeyRound, MoreHorizontal, Plus, Settings, ShieldCheck, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Shell, type View } from '@/app/page';

function Flag({ children, tone = 'green' }: { children: React.ReactNode; tone?: 'green' | 'gold' | 'red' | 'slate' }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

function Metric({ label, value, note, tone = '' }: { label: string; value: string; note: string; tone?: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

const admins = [
  ['AO', 'Amina Okoro', 'Super Admin', 'Active', 'Now', 'Full system access'],
  ['IT', 'Ifeanyi Thomas', 'Operations Admin', 'Active', '12 min ago', 'Users · Listings · Reports'],
  ['AD', 'Aisha Danjuma', 'Payments Admin', 'Active', '2 hours ago', 'Transactions · Escrow'],
  ['BM', 'Bola Musa', 'Support Admin', 'Inactive', '18 days ago', 'Users · Maintenance'],
];

export function AdminManagement({ go }: { go: (view: View) => void }) {
  const [mode, setMode] = useState<'list' | 'add' | 'profile'>('list');
  return <Shell go={go} role="admin" title="Admin management"><div className="page admin-management">
    <div className="page-title"><span><small>Super Admin controls</small><h1>Admin management</h1><p>Create admins, assign roles and review access across the Single Rent platform.</p></span><span className="super-badge"><ShieldCheck size={14} /> Super Admin only</span></div>
    {mode === 'list' && <>
      <div className="admin-summary"><Metric label="Active admins" value="06" note="Across 4 roles" /><Metric label="Super Admins" value="01" note="Amina Okoro" tone="gold" /><Metric label="Needs review" value="02" note="Permissions changed this week" tone="green" /></div>
      <section className="panel admins-table"><div className="subhead"><span><small>Platform administrators</small><h2>People with access</h2></span><Button onClick={() => setMode('add')}><Plus size={14} /> Add admin</Button></div><div className="admin-thead"><span>Admin</span><span>Role</span><span>Status</span><span>Last active</span><span>Permission summary</span></div>
        {admins.map(([initials, name, role, status, last, permissions]) => <button className="admin-person" key={name} onClick={() => setMode('profile')}><span><i>{initials}</i><b>{name}<small>{name.toLowerCase().replace(' ', '.')}@singlerent.ng</small></b></span><Flag tone={role === 'Super Admin' ? 'gold' : 'slate'}>{role}</Flag><Flag tone={status === 'Active' ? 'green' : 'red'}>{status}</Flag><small>{last}</small><small>{permissions}</small><ChevronRight size={15} /></button>)}
      </section>
    </>}
    {mode === 'add' && <section className="admin-form"><button className="back" onClick={() => setMode('list')}><ArrowLeft size={14} /> All admins</button><div className="page-title"><span><small>Super Admin only</small><h1>Add platform admin</h1><p>Invite an admin, select a role and decide which permissions to grant.</p></span></div><div className="formgrid"><label>Full name<input placeholder="e.g. Chiamaka Eze" /></label><label>Work email<input placeholder="name@singlerent.ng" /></label><label>Admin role<button>Operations Admin <ChevronDown size={14} /></button></label><label>Account status<button>Active <ChevronDown size={14} /></button></label></div><div className="permission-callout"><ShieldCheck size={18} /><span><b>Permission control stays with Super Admins</b>Choose a preset role now, then tailor individual permissions after creating this admin.</span><Button variant="outline" onClick={() => go('permissions')}>Review permissions</Button></div><div className="actions"><Button variant="ghost" onClick={() => setMode('list')}>Cancel</Button><Button onClick={() => setMode('profile')}>Create admin <ArrowRight size={14} /></Button></div></section>}
    {mode === 'profile' && <section className="admin-profile"><button className="back" onClick={() => setMode('list')}><ArrowLeft size={14} /> All admins</button><div className="profile-hero"><i>IT</i><span><Flag tone="slate">Operations Admin</Flag><h1>Ifeanyi Thomas</h1><p>ifeanyi.thomas@singlerent.ng · Active now</p></span><Button onClick={() => go('permissions')}><Settings size={14} /> Edit permissions</Button></div><div className="profile-grid"><AdminDetails title="Admin profile" values={[['Role', 'Operations Admin'], ['Status', 'Active'], ['Last active', '12 minutes ago'], ['Added by', 'Amina Okoro']]} /><AdminDetails title="Permission summary" values={[['Users', 'View, edit, suspend, view KYC'], ['Properties', 'View, approve, reject'], ['Reports & maintenance', 'View and resolve'], ['Payments', 'View transactions only']]} /></div><section className="panel audit-mini"><div><small>Recent activity</small><h3>Admin audit log</h3></div><span>Today, 10:32 AM <b>Approved a property listing</b><small>3-bed apartment · Ikoyi</small></span><span>Yesterday, 4:16 PM <b>Resolved maintenance case</b><small>Bathroom shower pressure · Lekki</small></span><Button variant="outline" onClick={() => go('permissions')}>View full audit log</Button></section><Button variant="destructive" className="deactivate"><CircleAlert size={14} /> Deactivate admin</Button></section>}
  </div></Shell>;
}

function AdminDetails({ title, values }: { title: string; values: string[][] }) { return <section className="admin-details"><h3>{title}</h3>{values.map(([a, b]) => <span key={a}><small>{a}</small><b>{b}</b></span>)}</section>; }

const permissionGroups = [
  ['Users', ['View users', 'Edit users', 'Suspend users', 'View KYC', 'Approve/reject KYC']],
  ['Properties', ['View listings', 'Approve listings', 'Reject listings', 'Suspend listings']],
  ['Payments', ['View transactions', 'Manage escrow', 'Release payouts', 'Process refunds', 'View platform fees', 'View agent commissions']],
  ['Reports & Maintenance', ['View reports', 'Investigate reports', 'Resolve reports', 'Manage maintenance cases']],
  ['Reviews', ['View reviews', 'Moderate/remove reviews']],
  ['Administration', ['Create admins', 'Edit admin permissions', 'View audit logs', 'Modify system settings']],
];

export function Permissions({ go }: { go: (view: View) => void }) {
  const [superView, setSuperView] = useState(true);
  return <Shell go={go} role="admin" title="Permissions"><div className="page permissions">
    <div className="page-title"><span><small>Admin access control</small><h1>Roles & permissions</h1><p>Design preview for role-based access. Changes are not connected to real accounts.</p></span><Button variant="outline" onClick={() => go('admins')}><Users size={14} /> Admin list</Button></div>
    <div className="role-switch"><button className={superView ? 'active' : ''} onClick={() => setSuperView(true)}><ShieldCheck size={15} /><span><b>Amina Okoro</b><small>Super Admin · Full access</small></span></button><button className={!superView ? 'active' : ''} onClick={() => setSuperView(false)}><UserRound size={15} /><span><b>Ifeanyi Thomas</b><small>Operations Admin · Limited access</small></span></button></div>
    <div className="permission-layout"><section className="permission-groups">{permissionGroups.map(([group, entries]) => { const sensitive = group === 'Administration'; return <article key={group}><header><span><h3>{group}</h3><small>{superView ? 'All permissions granted' : 'Role-specific access'}</small></span>{sensitive && !superView ? <Flag tone="gold"><ShieldCheck size={11} /> Restricted</Flag> : <Flag>{superView ? 'Full access' : 'Configured'}</Flag>}</header><div>{entries.map((entry, index) => { const denied = !superView && (sensitive || (group === 'Payments' && index > 0) || (group === 'Users' && entry === 'Approve/reject KYC')); return <label className={denied ? 'locked' : ''} key={entry}><i className={denied ? 'check off' : 'check'}>{!denied && <Check size={12} />}</i>{entry}{denied && <small><KeyRound size={11} /> Super Admin only</small>}</label>; })}</div></article>; })}</section>
      <aside className="permission-side"><div className="sidecard"><i><ShieldCheck /></i><h3>{superView ? 'Super Admin' : 'Restricted role'}</h3><p>{superView ? 'Amina has every permission, including sensitive administration tools.' : 'Ifeanyi can manage day-to-day operations but cannot change administrator access.'}</p><div className="access-stat"><b>{superView ? '25 / 25' : '14 / 25'}</b><small>permissions granted</small></div></div><div className="restricted-card"><KeyRound size={18} /><h3>Sensitive controls</h3><p>Creating admins, editing permissions and system settings are only available to the Super Admin.</p><Button variant="outline" disabled={!superView}>{superView ? 'Edit system settings' : 'Access restricted'}</Button></div></aside>
    </div>
    <section className="panel audit-log"><div className="subhead"><span><small>Visibility & accountability</small><h2>Admin activity audit log</h2></span><Button variant="ghost">Export log <ArrowRight size={13} /></Button></div>{[['Today, 10:32 AM', 'Ifeanyi Thomas', 'Approved property listing', '3-bedroom apartment · Ikoyi'], ['Today, 9:05 AM', 'Amina Okoro', 'Updated admin permissions', 'Payments Admin · Added payout release'], ['Yesterday, 4:16 PM', 'Ifeanyi Thomas', 'Resolved maintenance case', 'Bathroom shower pressure · Lekki']].map(([time, admin, action, detail]) => <div className="audit-row" key={time + admin}><small>{time}</small><span><i>{admin.split(' ').map(x => x[0]).join('')}</i><b>{admin}</b></span><b>{action}</b><small>{detail}</small><Button variant="ghost" size="icon-sm"><MoreHorizontal size={14} /></Button></div>)}</section>
  </div></Shell>;
}
