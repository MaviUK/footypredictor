import { getSupabase, londonDate, shuffle, scorePoints, json } from './_gameHelpers.js'

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

function movementFor(rank, totalPlayers) {
  if (rank <= Math.max(1, Math.floor(totalPlayers * 0.15))) return 'promoted'
  if (rank > Math.max(1, Math.floor(totalPlayers * 0.85))) return 'relegated'
  return 'stayed'
}

export async function handler(event) {
  try {
    const expectedSecret = process.env.CLOSE_DAILY_GAME_SECRET
    const providedSecret = event.headers['x-close-secret'] || event.queryStringParameters?.secret

    if (!expectedSecret) {
      return json(500, { error: 'Missing CLOSE_DAILY_GAME_SECRET. Add this in Netlify before enabling closeout.' })
    }

    if (providedSecret !== expectedSecret) {
      return json(401, { error: 'Unauthorized' })
    }

    const supabase = getSupabase()
    const today = londonDate()
    const gameDate = event.queryStringParameters?.date || previousLondonDate()

    if (gameDate >= today && event.queryStringParameters?.allowToday !== 'true') {
      return json(409, { error: 'Refusing to close today before the day has ended.' })
    }

    const dailyGameResult = await supabase
      .from('daily_games')
      .select('*')
      .eq('game_date', gameDate)
      .maybeSingle()

    if (dailyGameResult.error) throw dailyGameResult.error
    if (!dailyGameResult.data) return json(404, { error: `No daily game found for ${gameDate}` })
    if (dailyGameResult.data.status === 'closed') return json(200, { message: 'Already closed' })

    const roundsResult = await supabase
      .from('daily_game_fixtures')
      .select('id, options, fixtures(*)')
      .eq('daily_game_id', dailyGameResult.data.id)

    if (roundsResult.error) throw roundsResult.error
    if ((roundsResult.data || []).length < 38) return json(409, { error: 'This game does not have 38 fixtures yet.' })

    const profilesResult = await supabase.from('user_profiles').select('*')
    if (profilesResult.error) throw profilesResult.error

    const roundIds = roundsResult.data.map((round) => round.id)
    const predictionsResult = await supabase
      .from('predictions')
      .select('*')
      .in('daily_game_fixture_id', roundIds)

    if (predictionsResult.error) throw predictionsResult.error

    const predictionKeys = new Set(predictionsResult.data.map((prediction) => `${prediction.user_id}:${prediction.daily_game_fixture_id}`))
    const autoPredictions = []

    for (const profile of profilesResult.data) {
      for (const round of roundsResult.data) {
        const key = `${profile.user_id}:${round.id}`
        if (predictionKeys.has(key)) continue
        const [option] = shuffle(round.options, `auto:${gameDate}:${profile.user_id}:${round.id}`)
        autoPredictions.push({
          daily_game_fixture_id: round.id,
          user_id: profile.user_id,
          predicted_home_goals: option.homeGoals,
          predicted_away_goals: option.awayGoals,
          is_auto: true,
          ...scorePoints(round.fixtures, option.homeGoals, option.awayGoals),
        })
      }
    }

    for (let i = 0; i < autoPredictions.length; i += 500) {
      const { error } = await supabase.from('predictions').insert(autoPredictions.slice(i, i + 500))
      if (error) throw error
    }

    const finalPredictionsResult = await supabase
      .from('predictions')
      .select('*')
      .in('daily_game_fixture_id', roundIds)

    if (finalPredictionsResult.error) throw finalPredictionsResult.error

    const totals = new Map()
    for (const prediction of finalPredictionsResult.data) {
      const row = totals.get(prediction.user_id) || {
        user_id: prediction.user_id,
        total_points: 0,
        correct_scores: 0,
        correct_results: 0,
      }
      row.total_points += prediction.points
      row.correct_scores += prediction.exact_score ? 1 : 0
      row.correct_results += prediction.correct_result ? 1 : 0
      totals.set(prediction.user_id, row)
    }

    const ordered = [...totals.values()].sort((a, b) =>
      b.total_points - a.total_points || b.correct_scores - a.correct_scores || b.correct_results - a.correct_results,
    )

    const profileMap = new Map(profilesResult.data.map((profile) => [profile.user_id, profile]))
    const results = ordered.map((row, index) => {
      const rank = index + 1
      const before = profileMap.get(row.user_id)?.pyramid_level || 1
      const movement = movementFor(rank, ordered.length)
      const after = movement === 'promoted' ? Math.max(1, before - 1) : movement === 'relegated' ? before + 1 : before
      return {
        daily_game_id: dailyGameResult.data.id,
        user_id: row.user_id,
        total_points: row.total_points,
        correct_scores: row.correct_scores,
        correct_results: row.correct_results,
        rank,
        pyramid_level_before: before,
        pyramid_level_after: after,
        movement,
      }
    })

    for (let i = 0; i < results.length; i += 500) {
      const { error } = await supabase.from('daily_results').upsert(results.slice(i, i + 500), { onConflict: 'daily_game_id,user_id' })
      if (error) throw error
    }

    for (const result of results) {
      const { error } = await supabase
        .from('user_profiles')
        .update({ pyramid_level: result.pyramid_level_after })
        .eq('user_id', result.user_id)
      if (error) throw error
    }

    const winner = results[0]
    const closeResult = await supabase
      .from('daily_games')
      .update({ status: 'closed', winner_user_id: winner?.user_id, closed_at: new Date().toISOString() })
      .eq('id', dailyGameResult.data.id)

    if (closeResult.error) throw closeResult.error

    return json(200, {
      gameDate,
      autoPredictions: autoPredictions.length,
      players: results.length,
      winnerUserId: winner?.user_id || null,
    })
  } catch (error) {
    return json(500, { error: error.message })
  }
}
