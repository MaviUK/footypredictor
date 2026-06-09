function getCutoff() {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setHours(0, 5, 0, 0)
  if (cutoff <= now) cutoff.setDate(cutoff.getDate() + 1)
  return cutoff
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

function addStyles() {
  if (!document.head || document.getElementById('season-finish-timer-css')) return
  const style = document.createElement('style')
  style.id = 'season-finish-timer-css'
  style.textContent = '#season-finish-timer{margin:8px 0 10px;padding:12px 14px;border:1px solid #234a34;border-radius:18px;background:linear-gradient(180deg,#102c1b,#0b1f13);color:#eefcf2;text-align:center;box-shadow:0 12px 28px rgba(0,0,0,.18)}#season-finish-timer .timer-label{display:block;color:#74f58e;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase}#season-finish-timer .timer-time{display:block;font-size:clamp(1.5rem,7vw,2.6rem);line-height:1;font-weight:1000;letter-spacing:-.05em}#season-finish-timer .timer-note{display:block;color:#cdebd5;font-size:.78rem;font-weight:800}'
  document.head.appendChild(style)
}

function updateTimer() {
  try {
    const anchor = document.querySelector('.country-badge')
    const existing = document.getElementById('season-finish-timer')

    if (!anchor) {
      if (existing) existing.remove()
      return
    }

    addStyles()

    const timer = existing || document.createElement('section')
    timer.id = 'season-finish-timer'
    if (!existing) anchor.insertAdjacentElement('afterend', timer)

    const remaining = getCutoff().getTime() - Date.now()
    timer.innerHTML = `<span class="timer-label">Season finishes in</span><strong class="timer-time">${formatTime(remaining)}</strong><span class="timer-note">Unfinished fixtures auto-pick at 00:05 UK time.</span>`
  } catch (error) {
    console.warn('Season timer skipped', error)
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', updateTimer)
  window.setInterval(updateTimer, 1000)
}
