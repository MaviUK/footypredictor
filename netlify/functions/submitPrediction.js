import { getSupabase, getUser, scorePoints, json } from './_gameHelpers.js'

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' })
    }

    const supabase = getSupabase()
    const user = await getUser(event, supabase)
    const body = JSON.parse(event.body || '{}')
    const { dailyGameFixtureId, homeGoals, awayGoals } = body

    if (!dailyGameFixtureId || !Number.isInteger(homeGoals) || !Number.isInteger(awayGoals)) {
      return json(400, { error: 'Missing dailyGameFixtureId, homeGoals or awayGoals' })
    }

    const roundResult = await supabase
      .from('daily_game_fixtures')
      .select('id, daily_games(status), fixtures(*)')
      .eq('id', dailyGameFixtureId)
      .single()

    if (roundResult.error) throw roundResult.error
    if (roundResult.data.daily_games.status !== 'open') {
      return json(409, { error: 'This daily game is already closed' })
    }

    const points = scorePoints(roundResult.data.fixtures, homeGoals, awayGoals)
    const insertResult = await supabase
      .from('predictions')
      .insert({
        daily_game_fixture_id: dailyGameFixtureId,
        user_id: user.id,
        predicted_home_goals: homeGoals,
        predicted_away_goals: awayGoals,
        ...points,
      })
      .select('*')
      .single()

    if (insertResult.error?.code === '23505') {
      return json(409, { error: 'You have already predicted this fixture' })
    }

    if (insertResult.error) throw insertResult.error

    return json(200, { prediction: insertResult.data })
  } catch (error) {
    return json(500, { error: error.message })
  }
}
