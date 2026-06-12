export function testSeasonMinutes() {
  const value = Number(process.env.TEST_SEASON_MINUTES || 0)
  return Number.isFinite(value) && value >= 5 ? Math.floor(value) : 0
}

export function londonDateTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)

  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function currentGameCycle(gameDate, now = new Date()) {
  const minutes = testSeasonMinutes()
  if (!minutes) return { cycleKey: 'daily', isTestMode: false, minutes: 0 }

  const parts = londonDateTimeParts(now)
  const hour = Number(parts.hour || 0)
  const minute = Number(parts.minute || 0)
  const bucketMinute = Math.floor(minute / minutes) * minutes

  return {
    cycleKey: `test-${gameDate}-${String(hour).padStart(2, '0')}-${String(bucketMinute).padStart(2, '0')}`,
    isTestMode: true,
    minutes,
  }
}

export function previousGameCycle(gameDate, now = new Date()) {
  const minutes = testSeasonMinutes()
  if (!minutes) return { gameDate, cycleKey: 'daily', isTestMode: false, minutes: 0 }

  const previous = new Date(now.getTime() - minutes * 60 * 1000)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(previous)

  return { gameDate: date, ...currentGameCycle(date, previous) }
}
