import { getSupabase, londonDate, shuffle, scorePoints, json } from './_gameHelpers.js'
import { previousGameCycle } from './_testCycle.js'

export const config = {
  schedule: '*/15 * * * *',
}

function previousLondonDate() {
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 1)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function tierSize(level) {
  return Number(level) === 1 ? 20 : 24
}

function tierSeasonLength(level) {
  return tierSize(level) * 2 - 2
}

function movementFor(rank, totalPlayers, level) {
  if (totalPlayers <= 1) return 'stayed'
  if (Number(level) > 1 && rank <= Math.max(1, Math.floor(totalPlayers * 0.15))) return 'promoted'
  if (rank > Math.max(1, Math.floor(totalPlayers * 0.85))) return 'relegated'
  return 'stayed'
}

function nextLevel(before, movement) {
  if (movement === 'promoted') return Math.max(1, Number(before || 1) - 1)
  if (movement === 'relegated') return Number(before || 1) + 1
  return Number(before || 1)
}

function isScheduledInvocation(event) {
  const eventHeader = String(event.headers?.['x-nf-event'] || event.headers?.['x-netlify-event'] || '').toLowerCase()
  return eventHeader === 'schedule' || eventHeader === 'scheduled'
}

function checkAuthorized(event) {
  if (isScheduledInvocation(event)) return null

  const expectedSecret = process.env.CLOSE_DAILY_GAME_SECRET
  const providedSecret = event.headers?.['x-close-secret'] || event.queryStringParameters?.secret

  if (!expectedSecret) {
    return json(500, { error: 'Missing CLOSE_DAILY_GAME_SECRET. Add this in Netlify before manual closeout.' })
  }

  if (providedSecret !== expectedSecret) {
    return json(401, { error: 'Unauthorized' })
  }

  return null
}

async function checked(step, query) {
  const result = await query
  if (result.error) {
    const parts = [step, result.error.message, result.error.details, result.error.hint, result.error.code].filter(Boolean)
    throw new Error(parts.join(': '))
  }
  return result
}

function predictionKey(userId, roundId) {
  return `${userId}:${roundId}`
}

function rowForProfile(profile) {
  return {
    user_id: profile.user_id,
    total_points: 0,
    correct_scores: 0,
    correct_results: 0,
    tier_slot: Number(profile.tier_slot || 9999),
  }
}

function sortRows(a, b) {
  return b.total_points - a.total_points ||
    b.correct_scores - a.correct_scores ||
    b.correct_results - a.correct_results ||
    a.tier_slot - b.tier_slot ||
    String(a.user_id).localeCompare(String(b.user_id))
}

