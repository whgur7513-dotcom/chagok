# 차곡 · 시간대별 카운터

IFC몰 트래픽조사용 시간대별 남/여 카운터. 정적 파일(HTML/CSS/JS)만으로 동작하며 GitHub Pages로 배포합니다.

- `index.html`, `style.css`, `app.js` — 화면과 카운트, 보고문 생성
- `sync.js` — 전용 링크(`#sync=토큰`) 기반 동기화 (Firebase Realtime Database)
- `config.js` — Firebase 데이터베이스 주소
- `database.rules.json` — 데이터베이스 보안 규칙 (Firebase 콘솔 > Realtime Database > 규칙에 붙여넣기)

전용 링크를 가진 사람은 로그인 없이 같은 기록을 보고 수정할 수 있습니다. 토큰은 저장소에 넣지 않습니다.
