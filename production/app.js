'use strict';
const $ = (id) => document.getElementById(id),
  video = $('video'),
  stage = $('stage'),
  ink = $('ink'),
  ctx = ink.getContext('2d'),
  stroke = $('stroke'),
  strokeContext = stroke.getContext('2d'),
  pausedView = $('pausedView'),
  still = $('still');
let stream = null,
  mode = 'move',
  drawing = false,
  prev = null,
  zoom = 1,
  panX = 0,
  panY = 0,
  rot = 0,
  flipX = 1,
  flipY = 1,
  captured = false,
  paused = false,
  pausedFrame = null,
  coverScreen = false;
const status = (t) => ($('status').textContent = t);
const board = window.classroomBoard;
const workspaceUi = window.knolcamWorkspaceUi;
const scenes = {
  camera: { button: 'sceneCamera', label: '카메라', background: '#080a0d', pen: '#ff4141', tool: 'move' },
  chalk: { button: 'sceneChalk', label: '칠판', background: '#183b33', pen: '#f7f6eb', tool: 'pen' },
  white: { button: 'sceneWhite', label: '화이트보드', background: '#fcfbf7', pen: '#182430', tool: 'pen' },
};
let inkViewport = null;
function resize() {
  finishStroke();
  if (!stage.clientWidth || !stage.clientHeight) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const pixelWidth = Math.round(width * devicePixelRatio);
  const pixelHeight = Math.round(height * devicePixelRatio);
  if (inkViewport?.width === width && inkViewport.height === height &&
      ink.width === pixelWidth && ink.height === pixelHeight) return;
  const old = inkViewport ? document.createElement('canvas') : null;
  if (old) Object.assign(old, { width: ink.width, height: ink.height }).getContext('2d').drawImage(ink, 0, 0);
  ink.width = pixelWidth;
  ink.height = pixelHeight;
  if (old) {
    const before = mediaSize(inkViewport.width, inkViewport.height);
    const after = mediaSize(width, height);
    const factor = after.width / before.width;
    const x = (width / 2 + panX - (inkViewport.width / 2 + panX) * factor) * devicePixelRatio;
    const y = (height / 2 + panY - (inkViewport.height / 2 + panY) * factor) * devicePixelRatio;
    ctx.drawImage(old, x, y, inkViewport.width * factor * devicePixelRatio, inkViewport.height * factor * devicePixelRatio);
  }
  inkViewport = { width, height };
  stroke.width = stroke.height = 1;
  board?.resize(ink.width, ink.height);
  update();
}
new ResizeObserver(resize).observe(stage);
function update() {
  const { width, height } = mediaSize();
  if (workspaceUi && !board?.ink && hasFrame())
    [panX, panY] = workspaceUi.limitPan(width, height, zoom, rot, panX, panY);
  const s = stage.style;
  s.setProperty('--x', panX + 'px');
  s.setProperty('--y', panY + 'px');
  s.setProperty('--z', zoom);
  s.setProperty('--r', rot + 'deg');
  s.setProperty('--fx', flipX);
  s.setProperty('--fy', flipY);
  const brightness = $('brightness').value;
  const contrast = $('contrast').value;
  s.setProperty('--preview-filter', Number(brightness) === 1 && Number(contrast) === 1
    ? 'none' : 'brightness(' + brightness + ') contrast(' + contrast + ')');
  workspaceUi?.showZoom(zoom);
  s.setProperty('--media-width', width + 'px');
  s.setProperty('--media-height', height + 'px');
}
const mediaDevices = navigator.mediaDevices;
const cameraButton = $('start');
const centerCameraButton = $('startCenter');
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(navigator.userAgent);
const isMobile = isIos || isAndroid || Boolean(navigator.userAgentData?.mobile);
document.body.toggleAttribute('data-mobile', isMobile);
const deviceSelect = $('devices');
const desktopDeviceSelect = $('desktopDevices');
const desktopPicker = $('desktopCameraPicker');
const cameraCount = $('cameraCount');
const deviceSelectors = [deviceSelect, desktopDeviceSelect].filter(Boolean);
if (!isMobile && desktopPicker) {
  document.body.setAttribute('data-desktop-camera', '');
  desktopPicker.hidden = false;
  $('desktopCameraTitle').hidden = false;
  $('desktopCameraHint').hidden = false;
  $('mobileCameraTitle').hidden = true;
  centerCameraButton.hidden = true;
}
const qualitySelect = $('quality');
const devicePreferenceKey = 'knolcam.camera-device.v1';
const unsupportedCamera =
  '카메라를 사용할 수 없습니다 · HTTPS 주소나 최신 브라우저에서 다시 열어 주세요';
