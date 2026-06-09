import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './dailyGame.css'

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
      await loadExplorer(session)
    } catch (err) {
      setError(err.message)
    } finally {
      setProfileLoading(false)
    }
  }

  async function uploadBadge(event) {
    const file = event.target.files?.[0]
    if (!file || !session?.user?.id) return
    if (clubProfile?.profile && clubProfile.profile.isOwnProfile === false) return
    setProfileLoading(true)
    setError('')
    try {
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]/g, '-')
      const path = `${session.user.id}/${Date.now()}-${safeName}`
      const upload = await supabase.storage.from('club-badges').upload(path, file, { upsert: true, contentType: file.type })
      if (upload.error) throw upload.error
      const { data } = supabase.storage.from('club-badges').getPublicUrl(path)
      const nextForm = { ...clubForm, badgeUrl: data.publicUrl, badgePath: path }
      setClubForm({ clubName: nextForm.clubName, badgeUrl: nextForm.badgeUrl })
      await saveClubProfile(nextForm)
    } catch (err) {
      setError(`Badge upload failed: ${err.message}`)
    } finally {
      setProfileLoading(false)
      event.target.value = ''
    }
  }

  async function submitPrediction(option) {
    if (!session?.access_token || !game?.currentRound) return
    const optionKey = scoreKey(option)
    setSelectedOptionKey(optionKey)
    setSubmitting(true)
    setError('')
    setLastResult(null)
    try {
      const res = await fetch('/.netlify/functions/submitPrediction', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dailyGameFixtureId: game.currentRound.dailyGameFixtureId, homeGoals: option.homeGoals, awayGoals: option.awayGoals }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not submit prediction')
      setLastResult(data.result)
      setSelectedOptionKey('')
      await loadGame()
      if (viewingUserId) await loadClubProfile(session, viewingUserId)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAuth(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const username = cleanUsername(authForm.username)
      if (authMode === 'sign-up' && username.length < 3) throw new Error('Username must be at least 3 characters')
      if (authMode === 'sign-up' && (!authForm.country || !authForm.competition)) throw new Error('Please choose an imported prediction league')
      const authAction = authMode === 'sign-up'
        ? supabase.auth.signUp({ email: authForm.email, password: authForm.password, options: { data: { username, country: authForm.country, competition: authForm.competition, leagueName: authForm.leagueName } } })
        : supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
      const { error: authError } = await authAction
      if (authError) throw authError
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const leaderboard = useMemo(() => game?.leaderboard || [], [game])

  return (
    <main className="app-shell">
      <section className="hero compact-hero"><p className="eyebrow">Daily Season Predictor</p><h1>One mystery Premier League season.</h1><p>Use the table and form clues. Pick the score from six choices.</p></section>
      {error && <p className="alert">{error}</p>}
      {lastResult && view === 'game' && <ResultNotice result={lastResult} />}

      {!session && (
        <section className="panel auth-panel">
          <div><p className="eyebrow">Sign in</p><h2>{authMode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h2><p>Choose from imported fixture leagues only. If a league is not imported, it will not appear here.</p></div>
          <form onSubmit={handleAuth}>
            <label>Email<input type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required /></label>
            {authMode === 'sign-up' && <><label>Username<input type="text" minLength="3" maxLength="20" pattern="[A-Za-z0-9_]+" value={authForm.username} onChange={(event) => setAuthForm({ ...authForm, username: cleanUsername(event.target.value) })} placeholder="e.g. gavin_fc" required /></label><label>Prediction league<select value={leagueValue(authForm)} onChange={(event) => { const selected = availableLeagues.find((league) => leagueValue(league) === event.target.value); if (selected) setAuthForm({ ...authForm, ...selected }) }} required>{availableLeagues.length === 0 && <option value="">No imported leagues found</option>}{availableLeagues.map((league) => <option value={leagueValue(league)} key={leagueValue(league)}>{league.country} - {league.leagueName}</option>)}</select></label></>}
            <label>Password<input type="password" minLength="6" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required /></label>
            <button type="submit" disabled={loading || (authMode === 'sign-up' && availableLeagues.length === 0)}>{loading ? 'Please wait...' : authMode === 'sign-up' ? 'Sign up' : 'Sign in'}</button>
            <button className="link-button" type="button" onClick={() => setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up')}>{authMode === 'sign-up' ? 'Already have an account?' : 'Need an account?'}</button>
          </form>
        </section>
      )}

      {session && <><nav className="topbar compact-topbar app-nav"><button className="club-name-button" type="button" onClick={openOwnClubProfile}>{clubProfile?.profile?.clubName || session.user.user_metadata?.username || session.user.email}</button><div className="topbar-actions"><button type="button" onClick={() => setView('game')}>Game</button><button type="button" onClick={openExplore}>Explore</button><button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></div></nav>
        {view === 'explore' && <ExplorePage explorer={explorer} loading={explorerLoading} openClubProfile={openClubProfile} refresh={openExplore} />}
        {view === 'profile' && <ClubProfilePage profileData={clubProfile} clubForm={clubForm} setClubForm={setClubForm} profileLoading={profileLoading} saveClubProfile={saveClubProfile} uploadBadge={uploadBadge} refresh={() => loadClubProfile(session, viewingUserId || session.user.id)} openOwnClubProfile={openOwnClubProfile} />}
        {view === 'game' && <><p className="country-badge">League: {game?.country || '-'}{game?.leagueName ? ` - ${game.leagueName}` : ''}{game?.tier?.name ? ` · ${game.tier.name}` : ''}</p>{game?.resultHistory?.length > 0 && <UserResultStrip results={game.resultHistory} />}{loading && <section className="panel">Loading today&apos;s game...</section>}{!loading && game?.currentRound && <section className="game-layout"><article className="panel fixture-panel compact-fixture"><div className="round-meta"><span>Round {game.currentRound.roundNumber}/{game.totalRounds}</span><strong>{game.season.displayName}</strong></div><div className="fixture-date">{formatFixtureDate(game.currentRound.fixtureDate)}</div><div className="match-title compact-match-title"><h2>{game.currentRound.home.name}</h2><span>v</span><h2>{game.currentRound.away.name}</h2></div><div className="scoreboard compact-scoreboard"><TeamBlock side="Home" team={game.currentRound.home} /><TeamBlock side="Away" team={game.currentRound.away} /></div><ResultChoices options={game.currentRound.options} submitting={submitting} selectedOptionKey={selectedOptionKey} submitPrediction={submitPrediction} /></article><aside className="panel score-panel compact-score-panel"><p className="eyebrow">Your score</p><h2>{game.userScore.totalPoints} pts</h2><p>{game.userScore.correctScores} exact · {game.userScore.correctResults} results</p><p className="muted">W = 3pts · D = 1pt · L = 0pts</p></aside></section>}{!loading && game?.completed && <section className="panel"><p className="eyebrow">Season complete</p><h2>You scored {game.userScore.totalPoints} points.</h2><p>Come back tomorrow for a new randomly selected season.</p></section>}{leaderboard.length > 0 && <DailyLeaderboard rows={leaderboard} game={game} openClubProfile={openClubProfile} />}</>}
      </>}
    </main>
  )
}

function ExplorePage({ explorer, loading, openClubProfile, refresh }) {
  const leagues = explorer?.leagues || []
  return <section className="profile-stack"><article className="panel"><p className="eyebrow">Explore pyramid</p><h2>All leagues and clubs</h2><p className="muted">Browse every country league, tier and club. Tap a club to open its profile.</p><button type="button" onClick={refresh} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button></article>{leagues.map((league) => <article className="panel explore-league" key={`${league.country}:${league.competition}`}><div className="explore-league-head"><div><p className="eyebrow">{league.country}</p><h3>{league.leagueName}</h3></div><strong>{league.totalTeams} clubs</strong></div>{league.tiers.map((tier) => <div className="explore-tier" key={tier.level}><div className="explore-tier-title"><span>{tier.name}</span><small>{tier.teams.length}/{tier.size}</small></div><div className="explore-club-grid">{tier.teams.map((team) => <button type="button" className="explore-club-card" key={team.userId} onClick={() => openClubProfile(team.userId)}><span className="mini-badge">{team.badgeUrl ? <img src={team.badgeUrl} alt="" /> : clubInitials(team.name)}</span><strong>{team.name}</strong><small>#{team.slot}</small></button>)}</div></div>)}</article>)}{leagues.length === 0 && <section className="panel">No leagues found yet.</section>}</section>
}

function ClubProfilePage({ profileData, clubForm, setClubForm, profileLoading, saveClubProfile, uploadBadge, refresh, openOwnClubProfile }) {
  const profile = profileData?.profile || {}
  const stats = profileData?.stats || {}
  const seasons = profileData?.seasons || []
  const isOwnProfile = profile.isOwnProfile !== false
  return <section className="profile-stack"><article className="panel club-profile-hero"><div className="club-badge">{clubForm.badgeUrl ? <img src={clubForm.badgeUrl} alt="Club badge" /> : <span>{clubInitials(clubForm.clubName || profile.clubName)}</span>}</div><div><p className="eyebrow">{isOwnProfile ? 'Your club profile' : 'Club profile'}</p><h2>{profile.clubName || 'Club'}</h2><p className="muted">{profile.country} · {profile.leagueName} · {profile.tierName}</p>{!isOwnProfile && <button className="link-button" type="button" onClick={openOwnClubProfile}>Back to my club</button>}</div></article>{isOwnProfile && <article className="panel club-editor"><label>Club name<input type="text" maxLength="40" value={clubForm.clubName} onChange={(event) => setClubForm({ ...clubForm, clubName: event.target.value })} placeholder="Enter club name" /></label><label>Club badge<input type="file" accept="image/*" onChange={uploadBadge} disabled={profileLoading} /></label><button type="button" onClick={() => saveClubProfile()} disabled={profileLoading}>{profileLoading ? 'Saving...' : 'Save club'}</button><button type="button" className="link-button" onClick={refresh} disabled={profileLoading}>Refresh stats</button></article>}<article className="panel"><p className="eyebrow">All-time stats</p><div className="stats-grid"><StatCard label="Seasons" value={stats.seasonsPlayed} /><StatCard label="Played" value={stats.totalPlayed} /><StatCard label="Points" value={stats.totalPoints} /><StatCard label="Wins" value={stats.totalWins} /><StatCard label="Draws" value={stats.totalDraws} /><StatCard label="Defeats" value={stats.totalLosses} /><StatCard label="Win %" value={`${displayValue(stats.winPercentage)}%`} /><StatCard label="Draw %" value={`${displayValue(stats.drawPercentage)}%`} /><StatCard label="Loss %" value={`${displayValue(stats.lossPercentage)}%`} /><StatCard label="Best W streak" value={stats.longestWinningStreak} /><StatCard label="Best D streak" value={stats.longestDrawStreak} /><StatCard label="Worst L streak" value={stats.longestLosingStreak} /></div></article><article className="panel best-worst-grid"><SeasonSummary title="Best season" season={stats.bestSeason} /><SeasonSummary title="Worst season" season={stats.worstSeason} /></article><article className="panel daily-table-panel"><p className="eyebrow">Season history</p><div className="daily-table"><div className="daily-table-row profile-season-row daily-table-head"><span>Season</span><span>P</span><span>W</span><span>D</span><span>L</span><span>PTS</span><span>W%</span></div>{seasons.length === 0 && <p className="muted">No completed picks yet.</p>}{seasons.map((season) => <div className="daily-table-row profile-season-row" key={season.id}><strong>{season.label}</strong><span>{displayValue(season.played)}</span><span>{displayValue(season.wins)}</span><span>{displayValue(season.draws)}</span><span>{displayValue(season.losses)}</span><span>{displayValue(season.points)}</span><span>{displayValue(season.winPercentage)}%</span></div>)}</div></article></section>
}

function StatCard({ label, value }) { return <div className="stat-card"><span>{label}</span><strong>{displayValue(value)}</strong></div> }
function SeasonSummary({ title, season }) { return <div className="season-summary"><p className="eyebrow">{title}</p>{season ? <><h3>{season.label}</h3><p>{season.points} pts · {season.wins}W {season.draws}D {season.losses}L</p></> : <p className="muted">No season yet.</p>}</div> }
function DailyLeaderboard({ rows, game, openClubProfile }) { const title = game?.tier?.name ? `${game.tier.name} table` : 'Today\'s table'; return <section className="panel daily-table-panel"><p className="eyebrow">{title}</p><div className="daily-table"><div className="daily-table-row daily-table-head"><span>#</span><span>User</span><span>P</span><span>W</span><span>D</span><span>L</span><span>PTS</span></div>{rows.map((row, index) => <button className="daily-table-row daily-table-button" type="button" key={row.userId} onClick={() => openClubProfile(row.userId)}><span>{index + 1}</span><strong>{row.displayName || row.username || row.email || 'Player'}</strong><span>{displayValue(row.played)}</span><span>{displayValue(row.wins)}</span><span>{displayValue(row.draws)}</span><span>{displayValue(row.losses)}</span><span>{displayValue(row.totalPoints)}</span></button>)}</div></section> }
function ResultNotice({ result }) { return <section className={`result-notice outcome-${result.code}`}><strong>{result.code}</strong><span>{result.label}: +{result.points} pts</span><small>Your pick {result.predictedScore} · Actual {result.actualScore}</small></section> }
function UserResultStrip({ results }) { return <section className="user-results panel"><div><span className="eyebrow">Your results</span><p>W = spot on 3pts · D = result 1pt · L = wrong 0pts</p></div><div className="user-result-chips">{results.map((result) => <span className={`user-result-chip outcome-${result.code}`} key={result.roundNumber} title={`Round ${result.roundNumber}: ${result.label}`}>{result.code}</span>)}</div></section> }
function TeamBlock({ side, team }) { const snapshot = team.snapshot || {}; return <section className="team-card compact-team-card"><div className="team-heading"><span>{side}</span><h3>{team.name}</h3></div><LeagueLine snapshot={snapshot} /><div className="form-area compact-form-area"><FormStrip label="Form" value={snapshot.form} /><FormStrip label={side === 'Home' ? 'Home' : 'Away'} value={snapshot.venueForm} /></div></section> }
function LeagueLine({ snapshot }) { return <div className="league-strip compact-league-strip" aria-label="League table line before this fixture"><div className="league-labels"><span>Pos</span>{TABLE_COLUMNS.map(([, label]) => <span key={label}>{label}</span>)}</div><div className="league-values"><strong>{displayValue(snapshot.position)}</strong>{TABLE_COLUMNS.map(([key, label]) => <span key={label}>{displayValue(snapshot[key])}</span>)}</div></div> }
function ResultChoices({ options, submitting, selectedOptionKey, submitPrediction }) { return <div className="option-grid result-columns">{RESULT_GROUPS.map(([result, label]) => { const resultOptions = options.filter((option) => option.result === result).slice(0, 2); return <div className={`result-column result-column-${result}`} key={result}><span className="result-column-label">{label}</span>{resultOptions.map((option) => { const optionKey = scoreKey(option); const selected = selectedOptionKey === optionKey; return <button type="button" className={selected ? 'selected-choice' : ''} key={optionKey} onClick={() => submitPrediction(option)} disabled={submitting} aria-pressed={selected}><strong>{option.homeGoals}-{option.awayGoals}</strong>{selected && <small>Picked</small>}</button> })}</div> })}</div> }
function FormStrip({ label, value }) { const results = String(value || '').replace(/[^WDL]/g, '').split('').slice(-5); return <div className="form-strip-wrap"><span className="form-label">{label}</span>{results.length ? <div className="form-strip">{results.map((result, index) => <span className={`form-chip ${resultClass(result)}`} key={`${result}-${index}`}>{result}</span>)}</div> : <span className="form-empty">-</span>}</div> }
function leagueValue(league) { return league.country && league.competition ? `${league.country}:${league.competition}` : '' }
function leagueNameForCompetition(competition, displayName = '') { if (competition === 'E0') return 'Premier League'; return String(displayName || competition).replace(/\s+\d{4}\/\d{4}$/, '') || competition }
function cleanUsername(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) }
function clubInitials(value) { return String(value || 'FC').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || 'FC' }
function displayValue(value) { return value === null || value === undefined || value === '' ? '-' : value }
function scoreKey(option) { return `${option.homeGoals}-${option.awayGoals}` }
function formatFixtureDate(value) { if (!value) return 'Fixture date unavailable'; const date = new Date(`${value}T12:00:00`); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(date) }
function resultClass(result) { if (result === 'W') return 'win'; if (result === 'D') return 'draw'; return 'loss' }
export default App
