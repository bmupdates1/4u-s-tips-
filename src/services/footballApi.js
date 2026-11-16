
const API_BASE_URL = "https://v3.football.api-sports.io";
const TIMEZONE = "Africa/Dar_es_Salaam";

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

function getTanzaniaDate(offsetDays = 0) {
  const now = new Date();

  const dateInTanzania = new Date(
    now.toLocaleString("en-US", { timeZone: TIMEZONE })
  );

  dateInTanzania.setDate(dateInTanzania.getDate() + offsetDays);

  const year = dateInTanzania.getFullYear();
  const month = String(dateInTanzania.getMonth() + 1).padStart(2, "0");
  const day = String(dateInTanzania.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function getFixtureById(fixtureId) {
  const fixtures = await footballRequest({ id: fixtureId });
  return fixtures[0] || null;
}

export async function getNextFixtures() {
  const today = getTanzaniaDate(0);
  const tomorrow = getTanzaniaDate(1);

  const [todayFixtures, tomorrowFixtures] = await Promise.all([
    footballRequest({
      date: today,
      timezone: TIMEZONE
    }),
    footballRequest({
      date: tomorrow,
      timezone: TIMEZONE
    })
  ]);

  const allFixtures = [...todayFixtures, ...tomorrowFixtures];

  const uniqueFixtures = [
    ...new Map(
      allFixtures.map(fixture => [fixture.fixture.id, fixture])
    ).values()
  ];

  return uniqueFixtures;
}