let autoStart = !isMobile;
let cameraRequested = false;
let pageActive = true;
let restorePending = false;
let starting = false;
let cameraAttempt = 0;
let deviceListRequest = 0;
let reconnectTimer = null;
let reconnectAttempts = 0;
let selectedCamera = readCameraPreference();

function readCameraPreference() {
  try {
    return localStorage.getItem(devicePreferenceKey) || '';
  } catch {
    return '';
  }
}

function selectCamera(value) {
  selectedCamera = value;
  for (const select of deviceSelectors) select.value = value;
}

function rememberCamera(value) {
  selectCamera(value);
  try {
    if (selectedCamera) localStorage.setItem(devicePreferenceKey, selectedCamera);
    else localStorage.removeItem(devicePreferenceKey);
  } catch {
    // Storage can be unavailable in private contexts. Keep the selection for this view.
  }
}

function updateCameraButton() {
  const connected = Boolean(stream) && !starting;
  const label = !cameraRequested ? '카메라 시작' : connected ? '카메라 끄기' : '연결 취소';
  cameraButton.textContent = centerCameraButton.textContent = label;
  cameraButton.toggleAttribute('data-requested', cameraRequested);
  cameraButton.disabled = centerCameraButton.disabled = starting && !cameraRequested;
  for (const select of deviceSelectors) select.disabled = starting;
  updateDesktopAutoOption();
  qualitySelect.disabled = starting;
  cameraButton.classList.toggle('active', connected);
}

function updateDesktopAutoOption() {
  const option = desktopDeviceSelect?.options[0];
  if (!option?.dataset.defaultLabel) return;
  const track = stream?.getVideoTracks()[0];
  option.textContent = track?.label ? '자동 · ' + track.label : option.dataset.defaultLabel;
}

async function enumerate() {
  if (!mediaDevices?.enumerateDevices) {
    if (cameraCount) cameraCount.textContent = '카메라 목록을 볼 수 없음';
    return null;
  }
  const request = ++deviceListRequest;
  try {
    const devices = (await mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === 'videoinput',
    );
    if (!pageActive || request !== deviceListRequest) return null;
    const options = devices
      .filter((device) => device.deviceId)
      .map(
        (device, index) =>
          new Option(device.label || '카메라 ' + (index + 1), device.deviceId),
      );
    const count = options.length;
    if (selectedCamera && !options.some(({ value }) => value === selectedCamera)) {
      options.push(new Option('선택한 카메라 (연결 대기)', selectedCamera));
    }
    deviceSelect.replaceChildren(new Option(isMobile ? '자동 · 후면 우선' : '자동 선택', ''), ...options);
    deviceSelect.value = selectedCamera;
    if (desktopPicker && !isMobile) {
      const autoOption = new Option('자동 선택', '');
      autoOption.dataset.defaultLabel = devices.length && !count ? '자동 선택 · 권한 필요' : '자동 선택';
      desktopDeviceSelect.replaceChildren(autoOption, ...options.map(option => option.cloneNode(true)));
      desktopDeviceSelect.value = selectedCamera;
      updateDesktopAutoOption();
      cameraCount.textContent = count ? '기기 ' + count + '대'
        : devices.length ? '권한 허용 후 확인' : '표시할 기기 없음';
    }
    return devices;
  } catch {
    // Camera acquisition remains available even when a browser hides the device list.
    if (request === deviceListRequest && cameraCount) cameraCount.textContent = '카메라 목록을 볼 수 없음';
    return null;
  }
}

function closeStream() {
  const previous = stream;
  stream = null;
  previous?.getTracks().forEach((track) => track.stop());
  video.pause();
  video.srcObject = null;
}

function cancelReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function endCamera(message, clearView = false) {
  cameraRequested = false;
  restorePending = false;
  cameraAttempt += 1;
  cancelReconnect();
  reconnectAttempts = 0;
  closeStream();
  if (clearView) {
    captured = false;
    paused = false;
    pausedFrame = null;
    still.width = still.height = pausedView.width = pausedView.height = 1;
    setMode('move');
    ctx.clearRect(0, 0, ink.width, ink.height);
  }
  refreshView();
  updateCameraButton();
  status(message);
}

function cameraErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '카메라 권한이 차단되었습니다 · 브라우저 사이트 설정 또는 Windows 카메라 접근을 확인해 주세요';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return selectedCamera
        ? '선택한 카메라를 찾을 수 없습니다 · USB를 다시 연결하거나 설정에서 자동 선택을 눌러 주세요'
        : '카메라를 찾을 수 없습니다 · 내장 카메라 설정이나 USB 연결을 확인해 주세요';
    case 'NotReadableError':
    case 'AbortError':
      return '카메라를 시작할 수 없습니다 · 카메라를 사용 중인 다른 앱을 닫고 다시 시도하세요';
    default:
      return '카메라 연결에 실패했습니다 · 연결 상태를 확인하고 다시 시도하세요';
  }
}

function cameraConstraints() {
  const quality = qualitySelect.value;
  if (quality === 'auto') {
    // Probe native QHD before falling back to Full HD.
    return [
      { width: { exact: 2560 }, height: { exact: 1440 } },
      { width: { ideal: 1920 }, height: { ideal: 1080 } },
      { width: { ideal: 1280 }, height: { ideal: 720 } },
      {},
    ];
  }

  const width = Number(quality);
  return [
    {
      width: { ideal: width },
      height: { ideal: Math.round((width * 9) / 16) },
    },
    { width: { ideal: 1280 }, height: { ideal: 720 } },
    { width: { ideal: 640 }, height: { ideal: 480 } },
    {},
  ];
}

function isCurrentAttempt(attempt) {
  return pageActive && cameraRequested && cameraAttempt === attempt;
}

async function requestCamera(selected, attempt) {
  let error;
  const device = selected ? { deviceId: { exact: selected } }
    : isMobile ? { facingMode: { ideal: 'environment' } } : {};
  for (const resolution of cameraConstraints()) {
    if (!isCurrentAttempt(attempt)) return null;
    try {
      return await mediaDevices.getUserMedia({
        audio: false,
        video: { ...resolution, ...device },
      });
    } catch (failure) {
      error = failure;
      if (
        !['OverconstrainedError', 'NotReadableError', 'AbortError'].includes(failure.name)
      ) break;
    }
  }
  throw error;
}

function isUnavailableCamera(error) {
  return ['NotFoundError', 'OverconstrainedError'].includes(error?.name);
}

function isCameraDenied(error) {
  return ['NotAllowedError', 'SecurityError'].includes(error?.name);
}

async function requestSavedOrDefault(selected, attempt) {
  try {
    return await requestCamera(selected, attempt);
  } catch (error) {
    if (!isCurrentAttempt(attempt) || !selected || !isUnavailableCamera(error)) throw error;
    // Keep the saved USB choice for the next launch when it may be connected again.
    selectCamera('');
    status('저장한 카메라가 없습니다 · 기본 카메라 연결 중…');
    return requestCamera('', attempt);
  }
}

function disconnectCamera(track) {
  if (!track || stream?.getVideoTracks()[0] !== track) return;
  closeStream();
  refreshView();
  updateCameraButton();
  status('카메라 연결이 끊어졌습니다 · 재연결 대기 중');
  scheduleReconnect();
}

async function connectCamera({ retrying = false, allowStartupFallback = false } = {}) {
  if (starting || !cameraRequested || !pageActive) return;
  const selected = selectedCamera;
  const attempt = ++cameraAttempt;
  starting = true;
  cancelReconnect();
  closeStream();
  refreshView();
  updateCameraButton();
  status('카메라 연결 중…');
  let next;
  try {
    next = await (allowStartupFallback
      ? requestSavedOrDefault(selected, attempt)
      : requestCamera(selected, attempt));
    if (!isCurrentAttempt(attempt)) {
      next?.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = next;
    video.srcObject = stream;
    await video.play();
    if (!isCurrentAttempt(attempt)) return;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState === 'ended') {
      throw new DOMException('Camera disconnected', 'NotReadableError');
    }
    track.addEventListener('ended', () => {
      disconnectCamera(track);
      void enumerate();
    });
    reconnectAttempts = 0;
    const settings = track.getSettings();
    const connected = selected && !selectedCamera
      ? '저장한 카메라가 없어 기본 카메라 연결됨 · '
      : '연결됨 · ';
    status(
      connected +
        (track.label || '카메라') +
        ' · ' +
        (settings.width || '?') +
        '×' +
        (settings.height || '?'),
    );
    void enumerate();
  } catch (error) {
    if (!isCurrentAttempt(attempt)) {
      if (restorePending && !next && isCameraDenied(error)) {
        endCamera(cameraErrorMessage(error));
      }
      return;
    }
    closeStream();
    const message = next && isCameraDenied(error)
      ? '자동 재생이 차단되었습니다 · 카메라 시작을 눌러 다시 시도하세요'
      : cameraErrorMessage(error);
    if (
      isUnavailableCamera(error) ||
      ((retrying || !next) &&
        ['NotReadableError', 'AbortError'].includes(error?.name))
    ) {
      status(message);
      scheduleReconnect();
    } else {
      endCamera(message);
    }
  } finally {
    starting = false;
    refreshView();
    updateCameraButton();
    if (restorePending) resumeVisibleCamera();
  }
}

