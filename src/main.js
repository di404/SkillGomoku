import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';

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

// ————— DOM 侧边栏联动 —————
const statusEl = document.getElementById('status');
const currPlayerEl = document.getElementById('currPlayer');
const turnEl = document.getElementById('turn');
const toastEl = document.getElementById('toast');

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
