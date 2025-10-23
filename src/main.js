import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';
import OnlineService from './net/online.js';

// Phaser 全局通过 <script> 引入，模块中可直接访问 window.Phaser

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0b0b16',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 720,
    height: 720,
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

// 联机服务（按需初始化）
let online = null;
let myPlayer = null; // 1=黑, 2=白
let currentVersion = 0;

// ————— DOM 侧边栏联动 —————
const statusEl = document.getElementById('status');
const currPlayerEl = document.getElementById('currPlayer');
const turnEl = document.getElementById('turn');
const toastEl = document.getElementById('toast');
const onlineStatusEl = document.getElementById('online-status');
const onlineRoleEl = document.getElementById('online-role');
const roomInputEl = document.getElementById('room-id-input');
const btnCreateRoom = document.getElementById('create-room-btn');
const btnJoinRoom = document.getElementById('join-room-btn');
const btnCopyLink = document.getElementById('copy-link-btn');
const btnLeave = document.getElementById('leave-room-btn');

const domSkills = {
  'flying-sand': document.getElementById('skill-flying'),
  'mountain-power': document.getElementById('skill-mountain'),
  'still-water': document.getElementById('skill-water'),
  'polarity-reverse': document.getElementById('skill-polarity'),
  'tiger-trap': document.getElementById('skill-tiger'),
  'water-drop': document.getElementById('skill-drop'),
  'resurrection': document.getElementById('skill-resurrection'),
  'clean-sweep': document.getElementById('skill-clean'),
};

function setToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg || '';
  if (!msg) return;
  toastEl.style.opacity = '1';
  // 简单淡出
  setTimeout(() => {
    toastEl && (toastEl.style.opacity = '0.2');
  }, 2200);
}

function updateSidebar(state) {
  if (!state) return;
  const { turn, currentPlayer, skills, message } = state;
  if (turnEl) turnEl.textContent = String(turn);
  if (currPlayerEl) currPlayerEl.textContent = currentPlayer === 1 ? '● 黑' : '○ 白';

  // 更新技能按钮
  if (skills && Array.isArray(skills)) {
    for (const k in domSkills) {
      const el = domSkills[k];
      if (!el) continue;
      const data = skills.find(s => s.id === k);
      const cdEl = el.querySelector('[data-cd]');
      const onCd = data && data.cd > 0;
      if (cdEl) cdEl.textContent = onCd ? `CD ${data.cd}` : '';
      el.classList.toggle('skill-disabled', !!onCd);
    }
  }

  if (message) setToast(message);
}

function setOnlineStatus(msg) {
  if (onlineStatusEl) onlineStatusEl.textContent = msg || '';
}

function setOnlineRole(player) {
  if (!onlineRoleEl) return;
  if (!player) { onlineRoleEl.textContent = ''; return; }
  onlineRoleEl.textContent = `你是 ${player === 1 ? '● 黑' : '○ 白'}`;
}

// 订阅游戏事件
if (statusEl) {
  game.events.on('ready', () => (statusEl.textContent = 'Ready'));
  game.events.on('error', (e) => (statusEl.textContent = `Error: ${e?.message || e}`));
}

game.events.on('ui-state', updateSidebar);

game.events.on('ui-feedback', (res) => {
  if (!res?.ok) setToast(res.message || '技能失败');
});

game.events.on('game-over', ({ winner }) => {
  setToast(`玩家 ${winner === 1 ? '● 黑' : '○ 白'} 获胜！`);
});

// 技能按钮 -> 发到 GameScene
for (const [id, el] of Object.entries(domSkills)) {
  el?.addEventListener('click', () => {
    const gs = game.scene.getScene('GameScene');
    if (gs) gs.events.emit('use-skill', id);
  });
}

// 重新开始按钮
const restartBtn = document.getElementById('restart-btn');
restartBtn?.addEventListener('click', () => {
  const gs = game.scene.getScene('GameScene');
  if (gs) gs.restartGame();
});

// 游戏重启时重置 UI
game.events.on('game-restart', () => {
  if (toastEl) toastEl.textContent = '';
  updateSidebar({ turn: 1, currentPlayer: 1, skills: [], message: '游戏已重置' });
});

// ——— 联机集成 ———
async function ensureOnline() {
  if (online) return true;
  online = new OnlineService(window.FIREBASE_CONFIG);
  const res = await online.init();
  if (!res.ok) { setOnlineStatus(res.message || '联机不可用'); return false; }
  online.onStatus(setOnlineStatus);
  online.onState(({ version, state }) => {
    currentVersion = version || 0;
    const gs = game.scene.getScene('GameScene');
    if (gs && state) gs.loadState(state);
  });
  return true;
}

btnCreateRoom?.addEventListener('click', async () => {
  if (!(await ensureOnline())) return;
  const gs = game.scene.getScene('GameScene');
  const initial = gs?.toJSON ? gs.toJSON() : null;
  const res = await online.createRoom(initial);
  if (res.ok) {
    myPlayer = res.player;
    setOnlineRole(myPlayer);
    roomInputEl && (roomInputEl.value = res.roomId);
  } else setOnlineStatus(res.message || '创建失败');
});

btnJoinRoom?.addEventListener('click', async () => {
  if (!(await ensureOnline())) return;
  const roomId = (roomInputEl?.value || '').trim();
  if (!roomId) { setOnlineStatus('请输入房间ID'); return; }
  const res = await online.joinRoom(roomId);
  if (res.ok) { myPlayer = res.player; setOnlineRole(myPlayer); }
  else setOnlineStatus(res.message || '加入失败');
});

btnCopyLink?.addEventListener('click', async () => {
  const id = roomInputEl?.value?.trim();
  if (!id) return;
  const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(id)}`;
  try { await navigator.clipboard.writeText(url); setToast('已复制邀请链接'); } catch {}
});

btnLeave?.addEventListener('click', () => {
  online?.leaveRoom();
  myPlayer = null; currentVersion = 0;
  setOnlineRole(null); setOnlineStatus('未连接');
});

// 当游戏状态变化时，尝试发布到房间（需要保证已连接）
game.events.on('ready', async () => {
  // 自动根据 ?room= 加入
  const params = new URLSearchParams(location.search);
  const room = params.get('room');
  if (room) {
    if (await ensureOnline()) {
      roomInputEl && (roomInputEl.value = room);
      const res = await online.joinRoom(room);
      if (res.ok) { myPlayer = res.player; setOnlineRole(myPlayer); }
    }
  }
});

function tryPublishState(state) {
  if (!online || !online.getRoomId()) return;
  // 仅由当前回合的玩家发布状态
  if (myPlayer && state.currentPlayer !== myPlayer) return;
  online.publishState(state, currentVersion).then((res) => {
    if (!res.ok) {
      // 版本冲突或其他失败，忽略，让快照同步覆盖
    }
  });
}

const gs = game.scene.getScene('GameScene');
game.events.on('sceneawake', () => {});
// 监听状态变化
game.scene.getScene('GameScene')?.events.on('state-changed', (state) => tryPublishState(state));

// Fallback: 若上面行在场景尚未创建时未绑定，则延迟绑定
setTimeout(() => {
  const g = game.scene.getScene('GameScene');
  g?.events.on('state-changed', (state) => tryPublishState(state));
}, 600);
