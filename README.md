<p align="center">
  <img src="./public/chatclear-logo.png" width="112" height="112" alt="ChatClear logo">
</p>

# ChatClear（群清）

ChatClear 是一个本地优先的桌面群组整理工具。它通过 Telegram API 在用户明确选择和确认后，串行退出群组或频道。

> 当前状态：可运行的桌面端 MVP。应用图标、自动化质量检查和安全边界已建立；正式发行前仍需完成代码签名、公证、自动更新和发布渠道配置。

## 已实现

- 手机号、验证码、两步验证密码和邮箱验证登录流程
- 首次启动时由用户自行填写 `api_id/api_hash`
- SOCKS5 与 HTTP CONNECT 代理设置、连接状态提示和 25 秒超时恢复
- API 凭证与代理认证信息使用操作系统安全存储加密
- TDLib 本地数据库与系统安全存储保护的数据库密钥
- 主列表及归档中的群组/频道同步
- 按名称、类型和位置筛选
- 本地白名单
- 群主创建的群强制锁定
- 管理员群退出警告
- 输入确认文字后才能批量退出
- 串行退出、进度显示和安全停止
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

Telegram 网络访问、登录流程和本地数据库全部位于 Electron 主进程。渲染进程只能调用预定义的状态、登录、列表、退出和注销接口。

## 用户凭证与网络

每位用户使用自己的 `api_id/api_hash`。凭证在首次启动页输入，由 Electron `safeStorage`
加密后保存在当前操作系统用户的应用数据目录；渲染进程不会读回已保存的明文凭证。

部分网络无法直连 Telegram。此时可在首次启动页设置 SOCKS5 或 HTTP CONNECT 代理；本地代理常见地址为 `127.0.0.1`，实际端口以代理软件显示为准。连接超过 25 秒仍未进入验证码步骤时，应用会停止本次连接并提示检查网络或代理。

## 发布前清单

- 配置 macOS Developer ID 签名与公证
- 配置 Windows Authenticode 签名
- 配置可信的更新签名和发布地址
- 完成隐私政策、用户协议和第三方许可清单
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
