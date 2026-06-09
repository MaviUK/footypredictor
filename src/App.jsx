import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import './dailyGame.css'

const RESULT_LABELS = {
  H: 'Home win',
  D: 'Draw',
  A: 'Away win',
}

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
  const [error, setError] = useState('')
  const [authMode, setAuthMode] = useState('sign-in')
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

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

    setSubmitting(true)
    setError('')

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
      const authAction = authMode === 'sign-up'
        ? supabase.auth.signUp(authForm)
        : supabase.auth.signInWithPassword(authForm)

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
      <section className="hero">
        <p className="eyebrow">Daily Season Predictor</p>
        <h1>Play one mystery Premier League season every day.</h1>
        <p>
          Everyone gets the same hidden season. Work through 38 randomly ordered fixtures,
          use the table and form clues, then pick the correct score from six choices.
        </p>
      </section>

      {error && <p className="alert">{error}</p>}

      {!session && (
        <section className="panel auth-panel">
          <div>
            <p className="eyebrow">Sign in</p>
            <h2>{authMode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h2>
            <p>Scores, daily winners, promotions and relegations are tracked against your account.</p>
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
          <nav className="topbar">
            <span>{session.user.email}</span>
            <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </nav>

          {loading && <section className="panel">Loading today&apos;s game...</section>}

          {!loading && game?.currentRound && (
            <section className="game-layout">
              <article className="panel fixture-panel">
                <div className="round-meta">
                  <span>Round {game.currentRound.roundNumber} of {game.totalRounds}</span>
                  <strong>{game.season.displayName}</strong>
                </div>

                <div className="match-title">
                  <h2>{game.currentRound.home.name}</h2>
                  <span>v</span>
                  <h2>{game.currentRound.away.name}</h2>
                </div>

                <div className="scoreboard">
                  <TeamBlock side="Home" team={game.currentRound.home} />
                  <TeamBlock side="Away" team={game.currentRound.away} />
                </div>

                <div className="option-grid">
                  {game.currentRound.options.map((option) => (
                    <button
                      type="button"
                      key={`${option.homeGoals}-${option.awayGoals}`}
                      onClick={() => submitPrediction(option)}
                      disabled={submitting}
                    >
                      <strong>{option.homeGoals}-{option.awayGoals}</strong>
                      <small>{RESULT_LABELS[option.result]}</small>
                    </button>
                  ))}
                </div>
              </article>

              <aside className="panel score-panel">
                <p className="eyebrow">Your score</p>
                <h2>{game.userScore.totalPoints} pts</h2>
                <p>
                  Correct scores: {game.userScore.correctScores} · Correct results: {game.userScore.correctResults}
                </p>
                <p className="muted">
                  Right score = 3 points. Right result only = 1 point. Wrong = 0.
                </p>
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

          {leaderboard.length > 0 && (
            <section className="panel">
              <p className="eyebrow">Today&apos;s table</p>
              <div className="leaderboard">
                {leaderboard.map((row, index) => (
                  <div key={row.userId}>
                    <span>{index + 1}</span>
                    <strong>{row.email || 'Player'}</strong>
                    <span>{row.totalPoints} pts</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  )
}

function TeamBlock({ side, team }) {
  const snapshot = team.snapshot || {}

  return (
    <section className="team-card">
      <div className="team-heading">
        <span>{side}</span>
        <h3>{team.name}</h3>
      </div>

      <LeagueLine snapshot={snapshot} />

      <div className="form-area">
        <FormStrip label="Last 5" value={snapshot.form} />
        <FormStrip label={`${side} form`} value={snapshot.venueForm} />
      </div>
    </section>
  )
}

function LeagueLine({ snapshot }) {
  return (
    <div className="league-strip" aria-label="League table line before this fixture">
      <div className="league-labels">
        <span>Pos</span>
        {TABLE_COLUMNS.map(([, label]) => <span key={label}>{label}</span>)}
      </div>
      <div className="league-values">
        <strong>{displayValue(snapshot.position)}.</strong>
        {TABLE_COLUMNS.map(([key, label]) => (
          <span key={label}>{displayValue(snapshot[key])}</span>
        ))}
      </div>
    </div>
  )
}

function FormStrip({ label, value }) {
  const results = String(value || '').replace(/[^WDL]/g, '').split('').slice(-6)

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
        <span className="form-empty">No form yet</span>
      )}
    </div>
  )
}

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '-' : value
}

function resultClass(result) {
  if (result === 'W') return 'win'
  if (result === 'D') return 'draw'
  return 'loss'
}

export default App
