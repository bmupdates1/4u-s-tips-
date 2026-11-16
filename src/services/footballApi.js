const API_BASE_URL = "https://v3.football.api-sports.io";

async function footballRequest(params) {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    throw new Error("FOOTBALL_API_KEY is missing in Render");
  }

  const url = new URL(`${API_BASE_URL}/fixtures`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify(data.errors || data)}`
    );
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(JSON.stringify(data.errors));
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
