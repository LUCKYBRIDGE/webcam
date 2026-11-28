# 놀화상기 (NolVisualizer)

교실용 USB 실물화상기 및 웹캠 프로그램입니다. 카메라 영상은 외부 서버로 전송하지 않습니다.

[놀화상기 공식 웹](https://webcam.knolquiz.com/)은 `production/`의 화면을 사용합니다. `node production/build-worker.mjs`로 화면을 제공하는 Worker 모듈을 출력할 수 있습니다.

## Windows 무설치 EXE
GitHub **Actions → Windows portable EXE → 최신 실행 → Artifacts**에서 ZIP을 내려받아 압축을 풀고 EXE를 실행합니다. 첫 빌드는 GitHub Actions에서 인터넷을 사용하지만, 완성된 프로그램은 인터넷 없이 실행됩니다.

## 기능
카메라 선택, 확대·축소, 영점(중심·배율 초기화), 이동, 캡처, 캡처 화면 필기, 지우개, PNG 저장, 전체화면, 회전, 좌우 반전, 밝기·대비.

## 개발
Node.js 22 이상: `npm install`, `npm start`. Windows 빌드: `npm run dist:win`.

## 참고
카메라는 Windows에서 정상 인식되는 UVC 장치여야 합니다. 자동초점·광학 줌·카메라 하드웨어 영점 보정은 포함되지 않습니다. Windows 보안 경고 및 학교 PC 실행 정책에 따라 무서명 EXE 실행이 제한될 수 있습니다. 실제 교실 장치에서 테스트가 필요합니다.
