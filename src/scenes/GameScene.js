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
    this.forceBorder = {}; // 用于"调虎离山"强制边缘落子
    this.waterDrops = []; // 水滴石穿的虚落子：{ x, y, player, turnsLeft }
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

    // 与 UI/联机 通信
    this.events.on('use-skill', async (id) => {
      const res = await this.skills.activate(id, this);
      if (res.ok) {
        this.playSkillEffect(id); // 播放技能特效
        // 技能释放后立即同步一次（用于不结束回合的技能）
        this.emitStateChanged && this.emitStateChanged();
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
        
        // 绘制被破坏的格子
        if (this.board.isDestroyed(x, y)) {
          const p = this.boardToWorld(x, y);
          const g = this.add.graphics();
          g.fillStyle(0x1a1a1a, 1);
          g.fillRect(p.x - this.cell * 0.4, p.y - this.cell * 0.4, this.cell * 0.8, this.cell * 0.8);
          g.lineStyle(3, 0x8b0000, 1);
          g.strokeRect(p.x - this.cell * 0.4, p.y - this.cell * 0.4, this.cell * 0.8, this.cell * 0.8);
          // 绘制X标记
          g.lineStyle(2, 0xff0000, 0.8);
          g.lineBetween(p.x - this.cell * 0.3, p.y - this.cell * 0.3, p.x + this.cell * 0.3, p.y + this.cell * 0.3);
          g.lineBetween(p.x + this.cell * 0.3, p.y - this.cell * 0.3, p.x - this.cell * 0.3, p.y + this.cell * 0.3);
          this.stonesLayer.add(g);
          continue;
        }
        
        // 绘制实体棋子
        if (v !== 0) this.drawStone(x, y, v);
        
        // 绘制封禁格
        if (this.board.blocked.has(`${x},${y}`) && this.board.grid[y][x] === 0) {
          const p = this.boardToWorld(x, y);
          const g = this.add.graphics();
          g.lineStyle(2, 0xff4d4f, 1);
          g.strokeCircle(p.x, p.y, this.cell * 0.35);
          this.stonesLayer.add(g);
        }
      }
    }
    
    // 绘制水滴（虚落子）
    for (const drop of this.waterDrops) {
      const p = this.boardToWorld(drop.x, drop.y);
      const g = this.add.graphics();
      // 黑棋：深灰色，白棋：浅灰色，更明显的区分
      const color = drop.player === 1 ? 0x333333 : 0xeeeeee;
      const borderColor = drop.player === 1 ? 0x111111 : 0xffffff;
      const alpha = 0.4 + (4 - drop.turnsLeft) * 0.15; // 越接近成熟越实
      g.fillStyle(color, alpha);
      g.fillCircle(p.x, p.y, this.cell * 0.32);
      g.lineStyle(3, borderColor, alpha + 0.2);
      g.strokeCircle(p.x, p.y, this.cell * 0.32);
      // 水滴特征：蓝色外圈
      g.lineStyle(1, 0x4facfe, 0.6);
      g.strokeCircle(p.x, p.y, this.cell * 0.36);
      
      // 显示剩余回合数
      const text = this.add.text(p.x, p.y, String(drop.turnsLeft), {
        fontSize: '18px',
        fontWeight: 'bold',
        color: drop.player === 1 ? '#ffffff' : '#000000',
        stroke: drop.player === 1 ? '#000000' : '#ffffff',
        strokeThickness: 2,
        align: 'center',
      }).setOrigin(0.5);
      this.stonesLayer.add(g);
      this.stonesLayer.add(text);
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

    // 如果正在选择清扫方向，阻止其他操作
    if (this.flags.choosingCleanSweepDirection) {
      return;
    }

    // 技能：保洁上门 - 等待点击位置选择方向
    if (this.flags.awaitingCleanSweep) {
      this.flags.awaitingCleanSweep = false;
      this.flags.choosingCleanSweepDirection = true; // 标记正在选择方向
      this.showDirectionMenu(x, y);
      return;
    }

    // 技能：力拔山兮 - 等待点击格子破坏
    if (this.flags.awaitingDestroy) {
      if (!this.board.isDestroyed(x, y)) {
        this.playDestroyEffect(x, y);
        this.board.destroy(x, y);
        this.flags.awaitingDestroy = false;
        this.redrawStones();
        this.endTurn(false);
        this.refreshUIState('');
      }
      return;
    }

    // 技能：东山再起 - 等待点击被破坏的格子修复
    if (this.flags.awaitingRepair) {
      if (this.board.isDestroyed(x, y)) {
        this.playRepairEffect(x, y);
        this.board.repair(x, y);
        this.flags.awaitingRepair = false;
        this.redrawStones();
        this.endTurn(false);
        this.refreshUIState('');
      }
      return;
    }

    // 技能：水滴石穿 - 等待选择两个点虚落子
    if (this.flags.awaitingWaterDropCount && this.flags.awaitingWaterDropCount > 0) {
      if (this.board.isEmpty(x, y)) {
        // 添加水滴（4回合后成熟，因为对方落2子需要2回合，交替落子共4回合）
        this.waterDrops.push({ x, y, player: this.currentPlayer, turnsLeft: 4 });
        this.flags.awaitingWaterDropCount -= 1;
        this.redrawStones();
        // 联机：中途同步一次
        this.emitStateChanged && this.emitStateChanged();
        
        if (this.flags.awaitingWaterDropCount === 0) {
          // 选择完两个水滴位置，结束技能使用，切换回合
          delete this.flags.awaitingWaterDropCount;
          //this.endTurn(true); // 技能使用完毕，正常推进回合
          this.refreshUIState('');
        } else {
          // 还需要选择更多水滴位置，不切换玩家
          this.refreshUIState(`还需选择 ${this.flags.awaitingWaterDropCount} 个水滴位置`);
        }
      }
      return;
    }

    // 正常落子
    if (!this.board.isEmpty(x, y)) return;

    // 检查是否被强制边缘落子
    if (this.forceBorder[this.currentPlayer]) {
      const isBorder = x === 0 || x === this.size - 1 || y === 0 || y === this.size - 1;
      if (!isBorder) {
        this.refreshUIState('你必须在边缘落子！');
        return;
      }
      // 成功在边缘落子，清除强制边缘标记
      delete this.forceBorder[this.currentPlayer];
    }

    // 检查是否打断水滴（在落子之前）
    this.checkWaterDropInterrupt(x, y);

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
    
    // 更新水滴进度
    this.updateWaterDrops();
    
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
    // 回合结束，广播状态（联机）
    this.emitStateChanged && this.emitStateChanged();
  }

  updateWaterDrops() {
    // 每回合更新水滴进度
    for (let i = this.waterDrops.length - 1; i >= 0; i--) {
      const drop = this.waterDrops[i];
      drop.turnsLeft -= 1;
      
      if (drop.turnsLeft <= 0) {
        // 水滴成熟，变成实体棋子
        if (this.board.isEmpty(drop.x, drop.y)) {
          this.board.place(drop.x, drop.y, drop.player);
          this.playWaterDropMatureEffect(drop.x, drop.y);
          
          // 检查是否获胜
          if (checkWin(this.board.grid, drop.x, drop.y, drop.player)) {
            this.onWin(drop.player);
          }
        }
        this.waterDrops.splice(i, 1);
      }
    }
    this.redrawStones();
  }

  // ——— 状态导出/导入（联机用） ———
  toJSON() {
    const destroyed = Array.from(this.board.destroyed || []).map(k => {
      const [x, y] = k.split(',').map(Number); return { x, y };
    });
    // Firestore 不支持嵌套数组，这里将棋盘每一行序列化为字符串（例如 "012001..."）
    const gridRows = this.board.grid.map(row => row.join(''));
    return {
      size: this.size,
      // 使用字符串数组而不是二维数组
      grid: gridRows,
      destroyed,
      currentPlayer: this.currentPlayer,
      turn: this.turn,
      skipNextTurn: this.skipNextTurn,
      forceBorder: this.forceBorder,
      waterDrops: this.waterDrops.map(d => ({...d})),
      skillsCooldowns: this.skills.getCooldowns(),
      gameOver: !this.input.enabled,
    };
  }

  loadState(state) {
    if (!state) return;
    this.suppressStateEvents = true;
    try {
      if (state.grid && Array.isArray(state.grid)) {
        // 兼容两种格式：
        // 1) 新格式：字符串数组，每个字符串表示一行，如 "01200"
        // 2) 旧格式：二维数组 [[0,1,2,...], ...]
        if (typeof state.grid[0] === 'string') {
          this.board.grid = state.grid.map(line => line.split('').map(ch => Number(ch)));
        } else if (Array.isArray(state.grid[0])) {
          this.board.grid = state.grid.map(row => row.slice());
        }
      }
      this.board.destroyed = new Set((state.destroyed || []).map(p => `${p.x},${p.y}`));
      this.currentPlayer = state.currentPlayer || 1;
      this.turn = state.turn || 1;
      this.skipNextTurn = state.skipNextTurn || {};
      this.forceBorder = state.forceBorder || {};
      this.waterDrops = Array.isArray(state.waterDrops) ? state.waterDrops.map(d => ({...d})) : [];
      if (state.skillsCooldowns) this.skills.setCooldowns(state.skillsCooldowns);
      // 清理临时标记
      this.flags = {};
      this.input.enabled = !state.gameOver;
      this.redrawStones();
      this.refreshUIState();
    } finally {
      this.suppressStateEvents = false;
    }
  }

  emitStateChanged() {
    if (this.suppressStateEvents) return;
    this.events.emit('state-changed', this.toJSON());
  }

  checkWaterDropInterrupt(x, y) {
    // 检查是否有水滴在此位置，如果有则只打断这一个位置的水滴
    for (let i = this.waterDrops.length - 1; i >= 0; i--) {
      const drop = this.waterDrops[i];
      if (drop.x === x && drop.y === y) {
        this.waterDrops.splice(i, 1);
        this.refreshUIState('打断了对方的水滴石穿！');
        break; // 只打断这一个位置，不影响其他水滴
      }
    }
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
      'tiger-trap': () => this.effectTigerTrap(),
      'water-drop': () => this.effectWaterDrop(),
      'resurrection': () => this.effectResurrection(),
      'clean-sweep': () => this.effectCleanSweep(),
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
      'tiger-trap': { freq: 200, type: 'sawtooth', duration: 0.4 },
      'water-drop': { freq: 800, type: 'sine', duration: 0.5 },
      'resurrection': { freq: 500, type: 'triangle', duration: 0.6 },
      'clean-sweep': { freq: 700, type: 'sine', duration: 0.5 },
      'sweep': { freq: 650, type: 'sine', duration: 0.2 },
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
      'tiger-trap': '调虎离山',
      'water-drop': '水滴石穿',
      'resurrection': '东山再起',
      'clean-sweep': '保洁上门',
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

  effectTigerTrap() {
    // 调虎离山：边缘红光闪烁
    const sizePx = (this.size - 1) * this.cell;
    const originX = this.origin.x;
    const originY = this.origin.y;
    
    // 四条边框闪烁
    const border = this.add.graphics();
    border.lineStyle(4, 0xff6b6b, 0.8);
    border.strokeRect(originX - 5, originY - 5, sizePx + 10, sizePx + 10);
    this.effectsLayer.add(border);
    
    this.tweens.add({
      targets: border,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 1,
      onComplete: () => border.destroy(),
    });
  }

  effectWaterDrop() {
    // 水滴石穿：蓝色水滴从上落下
    const cx = this.scale.width / 2;
    
    for (let i = 0; i < 6; i++) {
      const drop = this.add.circle(cx + (i - 2.5) * 40, -20, 6, 0x4facfe, 0.8);
      this.effectsLayer.add(drop);
      this.tweens.add({
        targets: drop,
        y: this.scale.height + 20,
        alpha: 0,
        duration: 1000,
        delay: i * 100,
        ease: 'Cubic.easeIn',
        onComplete: () => drop.destroy(),
      });
    }
  }

  effectResurrection() {
    // 东山再起：金色光芒从下升起
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    
    // 上升的金色粒子
    for (let i = 0; i < 30; i++) {
      const x = cx + (Math.random() - 0.5) * 300;
      const particle = this.add.circle(x, this.scale.height + 20, 4 + Math.random() * 3, 0xffd700, 0.9);
      this.effectsLayer.add(particle);
      this.tweens.add({
        targets: particle,
        y: cy - 100 - Math.random() * 100,
        alpha: 0,
        duration: 1000 + Math.random() * 500,
        delay: i * 30,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  effectCleanSweep() {
    // 保洁上门：清洁波纹扩散
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    
    // 蓝色清洁波纹
    for (let i = 0; i < 5; i++) {
      const wave = this.add.circle(cx, cy, 10, 0x4facfe, 0.6);
      wave.setStrokeStyle(3, 0xffffff, 0.8);
      this.effectsLayer.add(wave);
      this.tweens.add({
        targets: wave,
        radius: 200 + i * 50,
        alpha: 0,
        duration: 800,
        delay: i * 100,
        ease: 'Quad.easeOut',
        onComplete: () => wave.destroy(),
      });
    }
    
    // 闪光星星
    for (let i = 0; i < 20; i++) {
      const x = cx + (Math.random() - 0.5) * 400;
      const y = cy + (Math.random() - 0.5) * 400;
      const star = this.add.star(x, y, 4, 3, 6, 0xffffff, 0.9);
      this.effectsLayer.add(star);
      this.tweens.add({
        targets: star,
        scale: 1.5,
        alpha: 0,
        duration: 600,
        delay: i * 40,
        ease: 'Back.easeOut',
        onComplete: () => star.destroy(),
      });
    }
  }

  playDestroyEffect(x, y) {
    // 力拔山兮破坏格子的特效
    const p = this.boardToWorld(x, y);
    
    // 爆裂粒子
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const dist = 40 + Math.random() * 30;
      const particle = this.add.circle(p.x, p.y, 4 + Math.random() * 4, 0x8b0000, 1);
      this.effectsLayer.add(particle);
      this.tweens.add({
        targets: particle,
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 400 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
    
    // 破碎冲击波
    for (let i = 0; i < 3; i++) {
      const shock = this.add.circle(p.x, p.y, 5, 0xff0000, 0.8);
      this.effectsLayer.add(shock);
      this.tweens.add({
        targets: shock,
        radius: 50 + i * 10,
        alpha: 0,
        duration: 400,
        delay: i * 100,
        ease: 'Cubic.easeOut',
        onComplete: () => shock.destroy(),
      });
    }
    
    // 屏幕震动
    this.cameras.main.shake(200, 0.003);
  }

  playRepairEffect(x, y) {
    // 东山再起修复格子的特效
    const p = this.boardToWorld(x, y);
    
    // 金色光芒粒子从外向内聚集
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20;
      const dist = 60;
      const startX = p.x + Math.cos(angle) * dist;
      const startY = p.y + Math.sin(angle) * dist;
      const particle = this.add.circle(startX, startY, 3, 0xffd700, 1);
      this.effectsLayer.add(particle);
      this.tweens.add({
        targets: particle,
        x: p.x,
        y: p.y,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeIn',
        onComplete: () => particle.destroy(),
      });
    }
    
    // 修复光环
    const ring = this.add.circle(p.x, p.y, 5, 0xffd700, 0);
    ring.setStrokeStyle(3, 0xffd700, 1);
    this.effectsLayer.add(ring);
    this.tweens.add({
      targets: ring,
      radius: 40,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  playWaterDropMatureEffect(x, y) {
    // 水滴成熟变成实体棋子的特效
    const p = this.boardToWorld(x, y);
    
    // 水波纹扩散
    for (let i = 0; i < 3; i++) {
      const wave = this.add.circle(p.x, p.y, 10, 0x4facfe, 0.6);
      this.effectsLayer.add(wave);
      this.tweens.add({
        targets: wave,
        radius: 35 + i * 10,
        alpha: 0,
        duration: 500,
        delay: i * 100,
        ease: 'Sine.easeOut',
        onComplete: () => wave.destroy(),
      });
    }
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

  showDirectionMenu(x, y) {
    // 在选定位置周围显示方向按钮
    const p = this.boardToWorld(x, y);
    const btnRadius = 18; // 按钮半径缩小
    const offset = this.cell; // 正好一格的距离
    
    // 先在选定位置显示标记虚影
    const marker = this.add.circle(p.x, p.y, this.cell * 0.4, 0x4facfe, 0.4);
    marker.setStrokeStyle(3, 0xffd666, 0.8);
    this.effectsLayer.add(marker);
    
    // 脉动效果
    this.tweens.add({
      targets: marker,
      alpha: 0.6,
      scale: 1.1,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    
    // 四个方向：上(纵向)，右(横向)，右下(斜向\)，右上(斜向/)
    const directions = [
      { dir: 'vertical', dx: 0, dy: -offset, lineType: 'vertical' },
      { dir: 'horizontal', dx: offset, dy: 0, lineType: 'horizontal' },
      { dir: 'diagonal2', dx: offset * 0.707, dy: -offset * 0.707, lineType: 'diagonal2' },
      { dir: 'diagonal1', dx: offset * 0.707, dy: offset * 0.707, lineType: 'diagonal1' },
    ];
    
    const buttons = [];
    const previewLayer = this.add.layer(); // 预览特效层
    this.effectsLayer.add(previewLayer);
    
    directions.forEach((d) => {
      const btnX = p.x + d.dx;
      const btnY = p.y + d.dy;
      
      const btn = this.add.circle(btnX, btnY, btnRadius, 0x16213e, 0.95).setInteractive();
      btn.setStrokeStyle(2, 0x0f4c75, 1);
      this.effectsLayer.add(btn);
      
      // 在按钮内绘制方向线段（在按钮之后添加，确保在上层）
      const lineGraphics = this.add.graphics();
      const lineLength = btnRadius * 0.618;
      lineGraphics.lineStyle(3, 0xffffff, 1);
      
      if (d.lineType === 'vertical') {
        // 竖线
        lineGraphics.lineBetween(btnX, btnY - lineLength, btnX, btnY + lineLength);
      } else if (d.lineType === 'horizontal') {
        // 横线
        lineGraphics.lineBetween(btnX - lineLength, btnY, btnX + lineLength, btnY);
      } else if (d.lineType === 'diagonal1') {
        // 斜线 \ (45度)
        const offset45 = lineLength * 0.707;
        lineGraphics.lineBetween(btnX - offset45, btnY - offset45, btnX + offset45, btnY + offset45);
      } else if (d.lineType === 'diagonal2') {
        // 斜线 / (45度)
        const offset45 = lineLength * 0.707;
        lineGraphics.lineBetween(btnX - offset45, btnY + offset45, btnX + offset45, btnY - offset45);
      }
      
      this.effectsLayer.add(lineGraphics);
      
      // 鼠标悬停时显示预览和高亮按钮
      btn.on('pointerover', () => {
        btn.setFillStyle(0x0f4c75, 1);
        btn.setStrokeStyle(3, 0xffd666, 1);
        this.showSweepPreview(x, y, d.dir, previewLayer);
      });
      
      // 鼠标移出时清除预览和恢复按钮
      btn.on('pointerout', () => {
        btn.setFillStyle(0x16213e, 0.95);
        btn.setStrokeStyle(2, 0x0f4c75, 1);
        this.clearSweepPreview(previewLayer);
      });
      
      // 点击时执行清扫
      btn.on('pointerdown', () => {
        // 清除菜单和预览
        buttons.forEach(b => {
          b.btn.destroy();
          b.line.destroy();
        });
        marker.destroy();
        previewLayer.destroy();
        
        // 清除选择方向标记
        delete this.flags.choosingCleanSweepDirection;
        
        // 执行清扫
        this.executeSweep(x, y, d.dir);
      });
      
      buttons.push({ btn, line: lineGraphics });
    });
    
    // 存储菜单元素以便清理
    this.currentDirectionMenu = { buttons, marker, previewLayer };
  }
  
  showSweepPreview(x, y, direction, previewLayer) {
    // 清除之前的预览
    this.clearSweepPreview(previewLayer);
    
    // 获取将要被清除的位置
    const positions = this.getSweepPositions(x, y, direction);
    
    // 为每个位置显示虚影特效
    positions.forEach(pos => {
      const p = this.boardToWorld(pos.x, pos.y);
      
      // 半透明红色圆圈
      const preview = this.add.circle(p.x, p.y, this.cell * 0.4, 0xff6b6b, 0.3);
      preview.setStrokeStyle(2, 0xff4444, 0.6);
      previewLayer.add(preview);
      
      // 脉动效果
      this.tweens.add({
        targets: preview,
        alpha: 0.5,
        scale: 1.1,
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }
  
  clearSweepPreview(previewLayer) {
    // 清除所有预览元素
    previewLayer.removeAll(true);
    this.tweens.killTweensOf(previewLayer.getAll());
  }
  
  getSweepPositions(x, y, direction) {
    // 获取指定方向上将要被清除的所有位置
    const positions = [];
    
    if (direction === 'horizontal') {
      for (let i = 0; i < this.size; i++) {
        positions.push({ x: i, y });
      }
    } else if (direction === 'vertical') {
      for (let i = 0; i < this.size; i++) {
        positions.push({ x, y: i });
      }
    } else if (direction === 'diagonal1') {
      const offset = y - x;
      for (let i = 0; i < this.size; i++) {
        const ty = i + offset;
        if (ty >= 0 && ty < this.size) {
          positions.push({ x: i, y: ty });
        }
      }
    } else if (direction === 'diagonal2') {
      const sum = x + y;
      for (let i = 0; i < this.size; i++) {
        const ty = sum - i;
        if (ty >= 0 && ty < this.size) {
          positions.push({ x: i, y: ty });
        }
      }
    }
    
    return positions;
  }
  
  executeSweep(x, y, direction) {
    // 获取要清除的位置
    const positions = this.getSweepPositions(x, y, direction);
    
    // 清除棋子
    positions.forEach(pos => {
      if (!this.board.isDestroyed(pos.x, pos.y)) {
        this.board.grid[pos.y][pos.x] = 0;
      }
    });
    
    // 清除对应的水滴
    this.waterDrops = this.waterDrops.filter(drop => {
      return !positions.some(pos => pos.x === drop.x && pos.y === drop.y);
    });
    
    // 播放清扫特效
    this.playSweepEffect(positions, direction);
    
    // 重绘并结束回合
    this.redrawStones();
    this.endTurn(false);
    this.refreshUIState('');
  }
  
  playSweepEffect(positions, direction) {
    // 播放音效
    this.playSkillSound('sweep');
    
    // 按位置顺序依次播放清扫效果
    positions.forEach((pos, i) => {
      setTimeout(() => {
        const p = this.boardToWorld(pos.x, pos.y);
        
        // 扫帚/清洁特效
        for (let j = 0; j < 12; j++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Math.random() * 30 + 20;
          const particle = this.add.circle(p.x, p.y, 3, 0x4facfe, 1);
          this.effectsLayer.add(particle);
          
          this.tweens.add({
            targets: particle,
            x: p.x + Math.cos(angle) * dist,
            y: p.y + Math.sin(angle) * dist,
            alpha: 0,
            scale: 0.3,
            duration: 400,
            ease: 'Quad.easeOut',
            onComplete: () => particle.destroy(),
          });
        }
        
        // 波纹效果
        const wave = this.add.circle(p.x, p.y, 5, 0x4facfe, 0.6);
        wave.setStrokeStyle(2, 0xffffff, 0.8);
        this.effectsLayer.add(wave);
        
        this.tweens.add({
          targets: wave,
          scale: 4,
          alpha: 0,
          duration: 500,
          ease: 'Quad.easeOut',
          onComplete: () => wave.destroy(),
        });
      }, i * 30);
    });
  }

  restartGame() {
    // 重置游戏状态
    this.board = new Board(this.size);
    this.skills = new SkillsManager(this, this.board);
    this.currentPlayer = 1;
    this.turn = 1;
    this.flags = {};
    this.skipNextTurn = {};
    this.forceBorder = {};
    this.waterDrops = [];
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
