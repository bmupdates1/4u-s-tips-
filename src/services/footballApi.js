const API_BASE_URL = "https://v3.football.api-sports.io";

export async function getFixtureById(fixtureId) {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    throw new Error("FOOTBALL_API_KEY is missing");
  }

  if (!fixtureId) {
    throw new Error("Fixture ID is required");
  }

  const response = await fetch(
    `${API_BASE_URL}/fixtures?id=${encodeURIComponent(fixtureId)}`,
    {
      method: "GET",
      headers: {
        "x-apisports-key": apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Football API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error("Football API returned an error");
  }

  return data.response?.[0] || null;
}
