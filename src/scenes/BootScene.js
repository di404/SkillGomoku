export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // 可在此预加载资源（棋子、音效等）；先使用图形绘制，减少外部依赖
  }

  create() {
    // 仅启动核心游戏场景（UI 改为 DOM 侧边栏）
    this.scene.start('GameScene');

    // 通知外层已准备好
    this.game.events.emit('ready');
  }
}
