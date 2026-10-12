@echo off
chcp 65001 >nul
echo ========================================
echo  作品集 GitHub Pages 一键部署 (wx-portfolio)
echo  方式与小账本一致：推送到 main 分支根目录
echo ========================================
echo.

:: 进入本脚本所在目录（即 wx-portfolio 根目录）
cd /d %~dp0

echo [1/4] 配置 Git 身份...
git config --global user.email "wuxingai666@github.com"
git config --global user.name "WuxingAi666"

echo [2/4] 初始化/关联远程仓库...
git init -q 2>nul
git remote remove origin 2>nul
git remote add origin https://github.com/wuxingai666/wx-portfolio.git

echo [3/4] 拉取远程更新并本地提交...
git pull origin main --allow-unrelated-histories --no-edit 2>&1
git add -A
git commit -m "Update portfolio: 仵星的个人作品集" --allow-empty

echo [4/4] 推送到 main 分支（GitHub Pages 自动从 main 根目录构建）...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo  ✅ 部署成功！稍等 1-2 分钟构建后即可访问：
    echo  https://wuxingai666.github.io/wx-portfolio/
    echo ========================================
) else (
    echo.
    echo ❌ 部署失败，请检查网络或 GitHub 登录状态后重试
)
echo.
pause
