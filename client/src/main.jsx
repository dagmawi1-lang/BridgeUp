import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = (import.meta.env?.VITE_API_URL || '') + '/api'
const DEMO_PASSWORD = 'bridgeup-demo-2026'
const NAV = [['home', 'Home'], ['requests', 'Requests'], ['offers', 'Offers'], ['matches', 'Matches'], ['messages', 'Messages'], ['people', 'People'], ['circles', 'Circles'], ['events', 'Events'], ['notifications', 'Notifications'], ['analytics', 'Analytics'], ['moderation', 'Moderation'], ['profile', 'My profile']]
const label = (s) => s.charAt(0).toUpperCase() + s.slice(1)

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e }
  return data
}

function App() {
  const [me, setMe] = useState(undefined) // undefined = loading, null = signed out
  const [page, setPage] = useState('home')
  const [meta, setMeta] = useState({ categories: [], times: [] })
  const [offline, setOffline] = useState(false)
  const [toast, setToast] = useState('')
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('bu-dark') === '1' } catch { return false } })
  const [unread, setUnread] = useState(0)
  const [liveMessage, setLiveMessage] = useState(null)
  const flash = useCallback((m) => { setToast(m); clearTimeout(flash.t); flash.t = setTimeout(() => setToast(''), 2800) }, [])

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('bu-dark', dark ? '1' : '0') } catch {} }, [dark])
  useEffect(() => {
    api('/auth/me').then((d) => setMe(d.user)).catch(() => { setOffline(true); setMe(null) })
    api('/meta').then(setMeta).catch(() => {})
  }, [])
  useEffect(() => {
    if (!me) return
    api('/notifications').then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {})
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(API + '/stream')
    es.addEventListener('notification', (e) => { const n = JSON.parse(e.data); setUnread((u) => u + 1); flash(`🔔 ${n.title}`) })
    es.addEventListener('message', (e) => { const m = JSON.parse(e.data); setLiveMessage(m); flash(`💬 ${m.from.displayName}: ${m.body.slice(0, 60)}`) })
    return () => es.close()
  }, [me, flash])

  if (me === undefined) return <div className="auth"><p>Loading BridgeUp…</p></div>
  if (!me) return <AuthScreen offline={offline} onSignedIn={(u) => { setMe(u); setPage('home') }} />
  const isMod = ['moderator', 'admin'].includes(me.role)
  const nav = NAV.filter(([id]) => id !== 'moderation' || isMod)
  const ctx = { me, setMe, meta, flash, go: setPage, liveMessage }
  return <div className="app">
    <a className="skip" href="#main">Skip to content</a>
    <aside><div className="brand"><b aria-hidden="true">B</b><span><strong>BridgeUp</strong><small>Community support</small></span></div>
      <nav aria-label="Main">{nav.map(([id, l]) => <button aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => setPage(id)} key={id}>{l}{id === 'notifications' && unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread}</span>}</button>)}</nav>
      <div className="bottom"><button onClick={() => setDark(!dark)}>{dark ? '☀ Light' : '◐ Dark'} mode</button><button onClick={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null) }}>⇥ Sign out</button><small className="ok">● {me.displayName} · {me.role}</small></div></aside>
    <main id="main"><header><div><small>COMMUNITY COORDINATION</small><h1>{nav.find((x) => x[0] === page)?.[1]}</h1></div></header>
      {page === 'home' && <Home {...ctx} />}
      {page === 'requests' && <Posts kind="requests" {...ctx} />}
      {page === 'offers' && <Posts kind="offers" {...ctx} />}
      {page === 'matches' && <Matches {...ctx} />}
      {page === 'messages' && <Messages {...ctx} />}
      {page === 'people' && <People {...ctx} />}
      {page === 'circles' && <Circles {...ctx} />}
      {page === 'events' && <Events {...ctx} />}
      {page === 'notifications' && <Notifications {...ctx} onRead={() => setUnread(0)} />}
      {page === 'analytics' && <Analytics {...ctx} />}
      {page === 'moderation' && isMod && <Moderation {...ctx} />}
      {page === 'profile' && <Profile {...ctx} />}
      <footer>BridgeUp V7 · CSC Winter Sparkathon · Demo accounts and data are fictional. Not for emergencies.</footer>
      {toast && <div className="toast" role="status">{toast}</div>}</main></div>
}

