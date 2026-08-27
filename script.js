const DATASETS = [
  { city: "대구", path: "data/daegu/latest.csv" },
  { city: "진주", path: "data/jinju/latest.csv" },
];

const grid = document.querySelector("#weather-grid");
const today = document.querySelector("#today");
const updated = document.querySelector("#updated");

today.textContent = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(new Date());

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = lines.shift().split(",");

  return lines.filter(Boolean).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function safe(value, suffix = "") {
  return value === "" || value == null ? "예보 없음" : `${value}${suffix}`;
}

function formatForecastTime(value) {
  const date = new Date(value);
  return {
    time: new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
    date: new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(date),
  };
}

function weatherSymbol(precipitation) {
  return Number(precipitation) > 0 ? "☂" : "☀";
}

function renderForecast(row) {
  const { time, date } = formatForecastTime(row.forecast_time);
  return `
    <section class="forecast" aria-label="${date} ${time} 예보">
      <div class="forecast-time">
        <strong>${time}</strong>
        <span>${date}</span>
      </div>
      <div>
        <div class="temperature">
          <strong>${safe(row.temperature_2m, "°")}</strong>
          <span>기온</span>
        </div>
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
  const latestTwo = rows.slice(-2);
  const latest = latestTwo.at(-1);

  return `
    <article class="city-card">
      <header class="city-head">
        <div>
          <h2 class="city-name">${latest.location}</h2>
          <p class="city-coordinates">${latest.latitude}° N · ${latest.longitude}° E</p>
        </div>
        <div class="weather-symbol" aria-label="${Number(latest.precipitation) > 0 ? "비" : "맑음"}">
          ${weatherSymbol(latest.precipitation)}
        </div>
      </header>
      <div class="forecast-list">${latestTwo.map(renderForecast).join("")}</div>
    </article>`;
}

async function loadWeather() {
  try {
    const datasets = await Promise.all(
      DATASETS.map(async ({ path }) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${path} 파일을 읽지 못했습니다.`);
        const rows = parseCsv(await response.text());
        if (rows.length < 2) throw new Error(`${path}에 예보 데이터가 부족합니다.`);
        return rows;
      }),
    );

    grid.innerHTML = datasets.map(renderCity).join("");

    const collectedAt = new Date(datasets[0].at(-1).collected_at);
    updated.textContent = `수집 ${new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(collectedAt)}`;
  } catch (error) {
    console.error(error);
    grid.innerHTML = `
      <article class="error-card">
        <strong>날씨 데이터를 표시하지 못했어요.</strong>
        <p>index.html 파일을 직접 열지 말고 로컬 웹 서버를 통해 접속해 주세요.</p>
      </article>`;
    updated.textContent = "데이터를 불러오지 못함";
  }
}

loadWeather();
