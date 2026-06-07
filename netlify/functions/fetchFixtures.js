export async function handler(event) {
  try {
    const apiKey = process.env.FOOTBALL_DATA_API_KEY

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing FOOTBALL_DATA_API_KEY' }),
      }
    }

    const competition = event.queryStringParameters?.competition || 'PL'
    const status = event.queryStringParameters?.status || 'SCHEDULED'

    const url = `https://api.football-data.org/v4/competitions/${competition}/matches?status=${status}`

    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': apiKey,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify(data),
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        competition,
        status,
        count: data.count,
        matches: data.matches,
      }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}