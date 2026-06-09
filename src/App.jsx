import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './dailyGame.css'

const RESULT_GROUPS = [
  ['H', 'Home win'],
  ['D', 'Draw'],
  ['A', 'Away win'],
]

const COUNTRY_OPTIONS = [
  'Northern Ireland',
  'England',
  'Scotland',
  'Wales',
  'Republic of Ireland',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Netherlands',
  'Portugal',
  'United States',
  'Canada',
  'Australia',
  'Other',
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
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedOptionKey, setSelectedOptionKey] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState('sign-in')
  const [authForm, setAuthForm] = useState({ email: '', username: '', country: 'Northern Ireland', password: '' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) {
      loadGame(session)
    } else {
      setGame(null)
    }
  }, [session])

  async function loadGame(activeSession = session) {
    if (!activeSession?.access_token) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/.netlify/functions/getDailyGame', {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Could not load today\'s game')
      }

      setGame(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
      const res = await fetch('/.netlify/functions/submitPrediction', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dailyGameFixtureId: game.currentRound.dailyGameFixtureId,
          homeGoals: option.homeGoals,
          awayGoals: option.awayGoals,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Could not submit prediction')
      }

      setLastResult(data.result)
      setSelectedOptionKey('')
      await loadGame()
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
      const country = authForm.country || 'Northern Ireland'

      if (authMode === 'sign-up' && username.length < 3) {
        throw new Error('Username must be at least 3 characters')
      }

      if (authMode === 'sign-up' && !country) {
        throw new Error('Please choose your country')
      }

      const authAction = authMode === 'sign-up'
        ? supabase.auth.signUp({
          email: authForm.email,
          password: authForm.password,
          options: {
            data: { username, country },
          },
        })
        : supabase.auth.signInWithPassword({
          email: authForm.email,
          password: authForm.password,
        })

      const { error: authError } = await authAction

      if (authError) {
        throw authError
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const leaderboard = useMemo(() => game?.leaderboard || [], [game])

  return (
    <main className="app-shell">
      <section className="hero compact-hero">
        <p className="eyebrow">Daily Season Predictor</p>
        <h1>One mystery Premier League season.</h1>
        <p>Use the table and form clues. Pick the score from six choices.</p>
      </section>

      {error && <p className="alert">{error}</p>}
      {lastResult && <ResultNotice result={lastResult} />}

      {!session && (
        <section className="panel auth-panel">
          <div>
            <p className="eyebrow">Sign in</p>
            <h2>{authMode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h2>
            <p>Pick your country league when signing up. Your daily table is only against players from that country.</p>
          </div>

          <form onSubmit={handleAuth}>
            <label>
              Email
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                required
              />
            </label>

            {authMode === 'sign-up' && (
              <>
                <label>
                  Username
                  <input
                    type="text"
                    minLength="3"
                    maxLength="20"
                    pattern="[A-Za-z0-9_]+"
                    value={authForm.username}
                    onChange={(event) => setAuthForm({ ...authForm, username: cleanUsername(event.target.value) })}
                    placeholder="e.g. gavin_fc"
                    required
                  />
                </label>

                <label>
                  Country league
                  <select
                    value={authForm.country}
                    onChange={(event) => setAuthForm({ ...authForm, country: event.target.value })}
                    required
                  >
                    {COUNTRY_OPTIONS.map((country) => (
                      <option value={country} key={country}>{country}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Password
              <input
                type="password"
                minLength="6"
                value={authForm.password}
                onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? 'Please wait...' : authMode === 'sign-up' ? 'Sign up' : 'Sign in'}
            </button>

            <button
              className="link-button"
              type="button"
              onClick={() => setAuthMode(authMode === 'sign-up' ? 'sign-in' : 'sign-up')}
            >
              {authMode === 'sign-up' ? 'Already have an account?' : 'Need an account?'}
            </button>
          </form>
        </section>
      )}

      {session && (
        <>
          <nav className="topbar compact-topbar">
            <span>{session.user.user_metadata?.username || session.user.email}</span>
            <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </nav>

          {game?.country && <p className="country-badge">Country league: {game.country}</p>}

          {game?.resultHistory?.length > 0 && <UserResultStrip results={game.resultHistory} />}

          {loading && <section className="panel">Loading today&apos;s game...</section>}

          {!loading && game?.currentRound && (
            <section className="game-layout">
              <article className="panel fixture-panel compact-fixture">
                <div className="round-meta">
                  <span>Round {game.currentRound.roundNumber}/{game.totalRounds}</span>
                  <strong>{game.season.displayName}</strong>
                </div>

                <div className="fixture-date">{formatFixtureDate(game.currentRound.fixtureDate)}</div>

                <div className="match-title compact-match-title">
                  <h2>{game.currentRound.home.name}</h2>
                  <span>v</span>
                  <h2>{game.currentRound.away.name}</h2>
                </div>

                <div className="scoreboard compact-scoreboard">
                  <TeamBlock side="Home" team={game.currentRound.home} />
                  <TeamBlock side="Away" team={game.currentRound.away} />
                </div>

                <ResultChoices
                  options={game.currentRound.options}
                  submitting={submitting}
                  selectedOptionKey={selectedOptionKey}
                  submitPrediction={submitPrediction}
                />
              </article>

              <aside className="panel score-panel compact-score-panel">
                <p className="eyebrow">Your score</p>
                <h2>{game.userScore.totalPoints} pts</h2>
                <p>{game.userScore.correctScores} exact · {game.userScore.correctResults} results</p>
                <p className="muted">W = 3pts · D = 1pt · L = 0pts</p>
              </aside>
            </section>
          )}

          {!loading && game?.completed && (
            <section className="panel">
              <p className="eyebrow">Season complete</p>
              <h2>You scored {game.userScore.totalPoints} points.</h2>
              <p>Come back tomorrow for a new randomly selected Premier League season.</p>
            </section>
          )}

          {leaderboard.length > 0 && <DailyLeaderboard rows={leaderboard} country={game?.country} />}
        </>
      )}
    </main>
  )
}

function DailyLeaderboard({ rows, country }) {
  return (
    <section className="panel daily-table-panel">
      <p className="eyebrow">Today&apos;s table{country ? ` · ${country}` : ''}</p>
      <div className="daily-table">
        <div className="daily-table-row daily-table-head">
          <span>#</span>
          <span>User</span>
          <span>P</span>
          <span>W</span>
          <span>D</span>
          <span>L</span>
          <span>PTS</span>
        </div>
        {rows.map((row, index) => (
          <div className="daily-table-row" key={row.userId}>
            <span>{index + 1}</span>
            <strong>{row.displayName || row.username || row.email || 'Player'}</strong>
            <span>{displayValue(row.played)}</span>
            <span>{displayValue(row.wins)}</span>
            <span>{displayValue(row.draws)}</span>
            <span>{displayValue(row.losses)}</span>
            <span>{displayValue(row.totalPoints)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResultNotice({ result }) {
  return (
    <section className={`result-notice outcome-${result.code}`}>
      <strong>{result.code}</strong>
      <span>{result.label}: +{result.points} pts</span>
      <small>Your pick {result.predictedScore} · Actual {result.actualScore}</small>
    </section>
  )
}

function UserResultStrip({ results }) {
  return (
    <section className="user-results panel">
      <div>
        <span className="eyebrow">Your results</span>
        <p>W = spot on 3pts · D = result 1pt · L = wrong 0pts</p>
      </div>
      <div className="user-result-chips">
        {results.map((result) => (
          <span className={`user-result-chip outcome-${result.code}`} key={result.roundNumber} title={`Round ${result.roundNumber}: ${result.label}`}>
            {result.code}
          </span>
        ))}
      </div>
    </section>
  )
}

function TeamBlock({ side, team }) {
  const snapshot = team.snapshot || {}

  return (
    <section className="team-card compact-team-card">
      <div className="team-heading">
        <span>{side}</span>
        <h3>{team.name}</h3>
      </div>

      <LeagueLine snapshot={snapshot} />

      <div className="form-area compact-form-area">
        <FormStrip label="Form" value={snapshot.form} />
        <FormStrip label={side === 'Home' ? 'Home' : 'Away'} value={snapshot.venueForm} />
      </div>
    </section>
  )
}

function LeagueLine({ snapshot }) {
  return (
    <div className="league-strip compact-league-strip" aria-label="League table line before this fixture">
      <div className="league-labels">
        <span>Pos</span>
        {TABLE_COLUMNS.map(([, label]) => <span key={label}>{label}</span>)}
      </div>
      <div className="league-values">
        <strong>{displayValue(snapshot.position)}</strong>
        {TABLE_COLUMNS.map(([key, label]) => (
          <span key={label}>{displayValue(snapshot[key])}</span>
        ))}
      </div>
    </div>
  )
}

function ResultChoices({ options, submitting, selectedOptionKey, submitPrediction }) {
  return (
    <div className="option-grid result-columns">
      {RESULT_GROUPS.map(([result, label]) => {
        const resultOptions = options.filter((option) => option.result === result).slice(0, 2)
        return (
          <div className={`result-column result-column-${result}`} key={result}>
            <span className="result-column-label">{label}</span>
            {resultOptions.map((option) => {
              const optionKey = scoreKey(option)
              const selected = selectedOptionKey === optionKey
              return (
                <button
                  type="button"
                  className={selected ? 'selected-choice' : ''}
                  key={optionKey}
                  onClick={() => submitPrediction(option)}
                  disabled={submitting}
                  aria-pressed={selected}
                >
                  <strong>{option.homeGoals}-{option.awayGoals}</strong>
                  {selected && <small>Picked</small>}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function FormStrip({ label, value }) {
  const results = String(value || '').replace(/[^WDL]/g, '').split('').slice(-5)

  return (
    <div className="form-strip-wrap">
      <span className="form-label">{label}</span>
      {results.length ? (
        <div className="form-strip">
          {results.map((result, index) => (
            <span className={`form-chip ${resultClass(result)}`} key={`${result}-${index}`}>
              {result}
            </span>
          ))}
        </div>
      ) : (
        <span className="form-empty">-</span>
      )}
    </div>
  )
}

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function scoreKey(option) {
  return `${option.homeGoals}-${option.awayGoals}`
}

function formatFixtureDate(value) {
  if (!value) return 'Fixture date unavailable'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function resultClass(result) {
  if (result === 'W') return 'win'
  if (result === 'D') return 'draw'
  return 'loss'
}

export default App
