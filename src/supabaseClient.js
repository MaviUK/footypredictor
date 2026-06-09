import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

function getNextCutoff() {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setHours(0, 5, 0, 0)
  if (cutoff <= now) cutoff.setDate(cutoff.getDate() + 1)
  return { now, cutoff }
}

function formatDeadlineRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

function ensureDeadlineTimerStyle() {
  if (typeof document === 'undefined' || document.getElementById('prediction-deadline-style')) return
  const style = document.createElement('style')
  style.id = 'prediction-deadline-style'
  style.textContent = `
    #prediction-deadline-timer {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
      margin: 8px 0 10px;
      padding: 12px 14px;
      border: 1px solid #234a34;
      border-radius: 18px;
      background: linear-gradient(180deg,#102c1b,#0b1f13);
      color: #eefcf2;
      text-align: center;
      box-shadow: 0 12px 28px rgba(0,0,0,.18);
    }
    #prediction-deadline-timer .deadline-label {
      color: #74f58e;
      font-size: .68rem;
      font-weight: 900;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    #prediction-deadline-timer .deadline-time {
      font-size: clamp(1.5rem, 7vw, 2.6rem);
      line-height: 1;
      font-weight: 1000;
      letter-spacing: -.05em;
    }
    #prediction-deadline-timer .deadline-note {
      color: #cdebd5;
      font-size: .78rem;
      font-weight: 800;
    }
  `
  document.head.appendChild(style)
}

function renderPredictionDeadlineTimer() {
  if (typeof document === 'undefined') return
  const anchor = document.querySelector('.country-badge')
  if (!anchor) return

  ensureDeadlineTimerStyle()

  let timer = document.getElementById('prediction-deadline-timer')
  if (!timer) {
    timer = document.createElement('section')
    timer.id = 'prediction-deadline-timer'
    anchor.insertAdjacentElement('afterend', timer)
  }

  const { now, cutoff } = getNextCutoff()
  const remaining = cutoff.getTime() - now.getTime()
  timer.innerHTML = `
    <span class="deadline-label">Season finishes in</span>
    <strong class="deadline-time">${formatDeadlineRemaining(remaining)}</strong>
    <span class="deadline-note">Unfinished fixtures auto-pick at 00:05 UK time.</span>
  `
}

if (typeof window !== 'undefined') {
  window.setInterval(renderPredictionDeadlineTimer, 1000)
  window.addEventListener('load', renderPredictionDeadlineTimer)
  window.addEventListener('hashchange', renderPredictionDeadlineTimer)

  const startObserver = () => {
    if (!document.body || document.getElementById('prediction-deadline-observer')) return
    const marker = document.createElement('span')
    marker.id = 'prediction-deadline-observer'
    marker.hidden = true
    document.body.appendChild(marker)
    const observer = new MutationObserver(renderPredictionDeadlineTimer)
    observer.observe(document.body, { childList: true, subtree: true })
    renderPredictionDeadlineTimer()
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startObserver)
  } else {
    startObserver()
  }
}
