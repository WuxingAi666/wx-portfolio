# GitHub Pages 部署指南

目标地址：**https://wuxingai66.github.io/wx-portfolio/**

> ⚠️ 部署前请先确认 GitHub 用户名：本包按最新指示使用 `WuxingAi66`（此前素材中出现过 `WuxingAi666`）。
> 若实际账号是 `WuxingAi666`，请全局替换本包内所有 `WuxingAi66` / `wuxingai66` 字样（index.html 中 4 处链接 + 本文档），再部署。

---

## 一、创建仓库

1. 登录 GitHub（github.com），点击右上角 **＋ → New repository**
2. Repository name 填：`wx-portfolio`（必须完全一致）
3. 可见性选 **Public**（GitHub Pages 免费版要求公开仓库）
4. 勾选 **Add a README file**（可选），点击 **Create repository**

## 二、推送代码

在本包解压目录（wx-portfolio 文件夹内）打开终端，依次执行：

```bash
git init
git add .
git commit -m "feat：个人作品集站点首次提交"
git branch -M main
git remote add origin https://github.com/WuxingAi66/wx-portfolio.git
git push -u origin main
```

> 推送时弹出登录窗口：使用浏览器授权登录即可（GitHub 已不支持密码推送）。
> 若提示仓库非空冲突：先 `git pull origin main --allow-unrelated-histories` 再推送。

## 三、开启 GitHub Pages

1. 打开仓库页面 → **Settings → Pages**（左侧栏）
2. **Source** 选 `Deploy from a branch`
3. **Branch** 选 `main`，目录选 `/ (root)`，点击 **Save**
4. 等待 1~3 分钟，刷新该页面，顶部会出现绿色提示：
   `Your site is live at https://wuxingai66.github.io/wx-portfolio/`

## 四、链接验证

逐项检查：

- [ ] 首页能打开：`https://wuxingai66.github.io/wx-portfolio/`
- [ ] 头像、简历下载按钮正常（点击"下载简历"能得到 PDF）
- [ ] 项目卡片图片全部显示（无裂图）
- [ ] 手机打开排版正常（导航折叠为 ☰ 菜单）
- [ ] `Ctrl+F5` 强制刷新后样式正常

## 五、常见问题

| 问题 | 解决 |
|------|------|
| 404 | 确认仓库名是 `wx-portfolio`、文件在仓库根目录（index.html 不在子文件夹里）、Pages 已 Save |
| 样式丢失 | 检查 `css/style.css`、`js/main.js`、`assets/` 是否随仓库一起推送 |
| 更新不生效 | Pages 有缓存，等 1~2 分钟后 `Ctrl+F5` 强刷 |
| 改内容 | 直接编辑仓库里的 `index.html`（每块都有中文注释标记），提交后自动重新部署 |

## 六、后续更新

每次修改本地文件后：

```bash
git add .
git commit -m "docs：更新XX内容"
git push
```

推送后约 1 分钟自动重新部署。