function scheduleReconnect() {
  if (!pageActive || !cameraRequested || reconnectTimer !== null || document.hidden) return;
  if (reconnectAttempts >= 5) {
    status('카메라 재연결 대기 중 · USB를 다시 연결하거나 카메라 설정을 확인해 주세요');
    return;
  }
  const delay = Math.min(12000, 1000 * 2 ** reconnectAttempts++);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!document.hidden) return connectCamera({ retrying: true });
  }, delay);
}

function beginCamera(allowStartupFallback = false) {
  autoStart = false;
  if (!mediaDevices?.getUserMedia) {
    status(unsupportedCamera);
    return;
  }
  cameraRequested = true;
  return connectCamera({ allowStartupFallback });
}

function toggleCamera() {
  if (cameraRequested) {
    const connected = Boolean(stream) && !starting;
    endCamera(connected ? '카메라가 종료되었습니다' : '카메라 연결이 취소되었습니다', connected);
    return;
  }
  if (!starting) return beginCamera(true);
}

async function handleDeviceChange() {
  if (document.hidden || !pageActive) return;
  const attempt = cameraAttempt;
  const previous = stream;
  const devices = await enumerate();
  if (
    !cameraRequested || starting || previous !== stream ||
    attempt !== cameraAttempt || document.hidden || !pageActive
  ) return;
  if (!stream) {
    reconnectAttempts = 0;
    return connectCamera({ retrying: true });
  }

  const track = stream.getVideoTracks()[0];
  const activeId = track?.getSettings().deviceId;
  // A list with redacted IDs cannot prove that the active device was removed.
  const devicesIdentified = devices?.every((device) => device.deviceId);
  if (
    track?.readyState === 'ended' ||
    (activeId && devicesIdentified && !devices.some(({ deviceId }) => deviceId === activeId))
  ) {
    disconnectCamera(track);
  }
}

function resumeVisibleCamera() {
  if (!pageActive || document.hidden || starting) return;
  if (autoStart) {
    void beginCamera(true);
  } else if (restorePending) {
    restorePending = false;
    void connectCamera({ retrying: true });
  }
}

function suspendCameraForNavigation(event) {
  pageActive = false;
  deviceListRequest += 1;
  if (!event.persisted) {
    autoStart = false;
    if (cameraRequested) endCamera('카메라가 종료되었습니다', true);
    return;
  }
  if (!cameraRequested) return;
  restorePending = true;
  cameraAttempt += 1;
  cancelReconnect();
  closeStream();
  refreshView();
  updateCameraButton();
  status('카메라 연결을 일시 중지했습니다');
}

function currentSource() {
  return captured ? still : paused && pausedFrame ? pausedFrame : video;
}

function mediaSize(viewWidth = stage.clientWidth, viewHeight = stage.clientHeight) {
  const source = currentSource();
  const width = source.videoWidth || source.width || 1280;
  const height = source.videoHeight || source.height || 720;
  const quarterTurn = rot % 180 !== 0;
  const fit = coverScreen ? Math.max : Math.min;
  const scale = fit(
    viewWidth / (quarterTurn ? height : width),
    viewHeight / (quarterTurn ? width : height),
  );
  return { width: width * scale, height: height * scale };
}

