function moveResultNoticeBelowResults() {
  try {
    const notice = document.querySelector('.result-notice')
    const results = document.querySelector('.user-results')
    if (!notice || !results) return

    const next = results.nextElementSibling
    if (next === notice) return

    results.insertAdjacentElement('afterend', notice)
  } catch (error) {
    console.warn('Result notice position skipped', error)
  }
}

function removeDuplicateArchiveButtons() {
  try {
    const nav = document.querySelector('.topbar-actions')
    if (!nav) return

    const archiveButtons = Array.from(nav.querySelectorAll('button')).filter((button) => button.textContent.trim().toLowerCase() === 'archive')
    archiveButtons.forEach((button, index) => {
      button.hidden = index > 0
      button.style.display = index > 0 ? 'none' : ''
    })
  } catch (error) {
    console.warn('Archive button cleanup skipped', error)
  }
}

function tidyUi() {
  moveResultNoticeBelowResults()
  removeDuplicateArchiveButtons()
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', tidyUi)
  window.setInterval(tidyUi, 500)
}
