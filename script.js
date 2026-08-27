const LOCATIONS = [
  { city: "진주", latitude: 35.19278, longitude: 128.08472, path: "data/jinju/latest.csv" },
  { city: "대구", latitude: 35.87028, longitude: 128.59111, path: "data/daegu/latest.csv" },
];

const WEATHER_API_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_API_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const REFRESH_INTERVAL = 10 * 60 * 1000;

const grid = document.querySelector("#weather-grid");
const today = document.querySelector("#today");
const updated = document.querySelector("#updated");
const weatherMessage = document.querySelector("#weather-message");

today.textContent = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split(",");
  return lines.filter(Boolean).map((line) => {
    const values = line.split(",");
    const row = {};
    headers.forEach((header, index) => { row[header] = values[index] == null ? "" : values[index]; });
    return row;
  });
}

function safe(value, suffix = "") {
  return value === "" || value == null ? "예보 없음" : `${value}${suffix}`;
}

function formatForecastTime(value) {
  const date = new Date(value);
  return {
    time: new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date),
    date: new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short" }).format(date),
  };
}

function weatherSymbol(precipitation) { return Number(precipitation) > 0 ? "☂" : "☀"; }

function createWeatherMessage(datasets) {
  const summaries = datasets.map((rows) => {
    const current = rows[0];
    const rain = Number(current.precipitation) > 0
      ? `현재 비가 ${current.precipitation}mm 오고 있어요`
      : "현재 비는 오지 않아요";
    return `${current.location}는 ${current.temperature_2m}도이고 ${rain}`;
  });
  return `${summaries.join(" · ")}. 10분마다 새로 알려드릴게요!`;
}

function renderForecast(row) {
  const formatted = formatForecastTime(row.forecast_time);
  return `
    <section class="forecast" aria-label="${formatted.date} ${formatted.time} 예보">
      <div class="forecast-time">
        <strong>${row.is_current ? "현재" : formatted.time}</strong>
        <span>${formatted.date}</span>
      </div>
      <div>
        <div class="temperature"><strong>${safe(row.temperature_2m, "°")}</strong><span>기온</span></div>
        <dl class="metrics">
          <div class="metric"><dt>습도</dt><dd>${safe(row.relative_humidity_2m, "%")}</dd></div>
          <div class="metric"><dt>강수</dt><dd>${safe(row.precipitation, " mm")}</dd></div>
          <div class="metric"><dt>바람</dt><dd>${safe(row.wind_speed_10m, " km/h")}</dd></div>
          <div class="metric"><dt>미세먼지</dt><dd>${safe(row.pm10, " ㎍/㎥")}</dd></div>
        </dl>
      </div>
    </section>`;
}

function renderCity(rows) {
  const current = rows[0];
  return `
    <article class="city-card">
      <header class="city-head">
        <div><h2 class="city-name">${current.location}</h2><p class="city-coordinates">${current.latitude}° N · ${current.longitude}° E</p></div>
        <div class="weather-symbol" aria-label="${Number(current.precipitation) > 0 ? "비" : "맑음"}">${weatherSymbol(current.precipitation)}</div>
      </header>
      <div class="forecast-list">${rows.slice(0, 2).map(renderForecast).join("")}</div>
    </article>`;
}

function buildUrl(baseUrl, params) {
  const query = Object.keys(params).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`).join("&");
  return `${baseUrl}?${query}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`실시간 API 오류: ${response.status}`);
  return response.json();
}

async function fetchLiveLocation(location) {
  const common = { latitude: location.latitude, longitude: location.longitude, timezone: "Asia/Seoul", forecast_hours: 2 };
  const weatherUrl = buildUrl(WEATHER_API_URL, {
    ...common,
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
    hourly: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
  });
  const airUrl = buildUrl(AIR_API_URL, { ...common, current: "pm10,pm2_5", hourly: "pm10,pm2_5" });
  const responses = await Promise.all([fetchJson(weatherUrl), fetchJson(airUrl)]);
  const weather = responses[0];
  const air = responses[1];
  if (!weather.current || !weather.hourly || !air.current || !air.hourly) throw new Error("실시간 API 응답에 필요한 값이 없습니다.");

  const current = {
    collected_at: new Date().toISOString(), location: location.city, latitude: location.latitude, longitude: location.longitude,
    forecast_time: weather.current.time, temperature_2m: weather.current.temperature_2m,
    relative_humidity_2m: weather.current.relative_humidity_2m, precipitation: weather.current.precipitation,
    wind_speed_10m: weather.current.wind_speed_10m, pm10: air.current.pm10, pm2_5: air.current.pm2_5, is_current: true,
  };
  const nextIndex = weather.hourly.time.findIndex((time) => time > weather.current.time);
  const index = nextIndex === -1 ? 0 : nextIndex;
  const airIndex = air.hourly.time.indexOf(weather.hourly.time[index]);
  const next = {
    collected_at: current.collected_at, location: location.city, latitude: location.latitude, longitude: location.longitude,
    forecast_time: weather.hourly.time[index], temperature_2m: weather.hourly.temperature_2m[index],
    relative_humidity_2m: weather.hourly.relative_humidity_2m[index], precipitation: weather.hourly.precipitation[index],
    wind_speed_10m: weather.hourly.wind_speed_10m[index], pm10: airIndex >= 0 ? air.hourly.pm10[airIndex] : "",
    pm2_5: airIndex >= 0 ? air.hourly.pm2_5[airIndex] : "", is_current: false,
  };
  return [current, next];
}

async function loadFallbackData() {
  return Promise.all(LOCATIONS.map(async (location) => {
    const response = await fetch(`${location.path}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${location.path} 파일을 읽지 못했습니다.`);
    const rows = parseCsv(await response.text());
    if (rows.length < 2) throw new Error(`${location.path}에 예보 데이터가 부족합니다.`);
    return rows.slice(-2);
  }));
}

async function loadWeather() {
  updated.textContent = "실시간 날씨 확인 중";
  try {
    let datasets;
    let isLive = true;
    try {
      datasets = await Promise.all(LOCATIONS.map(fetchLiveLocation));
    } catch (liveError) {
      console.warn("실시간 API 대신 저장된 예보를 사용합니다.", liveError);
      datasets = await loadFallbackData();
      isLive = false;
    }
    grid.innerHTML = datasets.map(renderCity).join("");
    weatherMessage.textContent = createWeatherMessage(datasets);
    const time = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    updated.textContent = `${isLive ? "실시간" : "저장된 예보"} · ${time} 갱신`;
  } catch (error) {
    console.error(error);
    grid.innerHTML = `<article class="error-card"><strong>날씨 데이터를 표시하지 못했어요.</strong><p>인터넷 연결을 확인한 뒤 페이지를 새로고침해 주세요.</p></article>`;
    updated.textContent = "데이터를 불러오지 못함";
    weatherMessage.textContent = "날씨 정보를 가져오지 못했어요. 잠시 후 다시 확인해 주세요.";
  }
}

loadWeather();
setInterval(loadWeather, REFRESH_INTERVAL);
