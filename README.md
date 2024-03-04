# [ChaosRat - 방송 채팅 오버레이](https://chaosrat.update.sh/)

ChaosRat은 [OBS Studio](https://obsproject.com/)와 같은 방송 소프트웨어에 사용할 수 있는 채팅 오버레이입니다.

## 주요 기능

- 다중 플랫폼 지원
  - 현재 [치지직(Chzzk)](https://chzzk.naver.com/), [트위치(Twitch)](https://www.twitch.tv/), [유튜브 라이브(Youtube Live)](https://www.youtube.com/live) 채팅을 지원합니다.
- 유저 뱃지 지원
  - 플랫폼에 따라 다른 유저 뱃지를 표시합니다.
- 이모티콘 지원
  - 각 플랫폼별 채팅에 포함된 이모티콘을 표시합니다.
- 스티커 지원
  - 플랫폼과 별개로 채팅에 포함된 스티커(디시콘)를 표시합니다.
- 테마 지원
  - 사용자가 원하는 테마를 선택할 수 있습니다.
- 채팅 필터링
  - 유저명, 메시지 내용을 정규표현식(RegExp)을 사용하여 필터링할 수 있습니다.
- 채팅 효과음
  - 새로운 채팅이 올라올 때마다 효과음을 재생할 수 있습니다.
- 명령어 지원
  - `!!clear`, `!!클리어` 명령어를 사용하여 채팅을 지울 수 있습니다.
  - `!!set theme video-master` 등의 명령어로 설정을 실시간으로 변경할 수 있습니다.
- 개발자 친화적
  - Nuxt3를 사용하여 프론트엔드와 백엔드를 동시에 개발할 수 있습니다.
  - 플랫폼 연결, 스티커, 테마 등을 모듈화하여 쉽게 추가할 수 있습니다.
  - [도커(Docker)](https://www.docker.com/)를 사용해 빠르게 개발 환경을 구축하고 배포할 수 있습니다.

아래 기능은 아직 지원 예정이 없습니다. 추후 요청이 있을 경우 추가될 수 있습니다.

- 후원 메시지 표시

## 사용 방법

[ChaosRat](https://chaosrat.update.sh/)에 접속하여 간단한 설정을 통해 채팅 오버레이 URL을 생성할 수 있습니다.

생성한 URL을 OBS Studio의 브라우저 소스에 입력하여 사용하시면 됩니다.

## 개발

직접 서버를 호스팅하거나 개발하고 싶다면 다음과 같이 실행할 수 있습니다.

이 저장소를 클론한 후 다음 명령어를 실행하여 서버를 시작할 수 있습니다.
기본 주소는 `http://localhost:3000`입니다.

```bash
docker-compose up
```

트위치 연동을 위해서는 [Twitch Developers](https://dev.twitch.tv/)에서 애플리케이션을 등록하고 클라이언트 ID와 클라이언트 시크릿을 발급받아야 합니다.

발급받은 클라이언트 ID와 클라이언트 시크릿을 `docker-compose.yml` 파일의 `NUXT_TWITCH_CLIENT_ID`와 `NUXT_TWITCH_CLIENT_SECRET`에 입력해주세요.

## License

MIT License