function AuthScreen({ onSignedIn, offline }) {
  const [mode, setMode] = useState('login'), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    const f = Object.fromEntries(new FormData(e.currentTarget))
    try { onSignedIn((await api(`/auth/${mode}`, { method: 'POST', body: f })).user) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  async function demo(username) { setErr(''); try { onSignedIn((await api('/auth/login', { method: 'POST', body: { username, password: DEMO_PASSWORD } })).user) } catch (x) { setErr(x.message) } }
  return <div className="auth"><div className="card authcard">
    <div className="brand"><b>B</b><span><strong>BridgeUp</strong><small>Small acts of support, matched well.</small></span></div>
    {offline && <p className="error" role="alert">The BridgeUp server isn't reachable. Start it with <code>npm run dev</code>.</p>}
    <div className="tabs" role="tablist">{['login', 'register'].map((m) => <button role="tab" aria-selected={mode === m} key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'login' ? 'Sign in' : 'Create account'}</button>)}</div>
    <form className="stack" onSubmit={submit}>
      <label><span>Username</span><input name="username" autoComplete="username" required pattern="[a-z0-9_]{3,24}" title="3–24 lowercase letters, numbers, or underscores" /></label>
      {mode === 'register' && <label><span>Display name</span><input name="displayName" required minLength={2} maxLength={60} /></label>}
      <label><span>Password</span><input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 10 : 1} /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="primary full" disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    <div className="demo"><small>Judges & demo: sign in as a fictional user</small><div>{[['jordan', 'Jordan (student)'], ['alex', 'Alex (tutor)'], ['maya', 'Maya (helper)'], ['sam_mod', 'Sam (moderator)']].map(([u, l]) => <button key={u} className="secondary" onClick={() => demo(u)}>{l}</button>)}</div></div>
  </div></div>
}

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null), [error, setError] = useState('')
  const reload = useCallback(() => fn().then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)), deps) // eslint-disable-line
  useEffect(() => { reload() }, [reload])
  return [data, reload, error]
}
const Panel = ({ t, sub, children, actions }) => <section className="card panel"><div className="ph"><div><h2>{t}</h2>{sub && <small>{sub}</small>}</div>{actions}</div>{children}</section>
const Empty = ({ children }) => <p className="empty">{children}</p>
const Err = ({ msg }) => msg ? <p className="error" role="alert">{msg}</p> : null

function ReportButton({ type, id, flash }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState('')
  if (!open) return <button className="link" onClick={() => setOpen(true)}>Report</button>
  return <form className="report" onSubmit={async (e) => { e.preventDefault(); try { await api('/reports', { method: 'POST', body: { targetType: type, targetId: id, reason } }); flash('Report sent to moderators.'); setOpen(false) } catch (x) { flash(x.message) } }}>
    <input aria-label="Reason for report" autoFocus required minLength={5} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong?" /><button className="secondary">Send</button><button type="button" className="link" onClick={() => setOpen(false)}>Cancel</button></form>
}

function Home({ me, go }) {
  const [a] = useLoad(() => api('/analytics'))
  const [m] = useLoad(() => api('/matches'))
  const mine = (m?.suggestions || []).filter((s) => s.involvesMe).slice(0, 3)
  return <>
    <div className="hero"><small>WELCOME, {me.displayName.toUpperCase()}</small><h2>Small acts of support can create a stronger community.</h2><p>Ask for support, offer skills, and get matched with clear reasons behind every suggestion. Messaging opens only after both people agree.</p><button className="primary" onClick={() => go('requests')}>Ask for support</button> <button className="secondary" onClick={() => go('offers')}>Offer a skill</button></div>
    <div className="stats">{a && [['Open requests', a.openRequests], ['Active offers', a.activeOffers], ['Suggested matches', a.suggestions], ['Requests with a match', `${a.coveragePercent}%`]].map(([l, v]) => <div className="stat" key={l}><small>{l}</small><b>{v}</b></div>)}</div>
    <Panel t="Suggested for you" sub="Matches that involve your requests or offers." actions={<button className="secondary" onClick={() => go('matches')}>All matches</button>}>{mine.length ? mine.map((s) => <MatchRow key={s.requestId + s.offerId} s={s} />) : <Empty>No suggestions involve you yet. Post a request or offer to get matched.</Empty>}</Panel>
  </>
}