async function closeOneDailyGame(supabase, dailyGame) {
  const roundsResult = await checked('rounds lookup', supabase
    .from('daily_game_fixtures')
    .select('id, options, fixtures(*)')
    .eq('daily_game_id', dailyGame.id))

  const rounds = roundsResult.data || []
  if (!rounds.length) {
    return { dailyGameId: dailyGame.id, skipped: true, reason: 'No fixtures', autoPredictions: 0, players: 0 }
  }

  const profilesResult = await checked('tier profiles lookup', supabase
    .from('user_profiles')
    .select('*')
    .eq('country', dailyGame.country)
    .eq('competition', dailyGame.competition)
    .not('tier_slot', 'is', null))

  const profiles = profilesResult.data || []
  if (!profiles.length) {
    return { dailyGameId: dailyGame.id, skipped: true, reason: 'No profiles', autoPredictions: 0, players: 0 }
  }

  const allRoundIds = rounds.map((round) => round.id)
  const predictionsResult = await checked('predictions lookup', supabase
    .from('predictions')
    .select('*')
    .in('daily_game_fixture_id', allRoundIds))

  const predictionKeys = new Set((predictionsResult.data || []).map((prediction) => predictionKey(prediction.user_id, prediction.daily_game_fixture_id)))
  const autoPredictions = []

  for (const profile of profiles) {
    const level = Number(profile.pyramid_level || 1)
    const seasonLength = tierSeasonLength(level)
    const userRounds = shuffle(rounds, `${dailyGame.seed}:user:${profile.user_id}`).slice(0, seasonLength)

    for (const round of userRounds) {
      const key = predictionKey(profile.user_id, round.id)
      if (predictionKeys.has(key)) continue

      const option = shuffle(round.options || [], `cutoff:${dailyGame.cycle_key || dailyGame.game_date}:${profile.user_id}:${round.id}`)[0]
      if (!option) continue

      autoPredictions.push({
        daily_game_fixture_id: round.id,
        user_id: profile.user_id,
        predicted_home_goals: Number(option.homeGoals),
        predicted_away_goals: Number(option.awayGoals),
        is_auto: true,
        ...scorePoints(round.fixtures, Number(option.homeGoals), Number(option.awayGoals)),
      })
      predictionKeys.add(key)
    }
  }

  for (let index = 0; index < autoPredictions.length; index += 500) {
    await checked('auto predictions upsert', supabase
      .from('predictions')
      .upsert(autoPredictions.slice(index, index + 500), { onConflict: 'daily_game_fixture_id,user_id' }))
  }

  const finalPredictionsResult = await checked('final predictions lookup', supabase
    .from('predictions')
    .select('*')
    .in('daily_game_fixture_id', allRoundIds))

  const predictionByUser = new Map()
  for (const prediction of finalPredictionsResult.data || []) {
    if (!predictionByUser.has(prediction.user_id)) predictionByUser.set(prediction.user_id, new Map())
    predictionByUser.get(prediction.user_id).set(prediction.daily_game_fixture_id, prediction)
  }

  const profilesByTier = new Map()
  for (const profile of profiles) {
    const level = Number(profile.pyramid_level || 1)
    if (!profilesByTier.has(level)) profilesByTier.set(level, [])
    profilesByTier.get(level).push(profile)
  }

  const results = []

  for (const [level, tierProfiles] of profilesByTier.entries()) {
    const tierRows = tierProfiles.map((profile) => {
      const row = rowForProfile(profile)
      const userPredictions = predictionByUser.get(profile.user_id) || new Map()
      const userRounds = shuffle(rounds, `${dailyGame.seed}:user:${profile.user_id}`).slice(0, tierSeasonLength(level))

      for (const round of userRounds) {
        const prediction = userPredictions.get(round.id)
        if (!prediction) continue
        row.total_points += Number(prediction.points || 0)
        row.correct_scores += prediction.exact_score ? 1 : 0
        row.correct_results += prediction.correct_result ? 1 : 0
      }

      return row
    }).sort(sortRows)

    for (const [index, row] of tierRows.entries()) {
      const rank = index + 1
      const movement = movementFor(rank, tierRows.length, level)
      results.push({
        daily_game_id: dailyGame.id,
        user_id: row.user_id,
        total_points: row.total_points,
        correct_scores: row.correct_scores,
        correct_results: row.correct_results,
        rank,
        pyramid_level_before: Number(level),
        pyramid_level_after: nextLevel(level, movement),
        movement,
      })
    }
  }

  for (let index = 0; index < results.length; index += 500) {
    await checked('daily results upsert', supabase
      .from('daily_results')
      .upsert(results.slice(index, index + 500), { onConflict: 'daily_game_id,user_id' }))
  }

  const overallWinner = [...results].sort((a, b) => b.total_points - a.total_points || b.correct_scores - a.correct_scores || b.correct_results - a.correct_results)[0]
  const closeResult = await supabase
    .from('daily_games')
    .update({ status: 'closed', winner_user_id: overallWinner?.user_id || null, closed_at: new Date().toISOString() })
    .eq('id', dailyGame.id)

  if (closeResult.error) throw closeResult.error

  return {
    dailyGameId: dailyGame.id,
    cycleKey: dailyGame.cycle_key || 'daily',
    country: dailyGame.country,
    competition: dailyGame.competition,
    leagueName: dailyGame.league_name,
    autoPredictions: autoPredictions.length,
    players: results.length,
    winnerUserId: overallWinner?.user_id || null,
  }
}

export async function handler(event) {
  try {
    const authError = checkAuthorized(event)
    if (authError) return authError

    const supabase = getSupabase()
    const today = londonDate()
    const previousCycle = previousGameCycle(today)
    const gameDate = event.queryStringParameters?.date || (previousCycle.isTestMode ? previousCycle.gameDate : previousLondonDate())
    const cycleKey = event.queryStringParameters?.cycleKey || (previousCycle.isTestMode ? previousCycle.cycleKey : 'daily')
    const allowToday = event.queryStringParameters?.allowToday === 'true' || previousCycle.isTestMode

    if (gameDate >= today && !allowToday) {
      return json(409, { error: 'Refusing to close today before the day has ended.' })
    }

    let query = supabase
      .from('daily_games')
      .select('*')
      .eq('game_date', gameDate)
      .eq('cycle_key', cycleKey)
      .neq('status', 'closed')

    if (event.queryStringParameters?.country) query = query.eq('country', event.queryStringParameters.country)
    if (event.queryStringParameters?.competition) query = query.eq('competition', event.queryStringParameters.competition)

    const dailyGamesResult = await checked('daily games lookup', query)
    const dailyGames = dailyGamesResult.data || []

    if (!dailyGames.length) {
      return json(200, { gameDate, cycleKey, message: 'No open daily games to close', closedGames: [] })
    }

    const closedGames = []
    for (const dailyGame of dailyGames) {
      closedGames.push(await closeOneDailyGame(supabase, dailyGame))
    }

    return json(200, {
      gameDate,
      cycleKey,
      testMode: previousCycle.isTestMode,
      closedGames,
      autoPredictions: closedGames.reduce((sum, game) => sum + Number(game.autoPredictions || 0), 0),
      players: closedGames.reduce((sum, game) => sum + Number(game.players || 0), 0),
    })
  } catch (error) {
    return json(500, { error: error.message || 'Could not close daily game' })
  }
}
