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

function installStyles() {
  if (typeof document === 'undefined' || document.getElementById('season-finish-timer-styles')) return

  const style = document.createElement('style')
  style.id = 'season-finish-timer-styles'
  style.textContent = `
    #season-finish-timer {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      margin-bottom: 10px;
      text-align: left;
    }
    #season-finish-timer strong {
      display: block;
      font-size: clamp(1.35rem, 6vw, 2.25rem);
      line-height: 1;
      letter-spacing: -0.04em;
    }
    #season-finish-timer span {
      color: #cdebd5;
      font-size: 0.82rem;
      font-weight: 800;
      text-align: right;
    }
    @media (max-width: 520px) {
      #season-finish-timer {
        grid-template-columns: 1fr;
        text-align: center;
        padding: 8px 10px;
      }
      #season-finish-timer span {
        text-align: center;
        font-size: 0.7rem;
      }
    }
  `
  document.head.appendChild(style)
}

function renderSeasonFinishTimer() {
  if (typeof document === 'undefined') return

  const anchor = document.querySelector('.country-badge')
  const existing = document.getElementById('season-finish-timer')

  if (!anchor) {
    if (existing) existing.remove()
    return
  }

  installStyles()

  const timer = existing || document.createElement('section')
  timer.id = 'season-finish-timer'
  timer.className = 'panel'

  if (!existing) anchor.insertAdjacentElement('afterend', timer)

  const cutoff = nextPredictionCutoff()
  const remaining = cutoff.getTime() - Date.now()

  timer.innerHTML = `
    <div>
      <p class="eyebrow">Season finish timer</p>
      <strong>${formatRemaining(remaining)}</strong>
    </div>
    <span>Unfinished fixtures auto-pick at 00:05 UK time.</span>
  `
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    renderSeasonFinishTimer()
    window.setInterval(renderSeasonFinishTimer, 1000)

    const observer = new MutationObserver(renderSeasonFinishTimer)
    observer.observe(document.body, { childList: true, subtree: true })
  })
}
