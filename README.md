# 진주·대구 날씨 예보 자동 수집

Open-Meteo에서 진주와 대구의 시간별 날씨 및 미세먼지 예보를 수집하여 날짜별 CSV로 저장하는 프로젝트입니다. GitHub Actions가 매일 오전 7시(한국시간)에 프로그램을 실행하고, CSV가 변경된 경우 결과를 저장소에 자동 커밋합니다.

## 수집 위치

| 지역 | 위도 | 경도 | 시간대 |
| --- | ---: | ---: | --- |
| 진주 | 35.19278 | 128.08472 | Asia/Seoul |
| 대구 | 35.87028 | 128.59111 | Asia/Seoul |

위도와 경도는 Open-Meteo Geocoding API에서 대한민국의 행정구역을 확인한 값입니다.

## 수집 항목

| CSV 열 | 의미 | 단위 |
| --- | --- | --- |
| `collected_at` | API 데이터를 수집한 한국 시각 | ISO 8601 |
| `location` | 지역명 | - |
| `latitude` | 요청 지점의 위도 | 도 |
| `longitude` | 요청 지점의 경도 | 도 |
| `forecast_time` | 예보 대상 한국 시각 | ISO 8601 |
| `temperature_2m` | 지상 2m 기온 | °C |
| `relative_humidity_2m` | 지상 2m 상대습도 | % |
| `precipitation` | 직전 1시간의 강수량 합계 | mm |
| `wind_speed_10m` | 지상 10m 풍속 | km/h |
| `pm10` | 지름 10㎛ 이하 미세먼지 농도 | μg/m³ |
| `pm2_5` | 지름 2.5㎛ 이하 초미세먼지 농도 | μg/m³ |

기상 예보는 7일간 총 168시간을 저장합니다. 한국에 적용되는 대기질 모델의 실제 예보 범위가 더 짧으면 뒤쪽 시간대의 `pm10`과 `pm2_5`는 빈 칸으로 남습니다.

## 저장 구조

수집 날짜는 GitHub 실행 환경의 기본 시간이 아니라 `Asia/Seoul`을 기준으로 계산합니다.

```text
data/
├── jinju/
│   ├── jinju_YYYY-MM-DD.csv
│   └── latest.csv
└── daegu/
    ├── daegu_YYYY-MM-DD.csv
    └── latest.csv
```

같은 날짜에 프로그램을 다시 실행하면 행을 누적하지 않고 해당 날짜의 파일을 최신 예보로 교체합니다. 각 지역의 `latest.csv`는 날씨 웹 앱이 사용하는 최신 예보 사본이며 수집할 때마다 함께 갱신됩니다. CSV는 Excel에서 한글을 인식하기 쉽도록 UTF-8 BOM 인코딩으로 저장합니다.

## 날씨 웹 앱

저장소 루트의 `index.html`을 통해 대구와 진주의 최신 시간별 예보 2개를 확인할 수 있습니다. 앱은 각 지역의 `latest.csv`를 읽으므로 매일 자동 수집이 완료되면 별도의 코드 변경 없이 최신 데이터가 반영됩니다.

로컬에서는 파일을 직접 열지 말고 웹 서버로 실행해야 합니다.

```bash
python3 -m http.server 8000
```

실행 후 `http://localhost:8000`에 접속합니다.

## 로컬 실행

Python 3.9 이상이 필요합니다. 외부 Python 패키지는 사용하지 않습니다.

```bash
python3 collect_weather.py
```

성공하면 다음과 같은 메시지가 표시됩니다.

```text
Wrote 168 rows to data/jinju/jinju_YYYY-MM-DD.csv
Wrote 168 rows to data/daegu/daegu_YYYY-MM-DD.csv
```

API 호출 또는 응답 검증에 실패하면 프로그램은 종료 코드 1을 반환합니다. CSV는 임시 파일에 완전히 기록한 뒤 교체하므로, 실패한 실행이 기존 CSV를 불완전한 내용으로 덮어쓰지 않습니다.

## 자동 실행

워크플로 파일은 `.github/workflows/collect-weather.yml`입니다.

- 예약 실행: 매일 `22:00 UTC`
- 한국시간: 다음 날 오전 7시 KST
- 수동 실행: GitHub의 **Actions → Collect weather forecasts → Run workflow**
- 자동 커밋: `data/` 아래 CSV가 변경된 경우에만 수행
- 저장소 권한: 워크플로 작업에 `contents: write` 적용

GitHub Actions의 예약 실행은 서버 부하에 따라 지정된 시각보다 늦게 시작될 수 있습니다. 예약 워크플로는 저장소의 기본 브랜치에 워크플로 파일이 있어야 실행됩니다.

저장소 설정에서 Actions의 쓰기 권한이 차단된 경우 **Settings → Actions → General → Workflow permissions**에서 쓰기 권한을 허용해야 합니다. 브랜치 보호 규칙이 자동 푸시를 막는 저장소에서는 해당 규칙에 맞는 별도 구성이 필요합니다.

## 데이터 사용 시 주의사항

- 이 데이터는 수치예보 모델의 예측값이며 기상 관측소 또는 대기질 측정소의 실측값이 아닙니다.
- 미세먼지 자료는 CAMS(Copernicus Atmosphere Monitoring Service, 코페르니쿠스 대기 모니터링 서비스) 모델을 기반으로 하므로 국내 측정소 자료와 차이가 날 수 있습니다.
- Open-Meteo의 이용 조건과 출처 표시 요건을 실제 사용 목적에 맞게 확인해야 합니다.

## 공식 문서

- [Open-Meteo Weather Forecast API](https://open-meteo.com/en/docs)
- [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api)
- [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- [GitHub Actions 예약 실행](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [GitHub Actions 워크플로 권한](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