function refreshView() {
  const frozen = captured || paused;
  document.body.setAttribute('data-view', frozen ? 'frozen' : stream ? 'live' : 'empty');
  still.hidden = !captured;
  pausedView.hidden = captured || !paused;
  video.hidden = frozen;
  $('hint').hidden = Boolean(stream || frozen);
  $('pause').textContent = frozen ? '재생' : '일시정지';
  update();
}

function frame() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const c = document.createElement('canvas');
  c.width = Math.round(w * devicePixelRatio);
  c.height = Math.round(h * devicePixelRatio);
  const g = c.getContext('2d');
  g.scale(c.width / w, c.height / h);
  g.fillStyle = scenes[board?.mode || 'camera'].background;
  g.fillRect(0, 0, w, h);
  const boardInk = board?.ink;
  if (boardInk) {
    g.drawImage(boardInk, 0, 0, w, h);
    board.drawText(g, w, h);
    return c;
  }
  const { width, height } = mediaSize();
  g.save();
  g.translate(w / 2 + panX, h / 2 + panY);
  g.scale(zoom, zoom);
  g.rotate((rot * Math.PI) / 180);
  g.scale(flipX, flipY);
  g.filter = 'brightness(' + $('brightness').value + ') contrast(' + $('contrast').value + ')';
  g.drawImage(currentSource(), -width / 2, -height / 2, width, height);
  g.restore();
  g.drawImage(ink, 0, 0, w, h);
  return c;
}

function hasFrame() {
  return stage.clientWidth && stage.clientHeight &&
    (board?.ink || captured || paused || (stream && !starting && video.readyState !== 0 && video.readyState !== 1));
}

function shot() {
  if (board?.ink) return;
  if (!hasFrame()) return status('카메라 영상이 나오면 캡처할 수 있습니다');
  finishStroke();
  const c = frame();
  still.width = c.width;
  still.height = c.height;
  still.getContext('2d').drawImage(c, 0, 0);
  captured = true;
  paused = false;
  pausedFrame = null;
  pausedView.width = pausedView.height = 1;
  panX = panY = 0;
  zoom = 1;
  rot = 0;
  flipX = 1;
  flipY = 1;
  updateFlipButtons();
  coverScreen = false;
  updateFitButton();
  $('brightness').value = $('contrast').value = 1;
  ctx.clearRect(0, 0, ink.width, ink.height);
  setMode('pen');
  refreshView();
  status('캡처 완료 · 필기 후 저장');
}

function save() {
  if (!hasFrame()) return workspaceUi?.notify('저장할 카메라 영상이 아직 없습니다');
  finishStroke();
  frame().toBlob((blob) => {
    if (!blob) return workspaceUi?.notify('이미지를 만들 수 없습니다 · 다시 시도하세요');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '놀캠-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    link.click();
    workspaceUi?.notify('PNG 다운로드를 시작했습니다');
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }, 'image/png');
}

async function live() {
  if (!stream || starting) return status('카메라가 다시 연결되면 재생할 수 있습니다');
  const active = stream;
  try {
    await video.play();
  } catch {
    return status('영상 재생 오류 · 카메라를 다시 연결해 주세요');
  }
  if (stream !== active || !(captured || paused)) return;
  finishStroke();
  if (captured) {
    ctx.clearRect(0, 0, ink.width, ink.height);
    setMode('move');
  }
  captured = false;
  paused = false;
  pausedFrame = null;
  still.width = still.height = pausedView.width = pausedView.height = 1;
  refreshView();
  const track = active.getVideoTracks()[0];
  const { width, height } = track.getSettings();
  status('실시간 · ' + (track.label || '카메라') + ' · ' + (width || '?') + '×' + (height || '?'));
}

function setMode(nextMode) {
  finishStroke();
  board?.cancelTextPlacement();
  mode = nextMode;
  document.body.setAttribute('data-tool', mode);
  for (const id of ['move', 'pen', 'marker'])
    $(id).setAttribute('aria-pressed', String(id === mode));
}

function point(event) {
  const bounds = ink.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) * ink.width) / bounds.width,
    y: ((event.clientY - bounds.top) * ink.height) / bounds.height,
  };
}

