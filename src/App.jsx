import { useState } from 'react'
import './App.css'

function App() {
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadFixtures() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/.netlify/functions/fetchFixtures?competition=PL&status=SCHEDULED')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Could not load fixtures')
      }

      setFixtures(data.matches || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Goal Diff Fantasy</p>
        <h1>Pick 3 teams. Win on goal difference.</h1>
        <p>
          Each week you play another user head-to-head using real football fixtures.
        </p>

        <button onClick={loadFixtures}>
          {loading ? 'Loading fixtures...' : 'Load Premier League Fixtures'}
        </button>

        {error && <p className="error">{error}</p>}
      </section>

      <section className="fixtures">
        {fixtures.map((fixture) => (
          <article className="fixture-card" key={fixture.id}>
            <div>
              <strong>{fixture.homeTeam.name}</strong>
              <span> vs </span>
              <strong>{fixture.awayTeam.name}</strong>
            </div>

            <small>
              {new Date(fixture.utcDate).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </small>
          </article>
        ))}
      </section>
    </main>
  )
}

export default App