// 简易技能系统：定义若干技能并管理冷却与释放

class Skill {
  constructor({ id, name, description, cooldown, use }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.cooldown = cooldown; // turns
    this.remaining = { 1: 0, 2: 0 }; // 分别记录玩家1和玩家2的CD
    this.use = use; // async or sync function(ctx)
  }

  canUse(player) {
    return this.remaining[player] <= 0;
  }

  tick(player) {
    if (this.remaining[player] > 0) this.remaining[player] -= 1;
  }
  
  startCooldown(player) {
    this.remaining[player] = this.cooldown;
  }
}

export default class SkillsManager {
  constructor(scene, board) {
    this.scene = scene;
    this.board = board;

    // 定义技能
    this.skills = [
      new Skill({
        id: 'flying-sand',
        name: '飞沙走石',
        description: '随机移动对方的一颗棋子到附近空位。',
        cooldown: 4,
        use: async (ctx) => {
          // 找出对方所有棋子
          const opponent = ctx.currentPlayer === 1 ? 2 : 1;
          const pieces = [];
          for (let y = 0; y < this.board.size; y++) {
            for (let x = 0; x < this.board.size; x++) {
              if (this.board.grid[y][x] === opponent) pieces.push({ x, y });
            }
          }
          if (pieces.length === 0) return;

          // 随机选一颗
          const piece = pieces[Math.floor(Math.random() * pieces.length)];
          
          // 找附近空位（曼哈顿距离 <= 3）
          const candidates = [];
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = piece.x + dx, ny = piece.y + dy;
              if (this.board.isEmpty(nx, ny)) candidates.push({ x: nx, y: ny });
            }
          }
          if (candidates.length === 0) return;

          const target = candidates[Math.floor(Math.random() * candidates.length)];
          // 移动棋子
          this.board.grid[piece.y][piece.x] = 0;
          this.board.grid[target.y][target.x] = opponent;
          ctx.redrawStones();
        },
      }),
      new Skill({
        id: 'mountain-power',
        name: '力拔山兮',
        description: '永久破坏一个格子（含棋子）。',
        cooldown: 6,
        use: async (ctx) => {
          ctx.flags.awaitingDestroy = true; // 等待点击格子进行破坏
        },
      }),
      new Skill({
        id: 'still-water',
        name: '静如止水',
        description: '跳过对方下一回合（对方无法落子一次）。',
        cooldown: 6,
        use: async (ctx) => {
          // 标记对方下一回合被跳过
          const nextPlayer = ctx.currentPlayer === 1 ? 2 : 1;
          if (!ctx.skipNextTurn) ctx.skipNextTurn = {};
          ctx.skipNextTurn[nextPlayer] = true;
        },
      }),
      new Skill({
        id: 'polarity-reverse',
        name: '两极反转',
        description: '交换场上所有黑白棋子的颜色。',
        cooldown: 7,
        use: async (ctx) => {
          // 遍历棋盘，1 变 2，2 变 1
          for (let y = 0; y < this.board.size; y++) {
            for (let x = 0; x < this.board.size; x++) {
              if (this.board.grid[y][x] === 1) this.board.grid[y][x] = 2;
              else if (this.board.grid[y][x] === 2) this.board.grid[y][x] = 1;
            }
          }
          ctx.redrawStones();
        },
      }),
      new Skill({
        id: 'tiger-trap',
        name: '调虎离山',
        description: '强制对方下一步必须在边缘落子。',
        cooldown: 5,
        use: async (ctx) => {
          const nextPlayer = ctx.currentPlayer === 1 ? 2 : 1;
          if (!ctx.forceBorder) ctx.forceBorder = {};
          ctx.forceBorder[nextPlayer] = true;
        },
      }),
      new Skill({
        id: 'water-drop',
        name: '水滴石穿',
        description: '选择两个点虚落子，四回合后成为实体。',
        cooldown: 8,
        use: async (ctx) => {
          ctx.flags.awaitingWaterDropCount = 2; // 等待选择两个点
          if (!ctx.waterDrops) ctx.waterDrops = [];
        },
      }),
      new Skill({
        id: 'resurrection',
        name: '东山再起',
        description: '修复棋盘上被破坏的格子。',
        cooldown: 7,
        use: async (ctx) => {
          // 检查是否有被破坏的格子
          if (this.board.destroyed.size === 0) {
            return { ok: false, message: '没有被破坏的格子' };
          }
          ctx.flags.awaitingRepair = true; // 等待点击被破坏的格子进行修复
        },
      }),
      new Skill({
        id: 'clean-sweep',
        name: '保洁上门',
        description: '清除棋盘上的一整行/列/对角线。',
        cooldown: 7,
        use: async (ctx) => {
          ctx.flags.awaitingCleanSweep = true; // 等待选择清扫方向
        },
      }),
    ];
  }

  list() {
    return this.skills;
  }

  getById(id) {
    return this.skills.find(s => s.id === id);
  }

  tickAll(player) {
    this.skills.forEach(s => s.tick(player));
  }

  // ——— 序列化/反序列化 冷却时间 ———
  getCooldowns() {
    const out = {};
    for (const s of this.skills) {
      out[s.id] = { 1: s.remaining[1] || 0, 2: s.remaining[2] || 0 };
    }
    return out;
  }

  setCooldowns(map) {
    if (!map) return;
    for (const s of this.skills) {
      if (Object.prototype.hasOwnProperty.call(map, s.id)) {
        const v = map[s.id];
        if (typeof v === 'object' && v !== null) {
          // 新格式：{ 1: cd1, 2: cd2 }
          s.remaining = { 1: v[1] || 0, 2: v[2] || 0 };
        } else if (typeof v === 'number') {
          // 旧格式兼容：单一数字，应用到两个玩家
          s.remaining = { 1: v, 2: v };
        }
      }
    }
  }

  async activate(id, ctx) {
    const s = this.getById(id);
    if (!s) return { ok: false, message: '技能不存在' };
    const player = ctx.currentPlayer;
    if (!s.canUse(player)) return { ok: false, message: '冷却中' };

    const result = await s.use(ctx);
    // 如果技能返回了失败结果，不触发冷却
    if (result && !result.ok) return result;
    
    s.startCooldown(player);
    return { ok: true };
  }
}