function Posts({ kind, meta, flash, me }) {
  const isReq = kind === 'requests'
  const [list, reload, err] = useLoad(() => api('/' + kind), [kind])
  const [mine, reloadMine] = useLoad(() => api('/mine'), [kind])
  const [q, setQ] = useState(''), [formErr, setFormErr] = useState('')
  const shown = (list || []).filter((x) => JSON.stringify([x.title, x.description, x.tags, x.skills, x.category, x.author]).toLowerCase().includes(q.toLowerCase()))
  async function submit(e) {
    e.preventDefault(); setFormErr('')
    const f = e.currentTarget, body = Object.fromEntries(new FormData(f))
    try { await api('/' + kind, { method: 'POST', body }); f.reset(); flash(isReq ? 'Request posted.' : 'Offer published.'); reload(); reloadMine() } catch (x) { setFormErr(x.message) }
  }
  async function setStatus(id, status) { try { await api(`/${kind}/${id}`, { method: 'PATCH', body: { status } }); reload(); reloadMine() } catch (x) { flash(x.message) } }
  async function remove(id) { if (!confirm('Delete this post?')) return; await api(`/${kind}/${id}`, { method: 'DELETE' }).catch((x) => flash(x.message)); reload(); reloadMine() }
  const myPosts = mine?.[kind] || []
  return <div className="two">
    <div>
      <Panel t={isReq ? 'Ask for support' : 'Offer a skill'}><form className="stack" onSubmit={submit}>
        <label><span>Title</span><input name="title" required minLength={5} maxLength={100} placeholder={isReq ? 'e.g. Need help with a science project' : 'e.g. Can tutor algebra'} /></label>
        <div className="row2"><label><span>Category</span><select name="category" defaultValue="education">{meta.categories.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
          <label><span>{isReq ? 'When' : 'Availability'}</span><select name={isReq ? 'when' : 'availability'} defaultValue="flexible">{meta.times.map((t) => <option key={t} value={t}>{label(t)}</option>)}</select></label></div>
        <label><span>{isReq ? 'Tags (comma separated)' : 'Skills (comma separated)'}</span><input name={isReq ? 'tags' : 'skills'} required={!isReq} placeholder={isReq ? 'science, school' : 'science, tutoring'} /></label>
        {isReq && <label className="check"><input type="checkbox" name="urgency" value="high" /> <span>This is urgent</span></label>}
        <label><span>Description</span><textarea name="description" maxLength={1000} /></label>
        <Err msg={formErr} /><button className="primary">{isReq ? 'Post request' : 'Publish offer'}</button></form></Panel>
      {myPosts.length > 0 && <Panel t={isReq ? 'My requests' : 'My offers'}>{myPosts.map((x) => <div className="row" key={x.id}><div><b>{x.title}</b><small> · {x.status}</small></div><div className="actions">
        {isReq ? (x.status === 'open' ? <button className="secondary" onClick={() => setStatus(x.id, 'closed')}>Close</button> : x.status === 'closed' && <button className="secondary" onClick={() => setStatus(x.id, 'open')}>Reopen</button>)
          : <button className="secondary" onClick={() => setStatus(x.id, x.status === 'active' ? 'paused' : 'active')}>{x.status === 'active' ? 'Pause' : 'Resume'}</button>}
        <button className="link danger" onClick={() => remove(x.id)}>Delete</button></div></div>)}</Panel>}
    </div>
    <Panel t={isReq ? 'Open requests' : 'Available offers'} actions={<input className="search" aria-label="Search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <Err msg={err} />{shown.map((x) => <article className="item" key={x.id}><b>{x.title}</b>{x.urgency === 'high' && <span className="pill urgent">Urgent</span>}<p>{x.description}</p>
        <small>{label(x.category)} · {(x.tags || x.skills || []).join(' · ')} · {label(x.when || x.availability || 'flexible')} · by {x.author}</small>
        {x.authorId !== me.id && <div><ReportButton type={isReq ? 'request' : 'offer'} id={x.id} flash={flash} /></div>}</article>)}
      {list && !shown.length && <Empty>Nothing here yet.</Empty>}</Panel>
  </div>
}

function MatchRow({ s, children }) {
  return <article className="match"><b className="score" aria-label={`Match score ${s.score} out of 100`}>{s.score}</b><div className="grow">
    <b>{s.request.title}</b><p>{s.offer.author} offers “{s.offer.title}” · requested by {s.request.author}</p>
    <ul className="reasons">{s.reasons.map((r) => <li key={r.text}>+{r.points} {r.text}</li>)}</ul>{children}</div></article>
}

