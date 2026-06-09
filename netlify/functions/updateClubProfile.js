import { getSupabase, getUser, json } from './_gameHelpers.js'

function cleanClubName(value, fallback) {
  return String(value || fallback || 'My Club')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 40) || 'My Club'
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

    const supabase = getSupabase()
    const user = await getUser(event, supabase)
    const body = JSON.parse(event.body || '{}')
    const clubName = cleanClubName(body.clubName, user.user_metadata?.username)

    const updateResult = await supabase
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        email: user.email,
        club_name: clubName,
        ...(body.badgeUrl ? { badge_url: String(body.badgeUrl).slice(0, 500) } : {}),
        ...(body.badgePath ? { badge_path: String(body.badgePath).slice(0, 500) } : {}),
      }, { onConflict: 'user_id' })
      .select('club_name, badge_url, badge_path')
      .single()

    if (updateResult.error) throw updateResult.error

    return json(200, {
      clubName: updateResult.data.club_name,
      badgeUrl: updateResult.data.badge_url,
      badgePath: updateResult.data.badge_path,
    })
  } catch (error) {
    return json(500, { error: error.message || 'Could not update club profile' })
  }
}
