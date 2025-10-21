import Board from '../core/Board.js';
import { checkWin } from '../core/Rules.js';
import SkillsManager from '../core/Skills.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.size = 15;
    this.margin = 40;
    this.cell = 40; // will compute on resize

    this.currentPlayer = 1; // 1 black, 2 white
    this.turn = 1;

    this.flags = {}; // 用于技能的临时标志位
    this.skipNextTurn = {}; // 用于"静如止水"技能跳过回合
  }

  create() {
    // 计算格子尺寸以适配画布
    const W = this.scale.width;
    const H = this.scale.height;
    const boardPixels = Math.min(W, H) - this.margin * 2;
    this.cell = Math.floor(boardPixels / (this.size - 1));

    this.board = new Board(this.size);
    this.skills = new SkillsManager(this, this.board);

    this.graphics = this.add.graphics();
    this.stonesLayer = this.add.layer();
    this.effectsLayer = this.add.layer(); // 技能特效层

    this.drawBoard();

    // 输入事件
    this.input.on('pointerdown', this.handlePointerDown, this);

    // 与 UI 场景通信
    this.events.on('use-skill', async (id) => {
      const res = await this.skills.activate(id, this);
      if (res.ok) {
        this.playSkillEffect(id); // 播放技能特效
      }
      this.game.events.emit('ui-feedback', res);
      this.refreshUIState();
    });

    this.refreshUIState();
  }

  drawBoard() {
    const sizePx = (this.size - 1) * this.cell;
    const originX = (this.scale.width - sizePx) / 2;
    const originY = (this.scale.height - sizePx) / 2;
    this.origin = { x: originX, y: originY };

    this.graphics.clear();
    // 背板
    this.graphics.fillStyle(0x2a1f0f, 1);
    this.graphics.fillRoundedRect(originX - 20, originY - 20, sizePx + 40, sizePx + 40, 8);

    // 网格线
    this.graphics.lineStyle(1, 0xe6c08a, 1);
    for (let i = 0; i < this.size; i++) {
      const x = originX + i * this.cell;
      const y = originY + i * this.cell;
      this.graphics.lineBetween(originX, y, originX + sizePx, y);
      this.graphics.lineBetween(x, originY, x, originY + sizePx);
    }

    // 星位
    const stars = [3, Math.floor(this.size / 2), this.size - 4];
    this.graphics.fillStyle(0x000000, 0.8);
    for (const sy of stars) for (const sx of stars) {
      const cx = originX + sx * this.cell;
      const cy = originY + sy * this.cell;
      this.graphics.fillCircle(cx, cy, 3);
    }

    // 重绘棋子
    this.redrawStones();
  }

  boardToWorld(x, y) {
    return {
      x: this.origin.x + x * this.cell,
      y: this.origin.y + y * this.cell,
    };
  }

  worldToBoard(wx, wy) {
    const x = Math.round((wx - this.origin.x) / this.cell);
    const y = Math.round((wy - this.origin.y) / this.cell);
    return { x, y };
  }

  redrawStones() {
    this.stonesLayer.removeAll(true);
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const v = this.board.grid[y][x];
        if (v !== 0) this.drawStone(x, y, v);
        if (this.board.blocked.has(`${x},${y}`) && this.board.grid[y][x] === 0) {
          const p = this.boardToWorld(x, y);
          const g = this.add.graphics();
          g.lineStyle(2, 0xff4d4f, 1);
          g.strokeCircle(p.x, p.y, this.cell * 0.35);
          this.stonesLayer.add(g);
        }
      }
    }
  }

  drawStone(x, y, player) {
    const p = this.boardToWorld(x, y);
    const g = this.add.graphics();
    const color = player === 1 ? 0x111111 : 0xf2f2f2;
    const stroke = player === 1 ? 0x333333 : 0x999999;
    g.fillStyle(color, 1);
    g.fillCircle(p.x, p.y, this.cell * 0.38);
    g.lineStyle(2, stroke, 1);
    g.strokeCircle(p.x, p.y, this.cell * 0.38);
    this.stonesLayer.add(g);
  }

  handlePointerDown(pointer) {
    const { x, y } = this.worldToBoard(pointer.x, pointer.y);
    if (!this.board.inBounds(x, y)) return;

    // 技能：力拔山兮 - 等待移除两颗对方棋子
    if (this.flags.awaitingRemovalCount && this.flags.awaitingRemovalCount > 0) {
      const target = this.board.grid[y][x];
      if (target !== 0 && target !== this.currentPlayer) {
        // 播放移除特效
        this.playRemovalEffect(x, y);
        this.board.remove(x, y);
        this.flags.awaitingRemovalCount -= 1;
        this.redrawStones();
        if (this.flags.awaitingRemovalCount === 0) {
          delete this.flags.awaitingRemovalCount;
          this.endTurn(false); // 技能不计入正常落子
        }
        this.refreshUIState(this.flags.awaitingRemovalCount > 0 ? `还需移除 ${this.flags.awaitingRemovalCount} 颗对方棋子` : '');
      }
      return;
    }

    // 正常落子
    if (!this.board.isEmpty(x, y)) return;

    if (this.placeAndCheck(x, y)) return; // 胜负已分

    // 普通结束回合
    this.endTurn(true);
  }

  placeAndCheck(x, y) {
    const ok = this.board.place(x, y, this.currentPlayer);
    if (!ok) return false;
    this.redrawStones();

    if (checkWin(this.board.grid, x, y, this.currentPlayer)) {
      this.onWin(this.currentPlayer);
      return true;
    }
    return false;
  }

  onWin(player) {
    this.game.events.emit('game-over', { winner: player });
    this.input.enabled = false;
    this.playWinEffect(player);
  }

  endTurn(advanceTurn) {
    if (advanceTurn) this.turn += 1;
    // 回合结束，冷却推进
    this.skills.tickAll();
    // 切换玩家
    this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    
    // 检查是否被"静如止水"跳过
    if (this.skipNextTurn && this.skipNextTurn[this.currentPlayer]) {
      delete this.skipNextTurn[this.currentPlayer];
      this.refreshUIState('你的回合被跳过！');
      // 再次切换玩家（跳过本回合）
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      this.turn += 1;
    }
    
    this.refreshUIState();
  }

  refreshUIState(message) {
    const payload = {
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      skills: this.skills.list().map(s => ({ id: s.id, name: s.name, desc: s.description, cd: s.remaining })),
      flags: { ...this.flags },
      message,
    };
    this.game.events.emit('ui-state', payload);
  }

  // ————— 技能视觉特效 —————
  playSkillEffect(skillId) {
    // 播放音效
    this.playSkillSound(skillId);
    
    // 显示技能名称
    this.showSkillName(skillId);
    
    // 播放特效动画
    const effects = {
      'flying-sand': () => this.effectFlyingSand(),
      'mountain-power': () => this.effectMountainPower(),
      'still-water': () => this.effectStillWater(),
      'polarity-reverse': () => this.effectPolarityReverse(),
    };
    const fn = effects[skillId];
    if (fn) fn();
  }

  playSkillSound(skillId) {
    // 使用 Web Audio API 生成简单音效
    if (!this.sound.context) return;
    
    const ctx = this.sound.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // 不同技能不同音效
    const sounds = {
      'flying-sand': { freq: 300, type: 'sawtooth', duration: 0.3 },
      'mountain-power': { freq: 100, type: 'square', duration: 0.5 },
      'still-water': { freq: 600, type: 'sine', duration: 0.4 },
      'polarity-reverse': { freq: 400, type: 'triangle', duration: 0.6 },
    };
    
    const sound = sounds[skillId] || { freq: 440, type: 'sine', duration: 0.3 };
    osc.type = sound.type;
    osc.frequency.setValueAtTime(sound.freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(sound.freq * 0.5, ctx.currentTime + sound.duration);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + sound.duration);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + sound.duration);
  }

  showSkillName(skillId) {
    const names = {
      'flying-sand': '飞沙走石',
      'mountain-power': '力拔山兮',
      'still-water': '静如止水',
      'polarity-reverse': '两极反转',
    };
    
    const name = names[skillId];
    if (!name) return;
    
    const text = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 - 100,
      name,
      {
        fontSize: '48px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffd666',
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      }
    ).setOrigin(0.5).setAlpha(0).setScale(0.5);
    
    this.effectsLayer.add(text);
    
    this.tweens.add({
      targets: text,
      scale: 1.2,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
    
    this.tweens.add({
      targets: text,
      y: text.y - 50,
      alpha: 0,
      duration: 800,
      delay: 400,
      ease: 'Cubic.easeIn',
      onComplete: () => text.destroy(),
    });
  }

  effectFlyingSand() {
    // 飞沙走石：沙尘旋风效果
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 200;
      const particle = this.add.circle(cx, cy, 3 + Math.random() * 4, 0xd4a574, 0.8);
      this.effectsLayer.add(particle);
      this.tweens.add({
        targets: particle,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0,
        duration: 600 + Math.random() * 400,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  effectMountainPower() {
    // 力拔山兮：震动波纹
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(cx, cy, 0, 0xff6b6b, 0);
      ring.setStrokeStyle(4, 0xff4444, 1);
      this.effectsLayer.add(ring);
      this.tweens.add({
        targets: ring,
        radius: 150 + i * 50,
        alpha: 0,
        duration: 800,
        delay: i * 150,
        ease: 'Sine.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    // 屏幕震动
    this.cameras.main.shake(300, 0.005);
  }

  effectStillWater() {
    // 静如止水：蓝色水波扩散
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    for (let i = 0; i < 4; i++) {
      const wave = this.add.circle(cx, cy, 30 + i * 20, 0x4facfe, 0.4);
      this.effectsLayer.add(wave);
      this.tweens.add({
        targets: wave,
        scale: 3 + i * 0.5,
        alpha: 0,
        duration: 1000,
        delay: i * 100,
        ease: 'Sine.easeOut',
        onComplete: () => wave.destroy(),
      });
    }
  }

  effectPolarityReverse() {
    // 两极反转：黑白翻转闪光
    const flash = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0xffffff,
      0
    );
    this.effectsLayer.add(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0.8,
      duration: 100,
      yoyo: true,
      repeat: 2,
      onComplete: () => flash.destroy(),
    });
    // 颜色闪烁
    this.cameras.main.flash(400, 255, 255, 255);
  }

  playRemovalEffect(x, y) {
    // 力拔山兮移除棋子时的爆裂特效
    const p = this.boardToWorld(x, y);
    
    // 爆裂粒子
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const dist = 30 + Math.random() * 20;
      const particle = this.add.circle(p.x, p.y, 3 + Math.random() * 3, 0xff4444, 1);
      this.effectsLayer.add(particle);
      this.tweens.add({
        targets: particle,
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 300 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
    
    // 中心冲击波
    const shock = this.add.circle(p.x, p.y, 5, 0xff6b6b, 0.8);
    this.effectsLayer.add(shock);
    this.tweens.add({
      targets: shock,
      radius: 40,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => shock.destroy(),
    });
  }

  playWinEffect(player) {
    // 胜利特效：烟花+横幅
    const color = player === 1 ? 0x333333 : 0xf2f2f2;
    const accentColor = player === 1 ? 0x555555 : 0xffffff;
    
    // 烟花效果
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const x = 100 + Math.random() * (this.scale.width - 200);
        const y = 100 + Math.random() * (this.scale.height - 200);
        
        for (let j = 0; j < 20; j++) {
          const angle = (Math.PI * 2 * j) / 20;
          const dist = 50 + Math.random() * 50;
          const particle = this.add.circle(x, y, 4, accentColor, 1);
          this.effectsLayer.add(particle);
          this.tweens.add({
            targets: particle,
            x: x + Math.cos(angle) * dist,
            y: y + Math.sin(angle) * dist,
            alpha: 0,
            duration: 800 + Math.random() * 400,
            ease: 'Quad.easeOut',
            onComplete: () => particle.destroy(),
          });
        }
      }, i * 300);
    }
    
    // 胜利横幅
    const banner = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width * 0.8,
      120,
      0x000000,
      0.85
    );
    banner.setStrokeStyle(4, color, 1);
    this.effectsLayer.add(banner);
    
    const winText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 - 20,
      player === 1 ? '● 黑方获胜！' : '○ 白方获胜！',
      {
        fontSize: '56px',
        fontFamily: 'Arial, sans-serif',
        color: player === 1 ? '#333333' : '#f2f2f2',
        stroke: player === 1 ? '#ffffff' : '#000000',
        strokeThickness: 4,
        align: 'center',
      }
    ).setOrigin(0.5);
    this.effectsLayer.add(winText);
    
    const subText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 35,
      'VICTORY',
      {
        fontSize: '24px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffd666',
        align: 'center',
      }
    ).setOrigin(0.5);
    this.effectsLayer.add(subText);
    
    // 动画效果
    banner.setScale(0.8).setAlpha(0);
    winText.setScale(0.5).setAlpha(0);
    subText.setAlpha(0);
    
    this.tweens.add({
      targets: banner,
      scale: 1,
      alpha: 0.85,
      duration: 400,
      ease: 'Back.easeOut',
    });
    
    this.tweens.add({
      targets: winText,
      scale: 1,
      alpha: 1,
      duration: 500,
      delay: 200,
      ease: 'Back.easeOut',
    });
    
    this.tweens.add({
      targets: subText,
      alpha: 1,
      duration: 400,
      delay: 400,
    });
    
    // 屏幕闪光（仅闪烁，不淡入）
    this.cameras.main.flash(600, 255, 255, 255);
  }

  restartGame() {
    // 重置游戏状态
    this.board = new Board(this.size);
    this.skills = new SkillsManager(this, this.board);
    this.currentPlayer = 1;
    this.turn = 1;
    this.flags = {};
    this.skipNextTurn = {};
    this.input.enabled = true;
    
    // 清空特效层
    this.effectsLayer.removeAll(true);
    
    // 重绘棋盘
    this.cameras.main.resetFX();
    this.drawBoard();
    this.refreshUIState();
    
    // 通知侧栏重置
    this.game.events.emit('game-restart');
  }
}
