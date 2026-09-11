# 参与开发

ChatClear 使用 Node.js 24、pnpm 11 和 Electron。提交变更前请先创建分支，并确保没有把真实
Telegram API 凭证、手机号、验证码、session 或代理密码加入代码、测试、截图和日志。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

涉及退出群组、凭证存储、IPC 或外部链接的改动，应同时补充相应测试并说明数据和安全边界。
界面改动需验证键盘操作、焦点状态、窗口自适应及减少动态效果设置。

提交 Pull Request 时，请简述用户可见变化、验证方式以及仍未覆盖的风险。不要提交 `dist/`、
`out/`、本地环境文件或用户数据。
