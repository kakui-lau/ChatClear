<p align="center">
  <img src="./public/chatclear-logo.png" width="112" height="112" alt="ChatClear logo">
</p>

# ChatClear（群清）

ChatClear 是一个本地优先的桌面群组整理工具。它通过 Telegram API 同步会话元数据，并在用户明确选择和确认后，串行执行整理操作。

> 当前状态：0.3.0 预发行版。代码签名、公证和跨平台发行流程已经预留配置，但正式公开发行仍需配置证书、GitHub Secrets 并完成真实账号的小批量验收。

## 已实现

- 手机号、验证码、两步验证密码和邮箱验证登录流程
- 首次启动时由用户自行填写 `api_id/api_hash`
- SOCKS5 与 HTTP CONNECT 代理设置、连接状态提示和 25 秒超时恢复
- API 凭证与代理认证信息使用操作系统安全存储加密
- TDLib 本地数据库与系统安全存储保护的数据库密钥
- 主列表及归档中的群组/频道同步，不读取消息正文
- 包含/排除关键词、类型、位置、身份、成员数、活跃时间和观察清单组合筛选
- 筛选方案保存、90 天未活跃快捷选择和 7 天观察清单
- 按账号隔离的本地白名单；群主强制锁定，可选默认保护管理员
- 归档、取消归档、静音、清除本人聊天历史和退出群组
- 危险操作二次确认、串行执行、限流等待、进度显示、安全暂停、断点恢复和失败重试
- 本地操作历史与 CSV 导出
- 最多 10 个本地 Telegram 账号与独立加密 TDLib session
- 本地偏好备份与恢复（不包含 API 凭证或 Telegram session）
- 简体中文/英文、浅色/深色/跟随系统主题
- 启动更新检查、GitHub Release 下载入口和默认关闭的可选崩溃报告
- 注销 Telegram 会话
- Electron 安全隔离：渲染进程不能访问 Node.js、应用凭证或 TDLib session
- 单实例运行、受限权限、外部导航拦截与全局错误恢复界面
- 键盘焦点、减少动态效果和自适应登录窗口等无障碍体验

## 本地开发

要求 Node.js 24 和 pnpm 11。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

首次启动后，在界面中填写从 [my.telegram.org/apps](https://my.telegram.org/apps) 取得的
`api_id/api_hash`。开发构建和发行包都不包含任何预置 Telegram API 凭证。

常用检查：

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm package
pnpm check
```

不要把用户 session、验证码、两步验证密码或 Telegram API 凭证写入源码和日志。

## 架构

```text
React renderer
    │ 受限 IPC
Electron preload
    │ 白名单命令
Electron main
    │
tdl Node binding
    │
Telegram TDLib
```

Telegram 网络访问、登录流程、本地数据库和文件导入导出全部位于 Electron 主进程。渲染进程只能调用预定义且经过参数校验的接口。

## 用户凭证与网络

每位用户使用自己的 `api_id/api_hash`。凭证在首次启动页输入，由 Electron `safeStorage`
加密后保存在当前操作系统用户的应用数据目录；渲染进程不会读回已保存的明文凭证。

部分网络无法直连 Telegram。此时可在首次启动页设置 SOCKS5 或 HTTP CONNECT 代理；本地代理常见地址为 `127.0.0.1`，实际端口以代理软件显示为准。连接超过 25 秒仍未进入验证码步骤时，应用会停止本次连接并提示检查网络或代理。

## 发行自动化与签名

`.github/workflows/release.yml` 可手动运行，或在推送 `v*` 标签时构建 macOS arm64、Windows x64 和 Linux x64 包；标签构建会创建 GitHub Release。未提供签名密钥时产物仅适合内部测试。

发行工作流按平台隔离签名凭据：macOS 使用 `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`，Windows 使用 `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`。macOS 已启用 Hardened Runtime 和最小运行权限；配置 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 与 `APPLE_TEAM_ID` 后可由 Electron Builder 完成公证。所有值都应只保存在 GitHub Secrets 或受保护的发布机器中，不能写入仓库。

## 发布前清单

- 配置 macOS Developer ID 签名与公证
- 配置 Windows Authenticode 签名
- 配置可信的更新签名；应用当前只检查 GitHub Release 并由用户打开下载页，不静默安装
- 将隐私说明草案补齐发行主体、联系渠道、适用地区和用户权利
- 在商店介绍与首次启动页明确声明使用 Telegram API
- 不在产品名称或图标中冒充 Telegram 官方应用
- 在测试账号和小批量真实账号上验证限流、断网与恢复流程
- 对 TDLib 原生库和 Electron 依赖执行发布前供应链审计

## 数据边界

ChatClear 不读取消息正文，不上传 session，不提供云端账号托管，也不在后台自动退群。群组退出属于不可撤销操作；私有群可能需要新的邀请链接才能重新加入。

详见 [PRIVACY.md](./PRIVACY.md)、[SECURITY.md](./SECURITY.md)、
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)、[更新记录](./CHANGELOG.md)、
[参与开发](./CONTRIBUTING.md) 和 [品牌说明](./docs/BRAND.md)。

## Telegram 条款

本项目是使用 Telegram API 的非官方工具，与 Telegram 官方无隶属或认可关系。发行和使用时需遵守 [Telegram API Terms of Service](https://core.telegram.org/api/terms)。
