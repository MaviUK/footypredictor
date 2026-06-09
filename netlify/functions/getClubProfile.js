import { getSupabase, getUser, json } from './_gameHelpers.js'

function emptyStats() {
  return {
    seasonsPlayed: 0,
    totalPlayed: 0,
    totalWins: 0,
    totalDraws: 0,
    totalLosses: 0,
    totalPoints: 0,
    winPercentage: 0,
    drawPercentage: 0,
    lossPercentage: 0,
    longestWinningStreak: 0,
    longestDrawStreak: 0,
    longestLosingStreak: 0,
    bestSeason: null,
    worstSeason: null,
  }
}

function resultCode(prediction) {
  if (prediction.exact_score) return 'W'
  if (prediction.correct_result) return 'D'
  return 'L'
}

function longestRun(results, target) {
  let current = 0
  let best = 0
  for (const result of results) {
    if (result === target) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

function pct(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0
}

function seasonLabel(game) {
  return game?.seasons?.display_name || game?.league_name || game?.game_date || 'Season'
}

export async function handler(event) {
  try {
    const supabase = getSupabase()
    const user = await getUser(event, supabase)

    const profileResult = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileResult.error) throw profileResult.error

    const profile = profileResult.data || {}
    const predictionsResult = await supabase
      .from('predictions')
      .select('points, exact_score, correct_result, created_at, daily_game_fixtures(round_number, daily_games(id, game_date, league_name, seasons(display_name)))')
      .eq('user_id', user.id)
      .eq('is_auto', false)
      .order('created_at')

    if (predictionsResult.error) throw predictionsResult.error

    const predictions = predictionsResult.data || []
    const stats = emptyStats()
    const allResults = []
    const seasons = new Map()

    for (const prediction of predictions) {
      const fixture = prediction.daily_game_fixtures || {}
      const game = fixture.daily_games || {}
      const gameId = game.id || 'unknown'
      const code = resultCode(prediction)

      if (!seasons.has(gameId)) {
        seasons.set(gameId, {
          id: gameId,
          label: seasonLabel(game),
          gameDate: game.game_date,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          results: [],
        })
      }

      const row = seasons.get(gameId)
      row.played += 1
      row.points += Number(prediction.points || 0)
      row.results.push(code)

      if (code === 'W') row.wins += 1
      else if (code === 'D') row.draws += 1
      else row.losses += 1

      allResults.push(code)
    }

    const seasonRows = [...seasons.values()].map((season) => ({
      ...season,
      winPercentage: pct(season.wins, season.played),
      drawPercentage: pct(season.draws, season.played),
      lossPercentage: pct(season.losses, season.played),
      longestWinningStreak: longestRun(season.results, 'W'),
      longestDrawStreak: longestRun(season.results, 'D'),
      longestLosingStreak: longestRun(season.results, 'L'),
    })).sort((a, b) => String(b.gameDate || '').localeCompare(String(a.gameDate || '')))

    stats.seasonsPlayed = seasonRows.length
    stats.totalPlayed = predictions.length
    stats.totalPoints = predictions.reduce((sum, prediction) => sum + Number(prediction.points || 0), 0)
    stats.totalWins = allResults.filter((result) => result === 'W').length
    stats.totalDraws = allResults.filter((result) => result === 'D').length
    stats.totalLosses = allResults.filter((result) => result === 'L').length
    stats.winPercentage = pct(stats.totalWins, stats.totalPlayed)
    stats.drawPercentage = pct(stats.totalDraws, stats.totalPlayed)
    stats.lossPercentage = pct(stats.totalLosses, stats.totalPlayed)
    stats.longestWinningStreak = longestRun(allResults, 'W')
    stats.longestDrawStreak = longestRun(allResults, 'D')
    stats.longestLosingStreak = longestRun(allResults, 'L')
    stats.bestSeason = seasonRows.length ? [...seasonRows].sort((a, b) => b.points - a.points || b.wins - a.wins)[0] : null
    stats.worstSeason = seasonRows.length ? [...seasonRows].sort((a, b) => a.points - b.points || a.losses - b.losses)[0] : null

    return json(200, {
      profile: {
        email: profile.email || user.email,
        username: profile.username || user.user_metadata?.username,
        clubName: profile.club_name || profile.username || user.user_metadata?.username || 'My Club',
        badgeUrl: profile.badge_url || '',
        country: profile.country,
        competition: profile.competition,
        leagueName: profile.league_name,
        tierName: profile.tier_name,
        tierSlot: profile.tier_slot,
      },
      stats,
      seasons: seasonRows,
    })
  } catch (error) {
    return json(500, { error: error.message || 'Could not load club profile' })
  }
}
