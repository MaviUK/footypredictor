import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './dailyGame.css'
import './minimalistTheme.css'

const RESULT_GROUPS = [
  ['H', 'Home win'],
  ['D', 'Draw'],
  ['A', 'Away win'],
]

const TABLE_COLUMNS = [
  ['played', 'P'],
  ['won', 'W'],
  ['drawn', 'D'],
  ['lost', 'L'],
  ['goalsFor', 'GF'],
  ['goalsAgainst', 'GA'],
  ['goalDifference', 'GD'],
  ['points', 'PTS'],
]

function App() {
  const [session, setSession] = useState(null)
  const [game, setGame] = useState(null)
  const [clubProfile, setClubProfile] = useState(null)
  const [clubForm, setClubForm] = useState({ clubName: '', badgeUrl: '' })
  const [viewingUserId, setViewingUserId] = useState(null)
  const [explorer, setExplorer] = useState(null)
  const [availableLeagues, setAvailableLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOptionKey, setSelectedOptionKey] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState('sign-in')
  const [view, setView] = useState('game')
  const [authForm, setAuthForm] = useState({ email: '', username: '', country: '', competition: '', leagueName: '', password: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    loadAvailableLeagues()

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      loadGame(session)
      loadClubProfile(session, session.user.id)
      loadExplorer(session)
    } else {
      setGame(null)
      setClubProfile(null)
      setExplorer(null)
      setViewingUserId(null)
      setView('game')
    }
  }, [session])

  async function loadAvailableLeagues() {
    const { data, error: leaguesError } = await supabase
      .from('seasons')
      .select('country, competition, display_name')
      .eq('is_complete', true)
      .order('country')
      .order('competition')

    if (leaguesError) {
      setError(leaguesError.message)
      return
    }

    const seen = new Set()
    const leagues = []

    for (const season of data || []) {
      const country = season.country || 'England'
      const competition = season.competition || 'E0'
      const leagueName = leagueNameForCompetition(competition, season.display_name)
      const key = `${country}:${competition}`
      if (seen.has(key)) continue
      seen.add(key)
      leagues.push({ country, competition, leagueName })
    }

    setAvailableLeagues(leagues)

    if (leagues.length) {
      setAuthForm((current) => current.competition ? current : { ...current, country: leagues[0].country, competition: leagues[0].competition, leagueName: leagues[0].leagueName })
    }
  }

  async function loadGame(activeSession = session) {
    if (!activeSession?.access_token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/.netlify/functions/getDailyGame', { headers: { Authorization: `Bearer ${activeSession.access_token}` } })
      const text = await res.text()
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch { data = { error: text || 'Could not load today\'s game' } }
      if (!res.ok) throw new Error(data.error || data.message || 'Could not load today\'s game')
      setGame(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadExplorer(activeSession = session) {
    if (!activeSession?.access_token) return
    setExplorerLoading(true)
    try {
      const res = await fetch('/.netlify/functions/getLeagueExplorer', { headers: { Authorization: `Bearer ${activeSession.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load leagues')
      setExplorer(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setExplorerLoading(false)
    }
  }

  async function loadClubProfile(activeSession = session, userId = activeSession?.user?.id) {
    if (!activeSession?.access_token) return
    setProfileLoading(true)
    setError('')
    try {
      const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : ''
      const res = await fetch(`/.netlify/functions/getClubProfile${suffix}`, { headers: { Authorization: `Bearer ${activeSession.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load club profile')
      setClubProfile(data)
      setViewingUserId(data.profile?.userId || userId)
      setClubForm({ clubName: data.profile?.clubName || '', badgeUrl: data.profile?.badgeUrl || '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  async function openClubProfile(userId) {
    if (!session?.access_token || !userId) return
    setView('profile')
    await loadClubProfile(session, userId)
  }

  async function openOwnClubProfile() {
    if (!session?.user?.id) return
    await openClubProfile(session.user.id)
  }

  async function openExplore() {
    setView('explore')
    await loadExplorer()
  }

  async function saveClubProfile(nextValues = clubForm) {
    if (!session?.access_token) return
    if (clubProfile?.profile && clubProfile.profile.isOwnProfile === false) return
    setProfileLoading(true)
    setError('')
    try {
      const res = await fetch('/.netlify/functions/updateClubProfile', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(nextValues) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save club profile')
      await loadClubProfile(session, session.user.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleAuth(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const email = authForm.email.trim()
    const password = authForm.password
    try {
      const payload = authMode === 'sign-up' ? { email, password, options: { data: { username: authForm.username, country: authForm.country, competition: authForm.competition, leagueName: authForm.leagueName } } } : { email, password }
      const { data, error: authError } = authMode === 'sign-up'
        ? await supabase.auth.signUp(payload)
        : await supabase.auth.signInWithPassword(payload)
      if (authError) throw authError
      if (data.session) setSession(data.session)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  async function submitPrediction(option) {
    if (!game?.currentRound || !session?.access_token || submitting) return
    const optionKey = `${option.homeGoals}-${option.awayGoals}`
    setSelectedOptionKey(optionKey)
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/.netlify/functions/submitPrediction', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyGameFixtureId: game.currentRound.dailyGameFixtureId, predictedHomeGoals: option.homeGoals, predictedAwayGoals: option.awayGoals }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit prediction')
      setLastResult(data)
      await loadGame(session)
      await loadClubProfile(session, session.user.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
      setSelectedOptionKey('')
    }
  }

  if (loading && !game && !session) return <Shell><section className="hero"><p className="eyebrow">Loading</p><h1>Daily Football Oracle</h1></section></Shell>

  if (!session) {
    return (
      <Shell>
        <section className="hero auth-panel">
          <div>
            <p className="eyebrow">Prediction League</p>
            <h1>Daily Football Oracle</h1>
            <p>Pick historic football scores, climb your league, and build your club profile.</p>
          </div>
          <form onSubmit={handleAuth}>
            <label>Email<input type="email" required value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
            {authMode === 'sign-up' && <label>Username<input required value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} /></label>}
            {authMode === 'sign-up' && <label>League<select value={`${authForm.country}:${authForm.competition}`} onChange={(event) => {
              const [country, competition] = event.target.value.split(':')
              const selected = availableLeagues.find((league) => league.country === country && league.competition === competition)
              setAuthForm({ ...authForm, country, competition, leagueName: selected?.leagueName || '' })
            }}>{availableLeagues.map((league) => <option key={`${league.country}:${league.competition}`} value={`${league.country}:${league.competition}`}>{league.country} - {league.leagueName}</option>)}</select></label>}
            <label>Password<input type="password" required minLength={6} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
            <button type="submit" disabled={loading}>{authMode === 'sign-up' ? 'Create club' : 'Sign in'}</button>
            <button type="button" className="link-button" onClick={() => setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up')}>{authMode === 'sign-up' ? 'Already have an account?' : 'Need an account?'}</button>
          </form>
        </section>
        {error && <p className="alert">{error}</p>}
      </Shell>
    )
  }

  return (
    <Shell>
      {error && <p className="alert">{error}</p>}
      {lastResult && <ResultNotice result={lastResult} />}
      <TopBar profile={clubProfile?.profile} signOut={signOut} openOwnClubProfile={openOwnClubProfile} openExplore={openExplore} setView={setView} />
      {view === 'profile' && <ClubProfilePage profile={clubProfile} form={clubForm} setForm={setClubForm} saveClubProfile={saveClubProfile} loading={profileLoading} isOwn={viewingUserId === session.user.id} />}
      {view === 'explore' && <ExplorerPage explorer={explorer} loading={explorerLoading} openClubProfile={openClubProfile} />}
      {view === 'game' && <GamePage game={game} loading={loading} submitPrediction={submitPrediction} submitting={submitting} selectedOptionKey={selectedOptionKey} />}
    </Shell>
  )
}

function Shell({ children }) {
  return <main className="app-shell">{children}</main>
}

function TopBar({ profile, signOut, openOwnClubProfile, openExplore, setView }) {
  return <nav className="topbar app-nav"><button className="club-name-button" onClick={openOwnClubProfile}>{profile?.clubName || profile?.username || 'My club'}</button><div className="topbar-actions"><button onClick={() => window.dispatchEvent(new CustomEvent('openSeasonArchive'))}>Archive</button><button onClick={() => setView('game')}>Game</button><button onClick={openExplore}>Explore</button><button onClick={signOut}>Sign out</button></div></nav>
}

function ResultNotice({ result }) {
  const code = result.points === 3 ? 'W' : result.points === 1 ? 'D' : 'L'
  const label = result.points === 3 ? 'Spot on' : result.points === 1 ? 'Result right' : 'Wrong'
  return <div className={`result-notice outcome-${code}`}><strong>{code}</strong><span>{label}: +{result.points} pts</span><small>Your pick {result.predictedHomeGoals}-{result.predictedAwayGoals} · Actual {result.actualHomeGoals}-{result.actualAwayGoals}</small></div>
}

function GamePage({ game, loading, submitPrediction, submitting, selectedOptionKey }) {
  if (loading && !game) return <section className="panel"><p className="eyebrow">Loading game</p></section>
  if (!game) return <section className="panel"><p>No game loaded.</p></section>
  return <><section className="hero compact-hero"><p className="eyebrow">Daily Challenge</p><h1>{game.country} Football Oracle</h1><p>Complete your season, then compare your club against your tier.</p></section><p className="country-badge">League: {game.country} - {game.leagueName} · {game.tier.name}</p><section className="panel user-results"><div><p className="eyebrow">Your results</p><p>W = spot on 3pts · D = result 1pt · L = wrong 0pts</p></div><div className="user-result-chips">{game.resultHistory?.map((result) => <span key={result.roundNumber} className={`user-result-chip outcome-${result.code}`} title={`${result.label} +${result.points}`}>{result.code}</span>)}</div></section><div className="game-layout"><FixturePanel game={game} submitPrediction={submitPrediction} submitting={submitting} selectedOptionKey={selectedOptionKey} /><ScorePanel game={game} /></div></>
}

function FixturePanel({ game, submitPrediction, submitting, selectedOptionKey }) {
  if (game.completed) return <section className="panel"><p className="eyebrow">Season Complete</p><h2>All predictions submitted.</h2><p className="muted">Come back after the next season reset.</p></section>
  const round = game.currentRound
  if (!round) return <section className="panel"><p>No fixture available.</p></section>
  const grouped = RESULT_GROUPS.map(([result, label]) => ({ result, label, options: round.options.filter((option) => option.result === result) }))
  return <section className="panel fixture-panel"><div className="round-meta"><span>Round {round.roundNumber}/{game.totalRounds}</span><strong>{seasonDisplay(game.season)}</strong></div><p className="fixture-date">{formatDate(round.fixtureDate)}</p><div className="match-title compact-match-title"><h2>{round.home.name}</h2><span>v</span><h2>{round.away.name}</h2></div><div className="scoreboard compact-scoreboard"><TeamCard label="Home" team={round.home} /><TeamCard label="Away" team={round.away} /></div><div className="option-grid result-columns">{grouped.map((group) => <div className="result-column" key={group.result}><span className="result-column-label">{group.label}</span>{group.options.map((option) => { const key = `${option.homeGoals}-${option.awayGoals}`; return <button key={key} className={selectedOptionKey === key ? 'selected-choice' : ''} disabled={submitting} onClick={() => submitPrediction(option)}><strong>{option.homeGoals}-{option.awayGoals}</strong><small>{option.result}</small></button> })}</div>)}</div></section>
}

function TeamCard({ label, team }) {
  return <article className="team-card compact-team-card"><div className="team-heading"><span>{label}</span><h3>{team.name}</h3></div><LeagueStrip snapshot={team.snapshot} /><FormArea snapshot={team.snapshot} label={label} /></article>
}

function LeagueStrip({ snapshot = {} }) {
  const labels = [['position', 'POS'], ...TABLE_COLUMNS]
  return <div className="league-strip compact-league-strip"><div className="league-labels">{labels.map(([, label]) => <span key={label}>{label}</span>)}</div><div className="league-values">{labels.map(([key]) => key === 'position' ? <strong key={key}>{snapshot[key] ?? '-'}</strong> : <span key={key}>{snapshot[key] ?? '-'}</span>)}</div></div>
}

function FormArea({ snapshot = {}, label }) {
  return <div className="form-area compact-form-area"><FormStrip title="Form" value={snapshot.form} /><FormStrip title={label} value={snapshot.venueForm} /></div>
}

function FormStrip({ title, value = '' }) {
  const items = value ? value.split('').slice(-5) : []
  return <div className="form-strip-wrap"><span className="form-label">{title}</span><div className="form-strip">{items.length ? items.map((item, index) => <span key={`${item}-${index}`} className={`form-chip ${item === 'W' ? 'win' : item === 'D' ? 'draw' : 'loss'}`}>{item}</span>) : <span className="form-empty">—</span>}</div></div>
}

function ScorePanel({ game }) {
  return <aside className="score-panel compact-score-panel"><section className="panel"><p className="eyebrow">Your score</p><h2>{game.userScore.totalPoints}</h2><p>{game.userScore.correctScores} exact · {game.userScore.correctResults} results</p></section><section className="panel daily-table-panel"><p className="eyebrow">Live table</p><div className="daily-table"><div className="daily-table-row daily-table-head"><span>#</span><strong>Club</strong><span>P</span><span>W</span><span>D</span><span>L</span><span>Pts</span></div>{game.leaderboard.map((row, index) => <button type="button" className="daily-table-row daily-table-button" key={row.userId} onClick={() => window.dispatchEvent(new CustomEvent('openClubFromTable', { detail: row.userId }))}><span>{index + 1}</span><strong>{row.displayName}</strong><span>{row.played}</span><span>{row.wins}</span><span>{row.draws}</span><span>{row.losses}</span><span>{row.totalPoints}</span></button>)}</div></section></aside>
}

function ClubProfilePage({ profile, form, setForm, saveClubProfile, loading, isOwn }) {
  if (!profile) return <section className="panel"><p>Loading profile...</p></section>
  const { profile: club, stats, seasons } = profile
  return <div className="profile-stack"><section className="panel club-profile-hero"><Badge profile={club} /><div><p className="eyebrow">Club profile</p><h2>{club.clubName || club.username || 'Unnamed club'}</h2><p className="muted">{club.country} · {club.leagueName} · {club.tierName}</p></div></section>{isOwn && <section className="panel club-editor"><label>Club name<input value={form.clubName} onChange={(event) => setForm({ ...form, clubName: event.target.value })} placeholder="Your club name" /></label><label>Badge image URL<input value={form.badgeUrl} onChange={(event) => setForm({ ...form, badgeUrl: event.target.value })} placeholder="https://..." /></label><button disabled={loading} onClick={() => saveClubProfile()}>Save</button><button disabled={loading} onClick={() => saveClubProfile({ clubName: '', badgeUrl: '' })}>Clear</button></section>}<section className="stats-grid"><Stat label="Played" value={stats.played} /><Stat label="Points" value={stats.totalPoints} /><Stat label="Exact" value={stats.correctScores} /><Stat label="Results" value={stats.correctResults} /></section><section className="best-worst-grid"><SeasonSummary title="Best Season" season={profile.bestSeason} /><SeasonSummary title="Worst Season" season={profile.worstSeason} /></section><article className="panel daily-table-panel compact-history-panel"><p className="eyebrow">Season history</p><div className="profile-history-table"><div className="profile-history-row profile-history-head"><span>Pos</span><span>Season</span><span>P</span><span>W</span><span>D</span><span>L</span><span>Pts</span></div>{seasons.length === 0 && <p className="muted">No completed picks yet.</p>}{seasons.map((season) => <div className="profile-history-row" key={season.id}><strong>{positionText(season)}</strong><span>{compactSeasonLabel(season.label)}</span><span>{displayValue(season.played)}</span><span>{displayValue(season.wins)}</span><span>{displayValue(season.draws)}</span><span>{displayValue(season.losses)}</span><span>{displayValue(season.points)}</span></div>)}</div></article></div>
}

function Badge({ profile }) {
  return <div className="club-badge">{profile.badgeUrl ? <img src={profile.badgeUrl} alt="" /> : (profile.clubName || profile.username || '?').slice(0, 2).toUpperCase()}</div>
}

function Stat({ label, value }) {
  return <article className="stat-card"><span>{label}</span><strong>{displayValue(value)}</strong></article>
}

function SeasonSummary({ title, season }) {
  return <article className="season-summary"><p className="eyebrow">{title}</p>{season ? <><h3>{compactSeasonLabel(season.label)}</h3><p>Pos {positionText(season)} · {displayValue(season.points)} pts</p></> : <p className="muted">No season yet</p>}</article>
}

function ExplorerPage({ explorer, loading, openClubProfile }) {
  if (loading && !explorer) return <section className="panel"><p>Loading leagues...</p></section>
  const leagues = explorer?.leagues || []
  return <div className="profile-stack"><section className="panel"><p className="eyebrow">Explore</p><h2>League pyramid</h2><p className="muted">Browse clubs by league and tier.</p></section>{leagues.map((league) => <section className="panel" key={`${league.country}:${league.competition}`}><div className="explore-league-head"><div><p className="eyebrow">{league.country}</p><h3>{league.leagueName}</h3></div><span>{league.players} clubs</span></div>{league.tiers.map((tier) => <div className="explore-tier" key={tier.level}><div className="explore-tier-title"><span>{tier.name}</span><small>{tier.players}/{tier.size}</small></div><div className="explore-club-grid">{tier.clubs.map((club) => <button type="button" className="explore-club-card" key={club.userId} onClick={() => openClubProfile(club.userId)}><span className="mini-badge">{club.badgeUrl ? <img src={club.badgeUrl} alt="" /> : (club.displayName || '?').slice(0, 2).toUpperCase()}</span><strong>{club.displayName}</strong><small>Slot {club.slot}</small></button>)}</div></div>)}</section>)}</div>
}

function seasonDisplay(season) { return season?.code || season?.displayName || 'Season' }
function formatDate(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '' }
function displayValue(value) { return Number.isFinite(Number(value)) ? Number(value) : '-' }
function positionText(season) { return season?.position ? `${season.position}${suffix(season.position)}` : '-' }
function suffix(value) { const n = Number(value); if ([11,12,13].includes(n % 100)) return 'th'; return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th' }
function compactSeasonLabel(value) { return String(value || 'Season').replace(/Premier League\s*/i, '').replace(/\s+/g, ' ').trim() || value }
function leagueNameForCompetition(competition, displayName) { if (competition === 'E0') return 'Premier League'; return displayName?.replace(/\s+\d{4}.*/, '') || competition }

export default App