function paint(from, to) {
  const size = Number($('size').value) * devicePixelRatio;
  strokeContext.fillStyle = strokeContext.strokeStyle = mode === 'marker' ? '#ffe04d' : $('color').value;
  strokeContext.lineWidth = mode === 'marker' ? Math.max(14 * devicePixelRatio, size * 3) : size;
  strokeContext.lineCap = 'round';
  strokeContext.beginPath();
  if (from === to) {
    strokeContext.arc(to.x, to.y, strokeContext.lineWidth / 2, 0, 2 * Math.PI);
    strokeContext.fill();
    return;
  }
  strokeContext.moveTo(from.x, from.y);
  strokeContext.lineTo(to.x, to.y);
  strokeContext.stroke();
}

function finishStroke(event) {
  if (!drawing || (event && event.pointerId !== drawing)) return;
  drawing = false;
  if (mode === 'move') return;
  const target = board?.ink?.getContext('2d') || ctx;
  target.save();
  target.globalAlpha = mode === 'marker' ? 0.36 : 1;
  target.drawImage(stroke, 0, 0);
  target.restore();
  strokeContext.clearRect(0, 0, stroke.width, stroke.height);
}

let origin = null;
ink.addEventListener('pointerdown', (event) => {
  if (drawing || event.button !== 0 || !hasFrame() || board?.handlePointer(event)) return;
  if (board?.ink && mode === 'move') return;
  drawing = event.pointerId;
  ink.setPointerCapture(event.pointerId);
  prev = point(event);
  origin = { x: event.clientX, y: event.clientY, px: panX, py: panY };
  if (mode === 'move') return;
  if (stroke.width !== ink.width || stroke.height !== ink.height)
    Object.assign(stroke, { width: ink.width, height: ink.height });
  paint(prev, prev);
});
ink.addEventListener('pointermove', (event) => {
  if (drawing !== event.pointerId) return;
  if (mode === 'move') {
    panX = origin.px + event.clientX - origin.x;
    panY = origin.py + event.clientY - origin.y;
    update();
    return;
  }
  const next = point(event);
  paint(prev, next);
  prev = next;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
  ink.addEventListener(type, finishStroke);
cameraButton.onclick = centerCameraButton.onclick = toggleCamera;
function reconnectWithSettings() {
  reconnectAttempts = 0;
  return connectCamera({ retrying: true });
}

for (const select of deviceSelectors) {
  select.onchange = () => {
    rememberCamera(select.value);
    if (!cameraRequested && select === desktopDeviceSelect) return beginCamera();
    return reconnectWithSettings();
  };
}
qualitySelect.onchange = reconnectWithSettings;
workspaceUi?.bindZoom(() => zoom, () => !board?.ink && !drawing && hasFrame(), (scale, x, y) => {
  const ratio = scale / zoom;
  panX = scale === 1 ? 0 : x + (panX - x) * ratio;
  panY = scale === 1 ? 0 : y + (panY - y) * ratio;
  zoom = scale;
  update();
});
$('shot').onclick = shot;
$('save').onclick = save;
$('pen').onclick = () => setMode('pen');
$('move').onclick = () => setMode('move');
$('marker').onclick = () => setMode('marker');
function setScene(next) {
  if (!board || board.mode === next) return;
  finishStroke();
  scenes[board.mode].pen = $('color').value;
  scenes[board.mode].tool = mode;
  board.setMode(next);
  const isCamera = next === 'camera';
  document.body.setAttribute('data-scene', next);
  $('cameraTools').hidden = !isCamera;
  $('settingsBtn').hidden = !isCamera;
  $('textBtn').hidden = isCamera;
  $('move').hidden = !isCamera;
  $('boardLabel').hidden = isCamera;
  $('boardLabel').textContent = scenes[next].label;
  $('clear').textContent = isCamera ? '필기 지우기' : '필기·텍스트 지우기';
  $('clear').title = $('clear').textContent;
  $('color').value = scenes[next].pen;
  for (const [id, scene] of Object.entries(scenes))
    $(scene.button).setAttribute('aria-pressed', String(id === next));
  setMode(scenes[next].tool);
  if (isCamera) update();
  dismissPopovers();
}

for (const [id, scene] of Object.entries(scenes)) $(scene.button).onclick = () => setScene(id);
$('textBtn').onclick = (event) => {
  finishStroke();
  board?.openText(!event || event.detail === 0);
};

function setPopover(id, open) {
  $(id).hidden = !open;
  $(id + 'Btn').setAttribute('aria-expanded', String(open));
  if (open) setPopover(id === 'tools' ? 'settings' : 'tools', false);
}

function dismissPopovers() {
  setPopover('settings', false);
  setPopover('tools', false);
}

$('toolsBtn').onclick = () => setPopover('tools', $('tools').hidden);
$('settingsBtn').onclick = () => setPopover('settings', $('settings').hidden);
document.querySelectorAll('[data-close-panel]').forEach((button) => {
  button.onclick = () => {
    const { closePanel } = button.dataset;
    setPopover(closePanel, false);
    $(closePanel + 'Btn').focus();
  };
});

let toolbarOpen = true;
function toggleToolbar() {
  toolbarOpen = !toolbarOpen;
  $('toolbar').hidden = !toolbarOpen;
  $('toolbarBtn').setAttribute('aria-expanded', String(toolbarOpen));
  $('toolbarBtn').textContent = toolbarOpen ? '도구 접기' : '도구 펴기';
  if ($('toolbar').contains(document.activeElement)) $('toolbarBtn').focus();
  document.body.setAttribute('data-toolbar', toolbarOpen ? 'open' : 'closed');
  dismissPopovers();
}
$('toolbarBtn').onclick = toggleToolbar;

function updateFitButton() {
  $('fit').setAttribute('aria-pressed', String(coverScreen));
  $('fit').textContent = coverScreen ? '영상 전체 보기' : '화면 채우기';
}

$('fit').onclick = () => {
  coverScreen = !coverScreen;
  panX = panY = 0;
  zoom = 1;
  updateFitButton();
  update();
};
$('rotate').onclick = () => {
  rot = (rot + 90) % 360;
  update();
};
function updateFlipButtons() {
  $('flip').setAttribute('aria-pressed', String(flipX < 0));
  $('flipY').setAttribute('aria-pressed', String(flipY < 0));
}
$('flip').onclick = () => {
  flipX *= -1;
  updateFlipButtons();
  update();
};
$('flipY').onclick = () => {
  flipY *= -1;
  updateFlipButtons();
  update();
};
updateFlipButtons();
$('brightness').oninput = $('contrast').oninput = update;
$('full').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen)
      await document.documentElement.requestFullscreen();
    else if (toolbarOpen) toggleToolbar();
  } catch {
    if (toolbarOpen) toggleToolbar();
  }
};

