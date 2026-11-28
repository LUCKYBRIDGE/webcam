'use strict';
const $=id=>document.getElementById(id),video=$('video'),stage=$('stage'),ink=$('ink'),ctx=ink.getContext('2d'),still=$('still');let stream=null,mode='move',drawing=false,prev=null,zoom=1,panX=0,panY=0,rot=0,flip=1,captured=false,paused=false,pausedFrame=null;const status=t=>$('status').textContent=t;
function resize(){const old=document.createElement('canvas');old.width=ink.width;old.height=ink.height;old.getContext('2d').drawImage(ink,0,0);ink.width=stage.clientWidth*devicePixelRatio;ink.height=stage.clientHeight*devicePixelRatio;ctx.drawImage(old,0,0,ink.width,ink.height)}new ResizeObserver(resize).observe(stage);
function update(){const s=stage.style;s.setProperty('--x',panX+'px');s.setProperty('--y',panY+'px');s.setProperty('--z',zoom);s.setProperty('--r',rot+'deg');s.setProperty('--fx',flip);s.setProperty('--b',$('brightness').value);s.setProperty('--c',$('contrast').value);$('zoomText').textContent=Math.round(zoom*100)+'%'}
let starting=false,reconnectTimer=null,preferredDevice='',lastDeviceNames=[],reconnectAttempts=0,manualDeviceChange=false;
async function enumerate(){try{const list=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');const old=$('devices').value||preferredDevice;const active=stream?.getVideoTracks()[0]?.getSettings()?.deviceId;const options=[new Option('자동 선택',''),...list.map((d,i)=>new Option(d.label||'카메라 '+(i+1),d.deviceId))];$('devices').replaceChildren(...options);if(list.some(d=>d.deviceId===old))$('devices').value=old;else if(list.some(d=>d.deviceId===active))$('devices').value=active;lastDeviceNames=list.map(d=>d.label||d.deviceId);if(!stream)status(list.length?list.length+'개 카메라 감지 · 카메라 시작을 누르세요':'카메라가 감지되지 않았습니다')}catch(e){status('카메라 목록 오류: '+e.message)}}
const startCenter = $('start-center');
function setCameraStarting(busy) {
  starting = busy;
  $('start').disabled = busy;
  startCenter.disabled = busy;
  startCenter.textContent = busy ? '카메라 연결 중…' : '▶ 카메라 시작';
}

async function start(){if(starting)return;setCameraStarting(true);clearTimeout(reconnectTimer);const selected=manualDeviceChange?$('devices').value:($('devices').value||preferredDevice);manualDeviceChange=false;const quality=$('quality').value;const requested=quality==='auto'?2560:+quality;
// In auto mode, probe exact 2560x1440 first: 'ideal' alone can silently return 1080p.
// Never upscale a 1080p camera and label it 2K.
const candidates=quality==='auto'?
[{width:{exact:2560},height:{exact:1440}},{width:{ideal:1920},height:{ideal:1080}},{width:{ideal:1280},height:{ideal:720}},{}]:
[{width:{ideal:requested},height:{ideal:Math.round(requested*9/16)}},{width:{ideal:1280},height:{ideal:720}},{width:{ideal:640},height:{ideal:480}},{}];const old=stream;stream=null;if(old)old.getTracks().forEach(t=>t.stop());video.pause();video.srcObject=null;let error=null;try{for(const base of candidates){try{const constraints={audio:false,video:{...base,...(selected?{deviceId:{exact:selected}}:{})}};stream=await navigator.mediaDevices.getUserMedia(constraints);break}catch(e){error=e;if(e.name==='OverconstrainedError'||e.name==='NotReadableError'||e.name==='AbortError')continue;if(['NotAllowedError','SecurityError'].includes(e.name))break}}if(!stream&&selected&&['OverconstrainedError','NotFoundError'].includes(error?.name)){status('선택 카메라 설정 재시도 중');stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:{ideal:selected}}})}if(!stream)throw error||new Error('카메라 연결 실패');video.srcObject=stream;await video.play();reconnectAttempts=0;const track=stream.getVideoTracks()[0];track.addEventListener('ended',()=>{if(stream?.getVideoTracks()[0]===track){stream=null;startCenter.hidden=false;status('카메라 연결이 끊어졌습니다 · 재연결 대기');scheduleReconnect();enumerate()}});preferredDevice=track.getSettings().deviceId||selected;captured=false;still.hidden=true;video.hidden=false;startCenter.hidden=true;paused=false;const settings=track.getSettings();status('연결됨 · '+(track.label||'카메라')+' · '+(settings.width||'?')+'×'+(settings.height||'?'));await enumerate()}catch(e){stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;startCenter.hidden=false;status('연결 실패: '+(e?.message||e)+' · 카메라 권한 및 다른 프로그램 사용 여부 확인')}finally{setCameraStarting(false)}}
function scheduleReconnect(){clearTimeout(reconnectTimer);if(reconnectAttempts>=5){status('자동 재연결 실패 · 카메라 시작을 눌러 다시 시도하세요');return}const delay=Math.min(12000,1000*Math.pow(2,reconnectAttempts++));reconnectTimer=setTimeout(async()=>{if(starting||stream)return;await enumerate();await start();if(!stream)scheduleReconnect()},delay)}
function frame(){const w=stage.clientWidth,h=stage.clientHeight,c=document.createElement('canvas');c.width=Math.round(w*devicePixelRatio);c.height=Math.round(h*devicePixelRatio);const g=c.getContext('2d');g.scale(c.width/w,c.height/h);g.fillStyle='#080a0d';g.fillRect(0,0,w,h);const src=captured?still:(paused&&pausedFrame?pausedFrame:video);const sw=src.videoWidth||src.width||1280,sh=src.videoHeight||src.height||720,scale=Math.min(w/sw,h/sh);g.save();g.translate(w/2+panX,h/2+panY);g.scale(zoom*flip,zoom);g.rotate(rot*Math.PI/180);g.filter='brightness('+$('brightness').value+') contrast('+$('contrast').value+')';g.drawImage(src,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);g.restore();g.drawImage(ink,0,0,w,h);return c}
function shot(){if(!stream)return status('카메라를 먼저 연결하세요');const c=frame();still.width=c.width;still.height=c.height;still.getContext('2d').drawImage(c,0,0);captured=true;still.hidden=false;video.hidden=true;panX=panY=0;zoom=1;rot=0;flip=1;$('brightness').value=$('contrast').value=1;update();ctx.clearRect(0,0,ink.width,ink.height);setMode('pen');status('캡처 완료 · 필기 후 저장')}
function save(){if(!stream)return status('카메라를 먼저 연결하세요');frame().toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='놀화상기-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)},'image/png')}
function live(){captured=false;still.hidden=true;video.hidden=false;ctx.clearRect(0,0,ink.width,ink.height);status('실시간 화면')}
function setMode(m){mode=m;for(const id of ['move','pen','eraser'])$(id).classList.toggle('active',id===m);$('tools').classList.toggle('open',m!=='move')}
function point(e){const r=ink.getBoundingClientRect();return{x:(e.clientX-r.left)*ink.width/r.width,y:(e.clientY-r.top)*ink.height/r.height}}
let origin=null;ink.addEventListener('pointerdown',e=>{drawing=true;ink.setPointerCapture(e.pointerId);prev=point(e);origin={x:e.clientX,y:e.clientY,px:panX,py:panY}});ink.addEventListener('pointermove',e=>{if(!drawing)return;if(mode==='move'){panX=origin.px+e.clientX-origin.x;panY=origin.py+e.clientY-origin.y;update();return}const p=point(e);ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(p.x,p.y);ctx.lineWidth=+$('size').value*devicePixelRatio*(mode==='eraser'?5:1);ctx.lineCap='round';ctx.strokeStyle=$('color').value;ctx.globalCompositeOperation=mode==='eraser'?'destination-out':'source-over';ctx.stroke();ctx.globalCompositeOperation='source-over';prev=p});for(const evt of ['pointerup','pointercancel','lostpointercapture'])ink.addEventListener(evt,()=>drawing=false);
$('start').onclick=start;startCenter.onclick=start;$('devices').onchange=()=>{manualDeviceChange=true;preferredDevice='';reconnectAttempts=0;start()};$('quality').onchange=()=>{if(stream)start()};$('plus').onclick=()=>{zoom=Math.min(6,zoom+.25);update()};$('minus').onclick=()=>{zoom=Math.max(1,zoom-.25);update()};$('zero').onclick=()=>{zoom=1;panX=panY=0;update()};$('shot').onclick=shot;$('save').onclick=save;$('live').onclick=live;$('pen').onclick=()=>setMode('pen');$('move').onclick=()=>setMode('move');$('eraser').onclick=()=>setMode('eraser');$('clear').onclick=()=>ctx.clearRect(0,0,ink.width,ink.height);$('toolsBtn').onclick=()=>$('tools').classList.toggle('open');$('settingsBtn').onclick=()=>$('settings').classList.toggle('open');$('rotate').onclick=()=>{rot=(rot+90)%360;update()};$('flip').onclick=()=>{flip*=-1;update()};$('brightness').oninput=$('contrast').oninput=update;$('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();$('hide').onclick=()=>{document.body.classList.toggle('hidebar');$('settings').classList.remove('open')};$('pause').onclick=()=>{if(!stream||captured)return;if(!paused){pausedFrame=document.createElement('canvas');pausedFrame.width=video.videoWidth;pausedFrame.height=video.videoHeight;pausedFrame.getContext('2d').drawImage(video,0,0);video.pause();paused=true}else{video.play();paused=false;pausedFrame=null}status(paused?'화면 일시정지':'실시간 화면')};document.addEventListener('keydown',e=>{if(e.target.matches('input,select'))return;if(e.key==='Escape'){$('settings').classList.remove('open');$('tools').classList.remove('open');document.body.classList.remove('hidebar')}if(e.key.toLowerCase()==='s')save()});video.addEventListener('error',()=>{if(!captured)status('영상 재생 오류 · 카메라 재연결을 시도하세요')});navigator.mediaDevices?.addEventListener('devicechange',async()=>{await enumerate();if(!stream&&!starting){reconnectAttempts=0;scheduleReconnect()}});enumerate();update();

const shortcuts = $('service-shortcuts');
const shortcutsToggle = $('shortcuts-toggle');
const shortcutsPanel = $('shortcuts-panel');
const shortcutNotice = $('shortcut-notice');

function setShortcutsOpen(open) {
  shortcutsPanel.hidden = !open;
  shortcutsToggle.setAttribute('aria-expanded', String(open));
  if (!open) shortcutNotice.textContent = '';
}

shortcutsToggle.addEventListener('click', () => setShortcutsOpen(shortcutsPanel.hidden));
$('story-shortcut').addEventListener('click', () => {
  shortcutNotice.textContent = '놀스토리는 추후 서비스 예정입니다.';
});
document.addEventListener('pointerdown', event => {
  if (shortcutsPanel.hidden || shortcuts.contains(event.target)) return;
  if (shortcutsPanel.contains(document.activeElement)) shortcutsToggle.focus();
  setShortcutsOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || shortcutsPanel.hidden) return;
  shortcutsToggle.focus();
  setShortcutsOpen(false);
});