function Matches({ me, flash, go }) {
  const [d, reload, err] = useLoad(() => api('/matches'))
  async function propose(s) { try { await api('/matches', { method: 'POST', body: { requestId: s.requestId, offerId: s.offerId } }); flash('Match proposed. They will be notified.'); reload() } catch (x) { flash(x.message) } }
  async function answer(id, status) { try { await api(`/matches/${id}`, { method: 'PATCH', body: { status } }); flash(`Match ${status}.`); reload() } catch (x) { flash(x.message) } }
  if (!d) return <Err msg={err} />
  const mineSugg = d.suggestions.filter((s) => s.involvesMe), others = d.suggestions.filter((s) => !s.involvesMe)
  return <>
    <Panel t="Your matches" sub="Proposed, accepted, and completed matches that involve you.">{d.mine.length ? d.mine.map((m) => <MatchRow key={m.id} s={m}><div className="actions"><span className={`pill st-${m.status}`}>{label(m.status)}</span>
      {m.awaitingMe && <><button className="primary" onClick={() => answer(m.id, 'accepted')}>Accept</button><button className="secondary" onClick={() => answer(m.id, 'declined')}>Decline</button></>}
      {m.status === 'proposed' && !m.awaitingMe && <small>Waiting for the other person…</small>}
      {m.status === 'accepted' && <><button className="secondary" onClick={() => go('messages')}>Message</button><button className="secondary" onClick={() => answer(m.id, 'completed')}>Mark completed</button></>}</div></MatchRow>) : <Empty>No matches yet.</Empty>}</Panel>
    <Panel t="Suggested for you" sub={`Same category +40 (related +20) · each shared skill +20 (max 40) · urgent +10 · same availability +10. Shown at ${d.threshold}+.`}>{mineSugg.length ? mineSugg.map((s) => <MatchRow key={s.requestId + s.offerId} s={s}><div className="actions"><button className="primary" onClick={() => propose(s)}>Propose match</button></div></MatchRow>) : <Empty>No suggestions involve you right now.</Empty>}</Panel>
    {others.length > 0 && <Panel t="Other matches in the community" sub="Only the people involved can propose these.">{others.slice(0, 10).map((s) => <MatchRow key={s.requestId + s.offerId} s={s} />)}</Panel>}
  </>
}

