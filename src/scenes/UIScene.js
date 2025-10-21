export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    this.texts = {};

    // 顶部信息栏
    this.info = this.add.text(16, 16, 'Skill Gomoku', { fontSize: 16, color: '#ffffff' }).setDepth(1000);

    // 技能按钮区域
    this.buttons = [];
    this.createButtons();

    // 监听来自 GameScene 的状态与事件
    this.game.events.on('ui-state', (state) => this.updateUI(state));
    this.game.events.on('ui-feedback', (res) => {
      if (!res.ok) this.flashMessage(res.message || '技能失败');
    });
    this.game.events.on('game-over', ({ winner }) => {
      this.flashMessage(`玩家 ${winner === 1 ? '● 黑' : '○ 白'} 获胜！`);
    });
  }

  createButtons() {
    const names = ['双落子', '拆一子', '封禁格'];
    const ids = ['double-place', 'remove-one', 'block-cell'];

    const startX = 16;
    const startY = this.scale.height - 80;
    const gap = 8;
    const w = 120, h = 36;

    for (let i = 0; i < names.length; i++) {
      const x = startX + i * (w + gap);
      const y = startY;
      const container = this.add.container(x, y).setSize(w, h).setInteractive(new Phaser.Geom.Rectangle(0,0,w,h), Phaser.Geom.Rectangle.Contains);

      const bg = this.add.rectangle(0, 0, w, h, 0x1e1e2f, 0.9).setOrigin(0);
      bg.setStrokeStyle(1, 0x40405a, 1);
      const label = this.add.text(10, 8, `${names[i]}`, { fontSize: 14, color: '#eaeaff' }).setOrigin(0);
      const cdText = this.add.text(w - 10, 8, '', { fontSize: 14, color: '#eaeaff' }).setOrigin(1, 0);

      container.add([bg, label, cdText]);
      container.on('pointerover', () => bg.setFillStyle(0x2a2a45, 1));
      container.on('pointerout', () => bg.setFillStyle(0x1e1e2f, 0.9));
      container.on('pointerdown', () => {
        // 请求使用技能
        this.scene.get('GameScene').events.emit('use-skill', ids[i]);
      });

      this.buttons.push({ id: ids[i], container, bg, label, cdText });
    }

    // 消息浮层
    this.toast = this.add.text(this.scale.width / 2, 40, '', { fontSize: 16, color: '#ffd666' })
      .setOrigin(0.5, 0)
      .setAlpha(0);
  }

  updateUI(state) {
    const { currentPlayer, skills, message } = state;
    this.info.setText(`回合: ${state.turn}    当前: ${currentPlayer === 1 ? '● 黑' : '○ 白'}`);

    for (const btn of this.buttons) {
      const s = skills.find(x => x.id === btn.id);
      const onCd = s && s.cd > 0;
      btn.cdText.setText(onCd ? `CD ${s.cd}` : '');
      btn.container.setAlpha(onCd ? 0.6 : 1);
      btn.container.disableInteractive();
      if (!onCd) btn.container.setInteractive();
    }

    if (message) this.flashMessage(message);
  }

  flashMessage(msg) {
    this.toast.setText(msg);
    this.tweens.killTweensOf(this.toast);
    this.toast.setAlpha(1);
    this.tweens.add({ targets: this.toast, alpha: 0, duration: 2000, delay: 800, ease: 'Sine.easeOut' });
  }
}
