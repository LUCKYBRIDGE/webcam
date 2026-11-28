'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    document.body.setAttribute('data-offline', '');
  }
  const stage = byId('stage');
  const guide = byId('help');
  const guideHeader = guide.querySelector('.guide-header');
  const clearDialog = byId('clearDialog');
  let noticeTimer;
  const minZoom = 1;
  const maxZoom = 6;
  const zoomSlider = byId('zoomSlider');
  const zoomIn = byId('plus');
  const zoomOut = byId('minus');

  function showZoom(scale) {
    const percent = Math.round(scale * 100);
    const label = percent + '%';
    const output = byId('zoomText');
    if (output.textContent !== label) output.textContent = label;
    if (Number(zoomSlider.value) !== percent) zoomSlider.value = String(percent);
    zoomIn.disabled = scale >= maxZoom;
    zoomOut.disabled = scale <= minZoom;
  }

  function limitPan(width, height, scale, rotation, x, y) {
    const rotated = rotation % 180 !== 0;
    const maxX = Math.max(0, ((rotated ? height : width) * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, ((rotated ? width : height) * scale - stage.clientHeight) / 2);
    return [Math.max(-maxX, Math.min(x, maxX)) || 0, Math.max(-maxY, Math.min(y, maxY)) || 0];
  }

  function bindZoom(readZoom, canZoom, applyZoom) {
    function setZoom(value, x = 0, y = 0) {
      if (!Number.isFinite(value)) return;
      applyZoom(Math.max(minZoom, Math.min(value, maxZoom)), x, y);
    }

    zoomIn.onclick = () => setZoom(readZoom() + 0.25);
    zoomOut.onclick = () => setZoom(readZoom() - 0.25);
    byId('zero').onclick = () => setZoom(minZoom);
    zoomSlider.oninput = () => setZoom(Number(zoomSlider.value) / 100);
    stage.addEventListener('wheel', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey ||
          Math.abs(event.deltaX || 0) > Math.abs(event.deltaY) || !event.deltaY || !canZoom()) return;
      event.preventDefault();
      const bounds = stage.getBoundingClientRect();
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
      setZoom(
        readZoom() * Math.exp(-event.deltaY * deltaScale / 550),
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2,
      );
    }, { passive: false });
  }

  const shortcuts = new Map([
    ['KeyX', 'flip'], ['KeyY', 'flipY'],
    ['Space', 'pause'], ['KeyC', 'shot'], ['KeyS', 'save'], ['KeyP', 'pen'],
    ['KeyH', 'marker'], ['KeyM', 'move'], ['KeyG', 'fit'], ['KeyF', 'full'],
    ['KeyT', 'toolbarBtn'], ['NumpadAdd', 'plus'], ['KeyN', 'textBtn'], ['KeyR', 'timerBtn'],
    ['Digit1', 'sceneCamera'], ['Digit2', 'sceneChalk'], ['Digit3', 'sceneWhite'],
    ['Numpad1', 'sceneCamera'], ['Numpad2', 'sceneChalk'], ['Numpad3', 'sceneWhite'],
    ['Minus', 'minus'], ['NumpadSubtract', 'minus'], ['Digit0', 'zero'], ['Numpad0', 'zero'],
  ]);

  const cameraOnly = new Set(['pause', 'shot', 'move', 'flip', 'flipY', 'fit', 'plus', 'minus', 'zero']);

  function notify(message) {
    const notice = byId('saveNotice');
    clearTimeout(noticeTimer);
    notice.textContent = message;
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, 2800);
  }

  function bind({ isBoard, clearDrawing, dismissPopovers, cancelTextPlacement }) {
    byId('clear').onclick = () => {
      clearDialog.returnValue = '';
      byId('clearMessage').textContent = isBoard()
        ? '현재 판서 화면의 필기와 텍스트를 모두 지웁니다.'
        : '화면 위에 추가한 필기를 지웁니다.';
      clearDialog.showModal();
    };
    clearDialog.addEventListener('submit', (event) => {
      if (event.submitter?.value === 'clear') clearDrawing();
    });

    const services = byId('serviceLinks');
    const servicesButton = byId('servicesBtn');
    const servicesPanel = byId('servicesPanel');
    const storyNotice = byId('storyNotice');
    function setServicesOpen(open) {
      servicesPanel.hidden = !open;
      servicesButton.setAttribute('aria-expanded', String(open));
      if (!open) storyNotice.textContent = '';
    }
    servicesButton.onclick = () => setServicesOpen(servicesPanel.hidden);
    byId('storyLink').onclick = () => { storyNotice.textContent = '놀스토리는 추후 서비스 예정입니다.'; };
    document.addEventListener('pointerdown', (event) => {
      if (!servicesPanel.hidden && !services.contains(event.target)) {
        if (servicesPanel.contains(document.activeElement)) servicesButton.focus();
        setServicesOpen(false);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !servicesPanel.hidden) {
        servicesButton.focus();
        setServicesOpen(false);
      }
    });

    byId('helpBtn').onclick = () => {
      guide.showModal();
      guide.scrollTop = 0;
    };
    guide.addEventListener('click', (event) => {
      const topic = event.target.closest('[data-help-topic]');
      if (!topic) return;
      const section = byId(topic.dataset.helpTopic);
      section.focus({ preventScroll: true });
      const headingTop = section.getBoundingClientRect().top;
      const panelTop = guide.getBoundingClientRect().top + guide.clientTop;
      guide.scrollTop += headingTop - panelTop - guideHeader.offsetHeight - 8;
    });

    stage.addEventListener('pointerdown', (event) => {
      dismissPopovers();
      if (event.target.closest('button')) return;
      if (!byId('boardTextDialog').open) stage.focus({ preventScroll: true });
    });
    document.addEventListener('click', (event) => {
      if (event.detail > 0 && event.target.closest('[data-stage-focus]'))
        stage.focus({ preventScroll: true });
    });
    document.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || guide.open || byId('boardTextDialog').open || clearDialog.open || byId('mirrorDialog').open ||
          event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest?.('#timerPanel')) return;
      if (event.key === 'Escape') {
        cancelTextPlacement();
        dismissPopovers();
        return;
      }
      if (event.target.matches('input,select,textarea,[contenteditable]') ||
          (event.code === 'Space' && event.target.closest?.('button'))) return;
      const id = event.key === '+' || event.key === '=' ? 'plus'
        : event.key === '?' ? 'helpBtn' : shortcuts.get(event.code);
      if (/^Numpad[0-3]$/.test(event.code) && !/^[0-3]$/.test(event.key)) return;
      if (!id || (isBoard() ? cameraOnly.has(id) : id === 'textBtn')) return;
      event.preventDefault();
      if (!event.repeat || id === 'plus' || id === 'minus') byId(id).click();
    });
  }

  window.knolcamWorkspaceUi = { bind, notify, bindZoom, showZoom, limitPan };
})();
