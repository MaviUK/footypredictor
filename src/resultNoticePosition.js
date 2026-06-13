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

function addCleanTableCss() {
  if (document.getElementById('clean-table-visibility-css')) return
  const style = document.createElement('style')
  style.id = 'clean-table-visibility-css'
  style.textContent = `
    .compact-score-panel,
    .score-panel,
    .daily-table-panel,
    .daily-table,
    .league-strip,
    .compact-league-strip,
    .league-labels,
    .league-values {
      visibility: visible !important;
      opacity: 1 !important;
    }

    .compact-score-panel,
    .score-panel,
    .daily-table-panel {
      display: block !important;
    }

    .daily-table {
      display: grid !important;
    }

    .league-strip,
    .compact-league-strip {
      display: block !important;
      background: #f8fbf8 !important;
      border: 1px solid #cfdcd2 !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      min-height: 58px !important;
    }

    .league-labels,
    .league-values {
      display: grid !important;
      grid-template-columns: 1.1fr repeat(8, 1fr) !important;
      min-height: 28px !important;
    }

    .league-labels span,
    .league-values span,
    .league-values strong {
      display: block !important;
      color: #102016 !important;
      text-align: center !important;
      font-weight: 900 !important;
      padding: 5px 2px !important;
      white-space: nowrap !important;
    }

    .league-labels span {
      background: #e6efe7 !important;
      color: #526258 !important;
      font-size: 0.55rem !important;
    }

    .league-values strong {
      color: #1f7b46 !important;
    }

    .daily-table-row,
    .daily-table-button {
      display: grid !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
  `
  document.head.appendChild(style)
}

function tidyUi() {
  addCleanTableCss()
  moveResultNoticeBelowResults()
  removeDuplicateArchiveButtons()
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', tidyUi)
  window.setInterval(tidyUi, 500)
}
