import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

function nextPredictionCutoff(now = new Date()) {
  const cutoff = new Date(now)
  cutoff.setHours(0, 5, 0, 0)
  if (cutoff <= now) cutoff.setDate(cutoff.getDate() + 1)
  return cutoff
}

function formatRemaining(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

function installDeadlineStyles() {
  if (typeof document === 'undefined' || document.getElementById('deadline-timer-styles')) return

  const style = document.createElement('style')
  style.id = 'deadline-timer-styles'
  style.textContent = `
    #prediction-deadline-timer {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 10px 14px;
      margin-bottom: 10px;
      text-align: left;
    }
    #prediction-deadline-timer strong {
      display: block;
      font-size: clamp(1.4rem, 6vw, 2.4rem);
      letter-spacing: -0.04em;
      line-height: 1;
    }
    #prediction-deadline-timer span {
      color: #cdebd5;
      font-size: 0.82rem;
      font-weight: 800;
      text-align: right;
    }
    @media (max-width: 520px) {
      #prediction-deadline-timer {
        grid-template-columns: 1fr;
        text-align: center;
      }
      #prediction-deadline-timer span {
        text-align: center;
        font-size: 0.72rem;
      }
    }
  `
  document.head.appendChild(style)
}

function renderPredictionDeadlineTimer() {
  if (typeof document === 'undefined') return

  const anchor = document.querySelector('.country-badge')
  if (!anchor) return

  installDeadlineStyles()

  let timer = document.getElementById('prediction-deadline-timer')
  if (!timer) {
    timer = document.createElement('section')
    timer.id = 'prediction-deadline-timer'
    timer.className = 'panel'
    anchor.insertAdjacentElement('afterend', timer)
  }

  const now = new Date()
  const cutoff = nextPredictionCutoff(now)
  const remaining = cutoff.getTime() - now.getTime()

  timer.innerHTML = `
    <div>
      <p class="eyebrow">Prediction deadline</p>
      <strong>${formatRemaining(remaining)}</strong>
    </div>
    <span>Unfinished fixtures auto-pick at 00:05 UK time.</span>
  `
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    renderPredictionDeadlineTimer()
    window.setInterval(renderPredictionDeadlineTimer, 1000)

    const observer = new MutationObserver(renderPredictionDeadlineTimer)
    observer.observe(document.body, { childList: true, subtree: true })
  })
}
