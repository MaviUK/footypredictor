import { createClient } from '@supabase/supabase-js'

export function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key)
}

export async function getUser(event, supabase) {
  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) throw new Error('Missing auth token')
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new Error('Invalid auth token')
  await supabase.from('user_profiles').upsert({ user_id: data.user.id, email: data.user.email }, { onConflict: 'user_id' })
  return data.user
}

export function londonDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function hashString(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function seededRandom(seed) {
  let state = hashString(seed) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 4294967296)
  }
}

export function shuffle(items, seed) {
  const random = seededRandom(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function resultOf(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return 'H'
  if (homeGoals < awayGoals) return 'A'
  return 'D'
}

export function scorePoints(fixture, homeGoals, awayGoals) {
  const exact = fixture.full_time_home_goals === homeGoals && fixture.full_time_away_goals === awayGoals
  const correct = fixture.full_time_result === resultOf(homeGoals, awayGoals)
  return {
    points: exact ? 3 : correct ? 1 : 0,
    exact_score: exact,
    correct_result: correct,
  }
}

export function makeOptions(fixture, seed) {
  const actual = {
    homeGoals: fixture.full_time_home_goals,
    awayGoals: fixture.full_time_away_goals,
    result: fixture.full_time_result,
  }
  const pools = {
    H: [[1,0],[2,0],[2,1],[3,1],[3,2],[4,2]],
    D: [[0,0],[1,1],[2,2],[3,3]],
    A: [[0,1],[0,2],[1,2],[1,3],[2,3],[2,4]],
  }
  const wanted = { H: 2, D: 2, A: 2 }
  wanted[actual.result] -= 1
  const options = [actual]
  for (const result of ['H', 'D', 'A']) {
    const candidates = shuffle(pools[result], `${seed}:${result}`)
    for (const [homeGoals, awayGoals] of candidates) {
      if (options.length >= 6) break
      if (wanted[result] <= 0) break
      if (homeGoals === actual.homeGoals && awayGoals === actual.awayGoals) continue
      options.push({ homeGoals, awayGoals, result })
      wanted[result] -= 1
    }
  }
  return shuffle(options, `${seed}:options`)
}

export function json(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) }
}
