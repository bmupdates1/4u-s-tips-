const API_BASE_URL = "https://v3.football.api-sports.io";

async function footballRequest(params) {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    throw new Error("FOOTBALL_API_KEY is missing");
  }

  const url = new URL(`${API_BASE_URL}/fixtures`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      "x-apisports-key": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Football API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error("Football API returned an error");
  }

  return data.response || [];
}

export async function getFixtureById(fixtureId) {
  const fixtures = await footballRequest({ id: fixtureId });
  return fixtures[0] || null;
}

export async function getNextFixtures() {
  return footballRequest({
    next: "99",
    timezone: "Africa/Dar_es_Salaam"
  });
}
