# Skill Gomoku (Phaser + Firebase)

一个“五子棋 + 技能”的小游戏基础架构，基于 Phaser 3，无打包工具，纯静态资源，适合部署至 Firebase Hosting。

## 结构

- `skillgomoku.html` — 单页入口（加载 Phaser CDN 与 `src/main.js`）
- `src/main.js` — 创建 Phaser 游戏、场景注册
- `src/scenes/BootScene.js` — 启动与预加载
- `src/scenes/GameScene.js` — 棋盘绘制、交互、回合与技能触发
- `src/scenes/UIScene.js` — HUD/按钮/提示
- `src/core/Board.js` — 棋盘数据结构（含封禁格）
- `src/core/Rules.js` — 胜负判定（五连）
- `src/core/Skills.js` — 技能定义与冷却（双落子、拆一子、封禁格）
- `firebase.json` — Firebase Hosting 配置（将所有路由重写到 `skillgomoku.html`）

## 本地预览（可选）
由于使用 ES Modules，建议使用任意静态服务器（避免 file:// 跨域问题）。

- VS Code 扩展：Live Server
- 或 Node: `npx serve` / `npx http-server`

## 部署到 Firebase Hosting

1. 安装 CLI（一次性）

```powershell
npm i -g firebase-tools
```

2. 登录账号

```powershell
firebase login
```

3. 选择项目（或先在控制台创建项目）

```powershell
firebase use --add
# 选择你的项目，并将其设置为 default（或编辑 .firebaserc 的 project id）
```

4. 部署

```powershell
firebase deploy
```

部署完成后，CLI 会提供 Hosting URL。

## 后续可扩展点

- 技能系统：
  - 增加技能种类（全局技能、场上持续效果、技能能量系统）
  - 技能与 UI 的多步交互（例如范围选择）
- 模式：
  - 本地双人 / 电脑 AI / 在线对战（Firebase Realtime Database / Firestore / WebRTC）
- 资源：
  - 使用位图或矢量美术替换当前绘制棋子
- 规则：
  - 禁手、禁手提示、悔棋与复盘
- 工程化：
  - 引入打包器（Vite/Rollup）与 TypeScript
  - 单元测试（胜负检测、技能逻辑）
