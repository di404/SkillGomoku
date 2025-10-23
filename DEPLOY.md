# 部署到 GitHub Pages 指南

## 快速部署（简化版）

### 步骤 1: 启用 GitHub Pages

1. 进入仓库 Settings → Pages
2. Source 选择 **GitHub Actions**
3. 保存

### 步骤 2: 推送代码触发部署

```bash
git add .
git commit -m "Deploy to GitHub Pages"
git push
```

部署完成后，访问：`https://fuyingdi.github.io/SkillGomoku/skillgomoku.html`

## 安全说明

- Firebase Web 配置（API Key、Project ID 等）本身设计为公开的，可以安全地暴露在前端代码中
- 真正的安全性由 Firebase Security Rules 保证
- 建议在 Firestore 中设置适当的安全规则（参考 `firestore.rules`），限制数据访问

## 部署 Firestore 安全规则

```bash
firebase deploy --only firestore:rules
```