function Messages({ me, flash, liveMessage }) {
  const [convos, reloadConvos] = useLoad(() => api('/conversations'))
  const [withId, setWithId] = useState(null)
  const [thread, setThread] = useState(null), [text, setText] = useState('')
  const endRef = useRef(null)
  const open = useCallback(async (id) => { setWithId(id); setThread(await api('/conversations/' + id).catch(() => null)); reloadConvos() }, [reloadConvos])
  useEffect(() => { if (liveMessage && liveMessage.senderId === withId) setThread((t) => t && ({ ...t, messages: [...t.messages, liveMessage] })); else if (liveMessage) reloadConvos() }, [liveMessage]) // eslint-disable-line
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [thread])
  async function send(e) { e.preventDefault(); if (!text.trim()) return; try { const m = await api('/conversations/' + withId, { method: 'POST', body: { body: text } }); setThread((t) => ({ ...t, messages: [...t.messages, m] })); setText('') } catch (x) { flash(x.message) } }
  const other = convos?.find((c) => c.user.id === withId)?.user
  return <div className="msgs">
    <Panel t="Conversations" sub="You can message people after a connection or match is accepted.">{convos?.length ? convos.map((c) => <button key={c.user.id} className={`convo ${withId === c.user.id ? 'on' : ''}`} onClick={() => open(c.user.id)}><b>{c.user.displayName}</b><small>{c.user.role}</small>{c.unread > 0 && <span className="badge">{c.unread}</span>}</button>) : <Empty>No conversations yet. Accept a match or connection first.</Empty>}</Panel>
    <Panel t={other ? `Chat with ${other.displayName}` : 'Select a conversation'} sub="Private: only the two of you can see these messages.">
      {thread && <><div className="thread" aria-live="polite">{thread.messages.map((m) => <div key={m.id} className={`bubble ${m.senderId === me.id ? 'mine' : ''}`}><p>{m.body}</p><small>{new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>{m.senderId !== me.id && <ReportButton type="message" id={m.id} flash={flash} />}</div>)}{!thread.messages.length && <Empty>Say hello 👋</Empty>}<div ref={endRef} /></div>
        {thread.canMessage ? <form className="msg" onSubmit={send}><input aria-label="Message" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" /><button className="primary">Send</button></form> : <p className="error">You can't message this person right now.</p>}</>}
    </Panel></div>
}

function People({ me, flash }) {
  const [users] = useLoad(() => api('/users'))
  const [conns, reloadConns] = useLoad(() => api('/connections'))
  const [blocks, reloadBlocks] = useLoad(() => api('/blocks'))
  const statusWith = (id) => conns?.find((c) => c.fromId === id || c.toId === id)
  async function connect(id) { try { await api('/connections', { method: 'POST', body: { userId: id } }); flash('Connection request sent.'); reloadConns() } catch (x) { flash(x.message) } }
  async function answer(id, status) { await api(`/connections/${id}`, { method: 'PATCH', body: { status } }).catch((x) => flash(x.message)); reloadConns() }
  async function block(id) { if (!confirm('Block this person? They will not be able to message or match with you.')) return; await api('/blocks', { method: 'POST', body: { userId: id } }); flash('Blocked.'); reloadBlocks(); reloadConns() }
  async function unblock(id) { await api('/blocks/' + id, { method: 'DELETE' }); reloadBlocks() }
  const incoming = (conns || []).filter((c) => c.incoming && c.status === 'pending')
  return <div className="two">
    <div>{incoming.length > 0 && <Panel t="Connection requests">{incoming.map((c) => <div className="row" key={c.id}><b>{c.fromName}</b><div className="actions"><button className="primary" onClick={() => answer(c.id, 'accepted')}>Accept</button><button className="secondary" onClick={() => answer(c.id, 'declined')}>Decline</button></div></div>)}</Panel>}
      <Panel t="People" sub="Connect to message each other.">{(users || []).filter((u) => u.id !== me.id).map((u) => { const c = statusWith(u.id); return <div className="person" key={u.id}><div><b>{u.displayName}</b><small>{u.role} · {u.skills.join(' • ') || 'no skills listed'}</small><small>{u.bio}</small></div><div className="actions">
        {c ? <span className={`pill st-${c.status}`}>{c.status === 'pending' ? (c.incoming ? 'Wants to connect' : 'Request sent') : label(c.status)}</span> : <button className="secondary" onClick={() => connect(u.id)}>Connect</button>}
        <button className="link" onClick={() => block(u.id)}>Block</button><ReportButton type="user" id={u.id} flash={flash} /></div></div> })}</Panel></div>
    <Panel t="Blocked people">{blocks?.length ? blocks.map((b) => <div className="row" key={b.id}><span>{b.displayName}</span><button className="secondary" onClick={() => unblock(b.id)}>Unblock</button></div>) : <Empty>You haven't blocked anyone.</Empty>}</Panel>
  </div>
}

function Circles({ flash }) {
  const [list, reload] = useLoad(() => api('/circles'))
  async function toggle(c) { await api(`/circles/${c.id}/join`, { method: c.joined ? 'DELETE' : 'POST' }).catch((x) => flash(x.message)); reload() }
  return <div className="two">{(list || []).map((c) => <div className="card pad" key={c.id}><small>{label(c.topic)}</small><h2>{c.name}</h2><p>{c.description}</p><b>{c.members} member{c.members === 1 ? '' : 's'}</b><div><button className={c.joined ? 'secondary' : 'primary'} onClick={() => toggle(c)}>{c.joined ? 'Leave circle' : 'Join circle'}</button></div></div>)}</div>
}
function Events({ flash }) {
  const [list, reload] = useLoad(() => api('/events'))
  async function toggle(e) { await api(`/events/${e.id}/rsvp`, { method: e.attending ? 'DELETE' : 'POST' }).catch((x) => flash(x.message)); flash(e.attending ? 'RSVP removed.' : "You're going!"); reload() }
  return <div className="two">{(list || []).map((e) => <div className="card pad" key={e.id}><small>{new Date(e.startsAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small><h2>{e.name}</h2><p>{e.location} · {e.going} going</p><p>{e.description}</p><button className={e.attending ? 'secondary' : 'primary'} onClick={() => toggle(e)}>{e.attending ? 'Cancel RSVP' : "I'm going"}</button></div>)}</div>
}
function Notifications({ go, onRead }) {
  const [list, reload] = useLoad(() => api('/notifications'))
  useEffect(() => { api('/notifications/read', { method: 'POST' }).then(onRead).catch(() => {}) }, []) // eslint-disable-line
  return <Panel t="Notifications" actions={<button className="secondary" onClick={reload}>Refresh</button>}>{list?.length ? list.map((n) => <div className={`notice ${n.read ? '' : 'unread'}`} key={n.id}><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString()}</small>{n.link && <button className="link" onClick={() => go(n.link)}>Open</button>}</div>) : <Empty>You're all caught up.</Empty>}</Panel>
}
function Analytics() {
  const [a] = useLoad(() => api('/analytics'))
  if (!a) return null
  const max = Math.max(1, ...Object.values(a.byCategory).flatMap((c) => [c.requests, c.offers]))
  return <div className="two">
    <Panel t="Supply and demand by category" sub="Live counts from the database. Dark = requests, light = offers.">
      <div className="bars">{Object.entries(a.byCategory).filter(([, c]) => c.requests || c.offers).map(([k, c]) => <div className="barrow" key={k}><span>{label(k)}</span><div><i className="req" style={{ width: `${(c.requests / max) * 100}%` }} /><i className="off" style={{ width: `${(c.offers / max) * 100}%` }} /></div><small>{c.requests} / {c.offers}</small></div>)}</div></Panel>
    <Panel t="Community health">{[['Members', a.members], ['Open requests', a.openRequests], ['Active offers', a.activeOffers], ['Requests with at least one suggested match', `${a.coveragePercent}%`], ['Accepted matches', a.acceptedMatches], ['Completed matches', a.completedMatches], ['Open reports', a.openReports]].map(([l, v]) => <div className="row" key={l}><span>{l}</span><b>{v}</b></div>)}
      {a.uncoveredRequests.length > 0 && <><h3>Requests still needing a helper</h3>{a.uncoveredRequests.map((r) => <div className="row" key={r.id}><span>{r.title}</span><small>{label(r.category)}</small></div>)}</>}</Panel>
  </div>
}
function Moderation({ flash }) {
  const [list, reload] = useLoad(() => api('/moderation'))
  const [log, reloadLog] = useLoad(() => api('/audit'))
  async function act(id, action) { const note = action === 'dismiss' ? '' : prompt('Optional note for the audit log:') || ''; try { await api('/moderation/' + id, { method: 'POST', body: { action, note } }); flash('Action recorded.'); reload(); reloadLog() } catch (x) { flash(x.message) } }
  return <div className="two">
    <Panel t="Report queue" sub="Every action is written to the audit log and the reporter is notified.">{list?.length ? list.map((r) => <div className="item" key={r.id}><b>{label(r.targetType)}: {r.preview || r.targetId}</b><span className={`pill st-${r.status}`}>{label(r.status)}</span><p>“{r.reason}” — reported by {r.reporter}{r.author ? `; author ${r.author}` : ''}</p>
      {r.status === 'open' ? <div className="actions"><button className="secondary" onClick={() => act(r.id, 'dismiss')}>Dismiss</button>{r.targetType !== 'user' && <button className="secondary" onClick={() => act(r.id, 'remove_content')}>Remove content</button>}<button className="link danger" onClick={() => act(r.id, 'suspend_user')}>Suspend author</button></div> : <small>{r.resolution}</small>}</div>) : <Empty>No reports. 🎉</Empty>}</Panel>
    <Panel t="Audit log">{(log || []).slice(0, 30).map((a) => <div className="row" key={a.id}><span><b>{a.actor || 'system'}</b> {a.action} {a.targetType}</span><small>{new Date(a.createdAt).toLocaleString()}</small></div>)}</Panel>
  </div>
}
function Profile({ me, setMe, flash }) {
  const [err, setErr] = useState('')
  async function save(e) { e.preventDefault(); setErr(''); const body = Object.fromEntries(new FormData(e.currentTarget)); try { setMe((await api('/profile', { method: 'PATCH', body })).user); flash('Profile saved.') } catch (x) { setErr(x.message) } }
  return <div className="two"><Panel t="Your profile" sub="Skills improve your match suggestions."><form className="stack" onSubmit={save}>
    <label><span>Display name</span><input name="displayName" defaultValue={me.displayName} required minLength={2} maxLength={60} /></label>
    <label><span>Skills (comma separated)</span><input name="skills" defaultValue={me.skills.join(', ')} /></label>
    <label><span>Bio</span><textarea name="bio" defaultValue={me.bio} maxLength={300} /></label><Err msg={err} /><button className="primary">Save profile</button></form></Panel>
    <Panel t="Safety"><p>Messaging is only possible after you accept a match or connection. You can block anyone from the People page and report posts, messages, or people. Moderators review every report.</p><p>Username: <b>{me.username}</b> · Role: <b>{me.role}</b></p></Panel></div>
}

createRoot(document.getElementById('root')).render(<App />)
