import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const FALLBACK_COVER = 'https://placehold.co/400x560/e8eee8/31564a?text=Book+Cover'

function App() {
  const [token, setToken] = useState(localStorage.getItem('library_token') || '')
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('library_user') || 'null'))
  const [books, setBooks] = useState([])
  const [borrowings, setBorrowings] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [adminDashboard, setAdminDashboard] = useState(null)
  const [profile, setProfile] = useState({ name: '', email: '', role: '', phone: '', address: '', profile_complete: false })
  const [recommendations, setRecommendations] = useState([])
  const [selectedBook, setSelectedBook] = useState(null)
  const [search, setSearch] = useState('')
  const [genre, setGenre] = useState('All genres')
  const [view, setView] = useState('catalog')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [auth, setAuth] = useState({
  name: '',
  email: '',
  password: '',
  code: '',
  new_password: '',
  confirm_password: ''
})
  const [bookForm, setBookForm] = useState({ title:'', author:'', cover_image:'', genre:'Fiction', isbn:'', total_copies:1, available_copies:1, description:'' })
  const [editingId, setEditingId] = useState(null)

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${API}${path}`, { ...options, headers })
    const data = res.status === 204 ? null : await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.detail || 'Something went wrong. Please try again.')
    return data
  }

  async function loadBooks() {
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (genre !== 'All genres') params.set('genre', genre)
      setBooks(await request(`/books?${params.toString()}`))
    } catch (e) { setNotice(e.message) }
  }
  async function loadPersonal() {
    if (!token) return
    try {
      const [history, member] = await Promise.all([request('/borrowings/me'), request('/dashboard/member')])
      setBorrowings(history); setDashboard(member)
      if (user?.role === 'admin') setAdminDashboard(await request('/dashboard/admin'))
    } catch (e) { setNotice(e.message) }
  }
  useEffect(() => { loadBooks() }, [search, genre])
  useEffect(() => { loadPersonal() }, [token, user?.role])
  useEffect(() => {
    if (token && view === 'profile') loadProfile()
  }, [token, view])
  useEffect(() => {
    if (token) request('/recommendations/me').then(setRecommendations).catch(() => {})
    else setRecommendations([])
  }, [token, borrowings.length])

  async function loadProfile() {
    try { setProfile(await request('/profile')) }
    catch (e) { setNotice(e.message) }
  }
  async function saveProfile(e) {
    e.preventDefault(); setBusy(true); setNotice('')
    try {
      const data = await request('/profile', { method: 'PUT', body: JSON.stringify({
        name: profile.name, phone: profile.phone, address: profile.address
      }) })
      setProfile(data)
      const updatedUser = { ...user, name: data.name }
      setUser(updatedUser)
      localStorage.setItem('library_user', JSON.stringify(updatedUser))
      setNotice('Profile saved successfully. You can now borrow books.')
    } catch (e) { setNotice(e.message) } finally { setBusy(false) }
  }

async function submitAuth(e) {
  e.preventDefault()
  setBusy(true)
  setNotice('')

  try {
    if (authMode === 'reset') {
      await request(
        `/auth/password-reset-request?email=${encodeURIComponent(auth.email)}`,
        { method: 'POST' }
      )

      setNotice('Reset code requested. Check the instructions from your backend.')
      setAuthMode('reset-confirm')

    } else if (authMode === 'reset-confirm') {
      if (auth.new_password !== auth.confirm_password) {
        throw new Error('The passwords do not match.')
      }

      if (auth.new_password.length < 8) {
        throw new Error('Password must be at least 8 characters.')
      }

      await request('/auth/password-reset-confirm', {
        method: 'POST',
        body: JSON.stringify({
          email: auth.email,
          code: auth.code,
          new_password: auth.new_password
        })
      })

      setNotice('Password reset successful. Please sign in.')

      setAuthMode('login')
      setAuth({
        name: '',
        email: auth.email,
        password: '',
        code: '',
        new_password: '',
        confirm_password: ''
      })

    } else if (authMode === 'register') {
      await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: auth.name,
          email: auth.email,
          password: auth.password
        })
      })

      setNotice('Account created. Please sign in.')
      setAuthMode('login')

    } else {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: auth.email,
          password: auth.password
        })
      })

      localStorage.setItem('library_token', data.access_token)
      localStorage.setItem('library_user', JSON.stringify(data.user))
      setToken(data.access_token)
      setUser(data.user)
      setNotice(`Welcome, ${data.user.name}.`)
    }

  } catch (e) {
    setNotice(e.message || 'Something went wrong. Please try again.')
  } finally {
    setBusy(false)
  }
}

 
  function logout() {
    localStorage.removeItem('library_token'); localStorage.removeItem('library_user')
    setToken(''); setUser(null); setBorrowings([]); setDashboard(null); setProfile({name:'',email:'',role:'',phone:'',address:'',profile_complete:false}); setRecommendations([]); setView('catalog'); setNotice('You have signed out.')
  }
  async function borrow(book) {
    setBusy(true); setNotice('')
    try { await request(`/borrowings/${book.id}`, { method:'POST' }); setNotice(`You borrowed "${book.title}". It is due in 14 days.`); await loadBooks(); await loadPersonal() }
    catch(e) { setNotice(e.message) } finally { setBusy(false) }
  }
  async function returnBook(row) {
    setBusy(true); setNotice('')
    try { await request(`/borrowings/${row.id}/return`, { method:'POST' }); setNotice(`"${row.book_title}" has been returned.`); await loadBooks(); await loadPersonal() }
    catch(e) { setNotice(e.message) } finally { setBusy(false) }
  }
  function startEdit(book) {
    setEditingId(book.id)
    setBookForm({ ...book })
    setView('admin-books')
  }
  async function saveBook(e) {
    e.preventDefault(); setBusy(true); setNotice('')
    const payload = { ...bookForm, total_copies:Number(bookForm.total_copies), available_copies:Number(bookForm.available_copies), cover_image:bookForm.cover_image || null }
    try {
      await request(editingId ? `/books/${editingId}` : '/books', { method:editingId ? 'PUT':'POST', body:JSON.stringify(payload) })
      setNotice(editingId ? 'Book updated.' : 'Book added.')
      setEditingId(null); setBookForm({ title:'', author:'', cover_image:'', genre:'Fiction', isbn:'', total_copies:1, available_copies:1, description:'' })
      await loadBooks(); if (user?.role === 'admin') setAdminDashboard(await request('/dashboard/admin'))
    } catch(e) { setNotice(e.message) } finally { setBusy(false) }
  }
  const genres = useMemo(() => ['All genres', ...new Set(books.map(b => b.genre).filter(Boolean))], [books])
  const active = borrowings.filter(b => b.status !== 'Returned')
  const returned = borrowings.filter(b => b.status === 'Returned')
  const fmt = date => new Date(date).toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => {e.preventDefault();setView('catalog')}}><span className="brand-mark">L</span><span>leaf <b>&</b> ledger<small>THE COMMUNITY LIBRARY</small></span></a>
      <nav>
        <button className={view==='catalog'?'nav-active':''} onClick={()=>setView('catalog')}>Discover</button>
        {token && <button className={view==='dashboard'?'nav-active':''} onClick={()=>setView('dashboard')}>My library</button>}
        {token && <button className={view==='profile'?'nav-active':''} onClick={()=>setView('profile')}>Profile</button>}
        {user?.role==='admin' && <button className={view==='admin-books'?'nav-active':''} onClick={()=>setView('admin-books')}>Manage books</button>}
      </nav>
      <div className="account">
        {user ? <><span className="user-chip">{user.name.split(' ')[0]} <small>{user.role}</small></span><button className="button button-ghost" onClick={logout}>Sign out</button></> : <button className="button button-dark" onClick={()=>setView('account')}>Sign in</button>}
      </div>
    </header>
    {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss message">×</button></div>}

    {view==='account' && <main className="auth-layout">
      <div className="auth-art"><span className="eyebrow light">A LITTLE SPACE TO GROW</span><h1>Find your next<br/><em>favorite chapter.</em></h1><p>Good books make room for new ideas, fresh perspectives, and a little everyday wonder.</p><div className="art-books"><span></span><span></span><span></span><span></span></div></div>
      <form className="auth-card" onSubmit={submitAuth}>
      
<span className="eyebrow">
  {authMode === 'register'
    ? 'BECOME A MEMBER'
    : authMode === 'reset' || authMode === 'reset-confirm'
      ? 'ACCOUNT RECOVERY'
      : 'WELCOME BACK'}
</span>

<h2>
  {authMode === 'register'
    ? 'Join the library'
    : authMode === 'reset'
      ? 'Reset your password'
      : authMode === 'reset-confirm'
        ? 'Choose a new password'
        : 'Sign in to your library'}
</h2>

<p className="muted">
  {authMode === 'reset-confirm'
    ? 'Enter the reset token provided by your backend and choose a new password.'
    : authMode === 'reset'
      ? 'Enter your registered email to request password-reset instructions.'
      : authMode === 'register'
        ? 'Create an account to borrow books and track your reading.'
        : 'Your next great read is waiting.'}
</p>

{authMode === 'register' && (
  <label>
    Full name
    <input
      required
      value={auth.name}
      onChange={e => setAuth({ ...auth, name: e.target.value })}
      placeholder="Your name"
    />
  </label>
)}

{authMode !== 'reset-confirm' && (
  <label>
    Email address
    <input
      required
      type="email"
      value={auth.email}
      onChange={e => setAuth({ ...auth, email: e.target.value })}
      placeholder="you@example.com"
    />
  </label>
)}

{authMode === 'reset-confirm' && (
  <>
    <label>
  Email address
  <input
    required
    type="email"
    value={auth.email}
    onChange={e => setAuth({ ...auth, email: e.target.value })}
  />
</label>

<label>
  Reset code
  <input
    required
    value={auth.code || ''}
    onChange={e => setAuth({ ...auth, code: e.target.value })}
    placeholder="Enter your reset code"
  />
</label>

    <label>
      New password
      <input
        required
        minLength={8}
        type="password"
        value={auth.new_password}
        onChange={e => setAuth({ ...auth, new_password: e.target.value })}
        placeholder="At least 8 characters"
      />
    </label>

    <label>
      Confirm new password
      <input
        required
        minLength={8}
        type="password"
        value={auth.confirm_password}
        onChange={e => setAuth({ ...auth, confirm_password: e.target.value })}
        placeholder="Enter the password again"
      />
    </label>
  </>
)}

{authMode !== 'reset' && authMode !== 'reset-confirm' && (
  <label>
    Password
    <input
      required
      minLength={8}
      type="password"
      value={auth.password}
      onChange={e => setAuth({ ...auth, password: e.target.value })}
      placeholder="At least 8 characters"
    />
  </label>
)}

<button disabled={busy} className="button button-dark button-wide">
  {busy
    ? 'Please wait…'
    : authMode === 'register'
      ? 'Create account'
      : authMode === 'reset'
        ? 'Request reset'
        : authMode === 'reset-confirm'
          ? 'Update password'
          : 'Sign in'}
</button>

<div className="auth-links">
  {authMode === 'login' ? (
    <>
      <button type="button" onClick={() => setAuthMode('register')}>
        Create an account
      </button>
      <button type="button" onClick={() => setAuthMode('reset')}>
        Forgot password?
      </button>
    </>
  ) : (
    <button type="button" onClick={() => setAuthMode('login')}>
      Back to sign in
    </button>
  )}
</div>

      </form>
    </main>}

    {view==='catalog' && <main>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow light">YOUR NEXT CHAPTER STARTS HERE</span><h1>Stories worth<br/>staying <em>for.</em></h1><p>Explore the shelves, find a new perspective, and take a little inspiration home.</p><button className="button button-light" onClick={()=>document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'})}>Explore the collection <span>↘</span></button></div>
        <div className="hero-art"><div className="sun"></div><div className="book-stack"><div className="book book-one"><span>THE ART OF<br/>SLOW LIVING</span></div><div className="book book-two"><span>WILD<br/>PLACES</span></div><div className="book book-three"><span>NOTES FROM<br/>THE GARDEN</span></div></div><div className="hero-caption">A good book opens a new world.</div></div>
      </section>
      <section id="catalog" className="catalog-section">
        <div className="section-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Find your next read.</h2><p>Thoughtfully collected. Ready to be discovered.</p></div><div className="collection-count"><strong>{books.length.toString().padStart(2,'0')}</strong><span>BOOKS TO EXPLORE</span></div></div>
        <div className="filters"><div className="search-box"><span>⌕</span><input aria-label="Search by title or author" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by title or author"/></div><select aria-label="Filter by genre" value={genre} onChange={e=>setGenre(e.target.value)}>{genres.map(g=><option key={g}>{g}</option>)}</select></div>
        {books.length===0 ? <div className="empty"><div className="empty-icon">✳</div><h3>No books found just yet</h3><p>Try another search, or sign in as an administrator to add books.</p></div> : <div className="book-grid">{books.map(book=><article className="book-card" key={book.id}><div className="cover-wrap"><img src={book.cover_image || FALLBACK_COVER} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=FALLBACK_COVER}} alt={`Cover of ${book.title}`}/><span className="genre-tag">{book.genre}</span></div><div className="book-info"><h3>{book.title}</h3><p className="book-author">by {book.author}</p><p className="book-description">{book.description || 'A story waiting to be discovered.'}</p><button className="button button-ghost button-small" onClick={()=>setSelectedBook(book)}>View details</button><div className="book-card-bottom"><span className={book.available_copies>0?'available':'unavailable'}>{book.available_copies>0?`${book.available_copies} available`:'Currently unavailable'}</span><button disabled={!token || busy || book.available_copies===0} title={!token?'Sign in to borrow':book.available_copies===0?'No copies available':'Borrow this book'} className="borrow-button" onClick={()=>borrow(book)}>{!token?'Sign in':book.available_copies>0?'Borrow +':'Unavailable'}</button></div></div></article>)}</div>}
        {token && <section className="panel recommendations-panel"><div className="panel-heading"><div><span className="eyebrow">PICKED FOR YOU</span><h3>Recommended reads</h3><p>Suggestions based on your borrowing history and available books.</p></div></div>{recommendations.length===0?<p className="muted">Borrow or explore a few books to personalize recommendations.</p>:<div className="recommendation-list">{recommendations.map(book=><button key={book.id} className="recommendation-item" onClick={()=>setSelectedBook(book)}><strong>{book.title}</strong><span>{book.author} · {book.genre}</span></button>)}</div>}</section>}
      </section>
    </main>}

    {view==='profile' && <main className="dashboard-page"><div className="section-heading"><div><span className="eyebrow">ACCOUNT SETTINGS</span><h2>My profile.</h2><p>Complete your profile before borrowing books.</p></div></div>
      <section className="panel profile-panel"><div className="profile-status"><strong>{profile.profile_complete?'Profile complete':'Profile incomplete'}</strong><span>{profile.profile_complete?'You can borrow available books.':'Add your phone number and address to enable borrowing.'}</span></div>
      <form className="book-form" onSubmit={saveProfile}>
        <label>Full name<input required maxLength="120" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})} /></label>
        <label>Email address<input value={profile.email} readOnly /></label>
        <label>Account role<input value={profile.role} readOnly /></label>
        <label>Phone number<input required minLength="10" maxLength="20" value={profile.phone||''} onChange={e=>setProfile({...profile,phone:e.target.value})} placeholder="At least 10 characters"/></label>
        <label>Address<textarea required minLength="5" maxLength="500" rows="3" value={profile.address||''} onChange={e=>setProfile({...profile,address:e.target.value})} placeholder="Your address"/></label>
        <button className="button button-dark" disabled={busy}>{busy?'Saving…':'Save profile'}</button>
      </form></section>
    </main>}

    {selectedBook && <div className="modal-backdrop" role="presentation" onClick={()=>setSelectedBook(null)}><section className="book-detail-modal" role="dialog" aria-modal="true" aria-label={`${selectedBook.title} details`} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedBook(null)} aria-label="Close details">×</button><img src={selectedBook.cover_image||FALLBACK_COVER} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=FALLBACK_COVER}} alt={`Cover of ${selectedBook.title}`}/><div><span className="eyebrow">{selectedBook.genre}</span><h2>{selectedBook.title}</h2><p className="book-author">by {selectedBook.author}</p><p>{selectedBook.description||'A story waiting to be discovered.'}</p><p><strong>ISBN:</strong> {selectedBook.isbn}</p><p><strong>Copies:</strong> {selectedBook.available_copies} available of {selectedBook.total_copies}</p><button className="button button-dark" disabled={!token||busy||selectedBook.available_copies===0} onClick={()=>{setSelectedBook(null);borrow(selectedBook)}}>{selectedBook.available_copies>0?'Borrow book':'Unavailable'}</button></div></section></div>}

    {view==='dashboard' && <main className="dashboard-page"><div className="section-heading"><div><span className="eyebrow">YOUR READING SPACE</span><h2>My library.</h2><p>Keep track of the stories you're taking home.</p></div></div>
      <div className="stat-grid"><div className="stat-card"><span>Currently borrowed</span><strong>{dashboard?.currently_borrowed ?? active.length}</strong><small>of 3 books maximum</small></div><div className="stat-card"><span>Overdue</span><strong className={dashboard?.overdue?'text-danger':''}>{dashboard?.overdue ?? active.filter(b=>b.status==='Overdue').length}</strong><small>Return as soon as possible</small></div><div className="stat-card"><span>Returned books</span><strong>{returned.length}</strong><small>In your borrowing history</small></div></div>
      <section className="panel"><div className="panel-heading"><div><h3>Currently on your shelf</h3><p>Remember to return books by their due dates.</p></div></div>{active.length===0?<div className="empty compact"><h3>No active borrowings</h3><p>Visit Discover to find your next read.</p></div>:<div className="table-wrap"><table><thead><tr><th>Book</th><th>Borrowed</th><th>Due date</th><th>Status</th><th></th></tr></thead><tbody>{active.map(row=><tr key={row.id}><td><strong>{row.book_title}</strong><small>{row.author}</small></td><td>{fmt(row.borrowed_at)}</td><td>{fmt(row.due_at)}</td><td><span className={`status ${row.status.toLowerCase()}`}>{row.status}</span></td><td><button className="button button-small button-dark" onClick={()=>returnBook(row)} disabled={busy}>Return</button></td></tr>)}</tbody></table></div>}</section>
      <section className="panel"><div className="panel-heading"><div><h3>Borrowing history</h3><p>Your previous library visits, all in one place.</p></div></div>{borrowings.length===0?<p className="muted pad">Your borrowing history will appear here.</p>:<div className="table-wrap"><table><thead><tr><th>Book</th><th>Borrowed</th><th>Due date</th><th>Returned</th><th>Status</th></tr></thead><tbody>{borrowings.map(row=><tr key={row.id}><td><strong>{row.book_title}</strong><small>{row.author}</small></td><td>{fmt(row.borrowed_at)}</td><td>{fmt(row.due_at)}</td><td>{row.returned_at?fmt(row.returned_at):'—'}</td><td><span className={`status ${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}</tbody></table></div>}</section>
      {user?.role==='admin' && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ADMIN OVERVIEW</span><h3>Library at a glance</h3></div><button className="button button-ghost" onClick={()=>setView('admin-books')}>Manage books</button></div><div className="stat-grid admin-stats"><div className="stat-card"><span>Total members</span><strong>{adminDashboard?.total_members ?? '—'}</strong></div><div className="stat-card"><span>Book titles</span><strong>{adminDashboard?.total_books ?? '—'}</strong></div><div className="stat-card"><span>Active loans</span><strong>{adminDashboard?.active_borrowings ?? '—'}</strong></div><div className="stat-card"><span>Overdue loans</span><strong>{adminDashboard?.overdue_borrowings ?? '—'}</strong></div></div>{adminDashboard?.low_availability?.length>0&&<p className="pad">Low availability: {adminDashboard.low_availability.map(b=>`${b.title} (${b.available_copies} left)`).join(' · ')}</p>}</section>}
    </main>}

    {view==='admin-books' && <main className="dashboard-page"><div className="section-heading"><div><span className="eyebrow">ADMINISTRATION</span><h2>Manage the shelves.</h2><p>Add new books or update existing catalog entries.</p></div></div>
      {user?.role!=='admin' ? <div className="empty"><h3>Administrator access required</h3><p>Sign in with an administrator account to manage books.</p></div> : <div className="admin-layout"><form className="panel book-form" onSubmit={saveBook}><h3>{editingId?'Edit book':'Add a book'}</h3><label>Title<input required value={bookForm.title} onChange={e=>setBookForm({...bookForm,title:e.target.value})}/></label><label>Author<input required value={bookForm.author} onChange={e=>setBookForm({...bookForm,author:e.target.value})}/></label><div className="form-row"><label>Genre<input required value={bookForm.genre} onChange={e=>setBookForm({...bookForm,genre:e.target.value})}/></label><label>ISBN<input required value={bookForm.isbn} onChange={e=>setBookForm({...bookForm,isbn:e.target.value})}/></label></div><label>Cover image URL (optional)<input type="url" value={bookForm.cover_image||''} onChange={e=>setBookForm({...bookForm,cover_image:e.target.value})}/></label><div className="form-row"><label>Total copies<input required type="number" min="0" value={bookForm.total_copies} onChange={e=>setBookForm({...bookForm,total_copies:e.target.value})}/></label><label>Available copies<input required type="number" min="0" value={bookForm.available_copies} onChange={e=>setBookForm({...bookForm,available_copies:e.target.value})}/></label></div><label>Description<textarea rows="3" value={bookForm.description} onChange={e=>setBookForm({...bookForm,description:e.target.value})}/></label><div className="form-actions"><button className="button button-dark" disabled={busy}>{busy?'Saving…':editingId?'Save changes':'Add book'}</button>{editingId&&<button type="button" className="button button-ghost" onClick={()=>{setEditingId(null);setBookForm({title:'',author:'',cover_image:'',genre:'Fiction',isbn:'',total_copies:1,available_copies:1,description:''})}}>Cancel</button>}</div></form><section className="panel"><h3>Catalog inventory</h3><div className="inventory-list">{books.map(b=><div className="inventory-row" key={b.id}><img src={b.cover_image||FALLBACK_COVER} onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src=FALLBACK_COVER}} alt=""/><div><strong>{b.title}</strong><small>{b.author} · {b.available_copies}/{b.total_copies} available</small></div><button className="button button-small button-ghost" onClick={()=>startEdit(b)}>Edit</button></div>)}</div></section></div>}
    </main>}

    <footer><div className="footer-brand">leaf <b>&</b> ledger</div><p>A little space to grow. A lifetime of stories to discover.</p><span>LIBRARY MANAGEMENT SYSTEM · ASSESSMENT PROJECT</span></footer>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