document.addEventListener('fullscreenchange', () => {
  const active = Boolean(document.fullscreenElement);
  $('full').textContent = active ? '전체화면 닫기' : '전체화면';
  $('full').setAttribute('aria-label', $('full').textContent);
  $('full').setAttribute('aria-pressed', String(active));
});

if (isMobile && typeof $('mirrorDialog').showModal === 'function') {
  $('mirrorBtn').hidden = false;
  $('mirrorIos').hidden = !isIos && isAndroid;
  $('mirrorAndroid').hidden = isIos;
  $('mirrorBtn').onclick = () => $('mirrorDialog').showModal();
}

workspaceUi?.bind({
  isBoard: () => Boolean(board?.ink),
  clearDrawing() {
    finishStroke();
    if (board?.ink) board.clear();
    else ctx.clearRect(0, 0, ink.width, ink.height);
  },
  dismissPopovers,
  cancelTextPlacement: () => board?.cancelTextPlacement(),
});
$('pause').onclick = () => {
  if (board?.ink) return;
  if (captured || paused) return live();
  if (!hasFrame()) return status('카메라 영상이 나오면 일시정지할 수 있습니다');
  pausedView.width = video.videoWidth;
  pausedView.height = video.videoHeight;
  pausedView.getContext('2d').drawImage(video, 0, 0);
  pausedFrame = pausedView;
  video.pause();
  paused = true;
  refreshView();
  status('일시정지 · 재생을 누르면 실시간 화면으로 돌아갑니다');
};

video.addEventListener('loadedmetadata', update);
video.addEventListener('resize', update);
video.addEventListener('error', () => {
  if (!starting) disconnectCamera(stream?.getVideoTracks()[0]);
});
mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !pageActive) return;
  if (autoStart || restorePending) resumeVisibleCamera();
  else void handleDeviceChange();
});
window.addEventListener('pagehide', suspendCameraForNavigation);
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  pageActive = true;
  if (autoStart || restorePending) resumeVisibleCamera();
  else if (!document.hidden) void enumerate();
});
void enumerate();
update();
updateCameraButton();
if (autoStart && !document.hidden) void beginCamera(true);
