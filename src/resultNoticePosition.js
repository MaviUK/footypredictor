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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', moveResultNoticeBelowResults)
  window.setInterval(moveResultNoticeBelowResults, 500)
}
