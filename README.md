<p align="center">
  <img src="./public/chatclear-logo.png" width="112" height="112" alt="ChatClear logo">
</p>

<h1 align="center">ChatClear（群清）</h1>

<p align="center">
  本地优先、安全可控的 Telegram 群组与频道整理工具。
</p>

<p align="center">
  <a href="https://github.com/kakui-lau/ChatClear/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/kakui-lau/ChatClear/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/kakui-lau/ChatClear/releases"><img alt="Release" src="https://img.shields.io/github/v/release/kakui-lau/ChatClear?include_prereleases"></a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-1f6f57">
</p>

<p align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</p>

ChatClear 使用 Telegram 官方 TDLib 同步群组和频道元数据，帮助用户筛选、保护并批量整理会话。消息正文不会被读取；API 凭证、Telegram session、偏好和操作记录均保存在用户自己的电脑上。

> ChatClear 是非官方 Telegram 客户端工具，与 Telegram 无隶属、合作或认可关系。请遵守 Telegram API 条款及所在地法律法规。

## 下载

前往 [GitHub Releases](https://github.com/kakui-lau/ChatClear/releases) 下载最新预发行版。

| 系统    | 架构                  | 安装包           | 说明                 |
| ------- | --------------------- | ---------------- | -------------------- |
| macOS   | Apple Silicon / arm64 | `.dmg` 或 `.zip` | 适用于 M1 及后续芯片 |
| Windows | x64                   | `.exe`           | NSIS 安装程序        |
| Linux   | x64                   | `.AppImage`      | 下载后赋予执行权限   |

当前公开包尚未配置 Apple Developer ID、苹果公证和 Windows Authenticode 签名。macOS 包会使用完整的临时签名，但系统仍可能显示无法验证开发者；Windows 可能显示 SmartScreen 提示。请只从本仓库 Releases 下载，并在确认校验信息后安装。正式生产分发前应完成代码签名和公证。

macOS 首次打开被拦截时，请在“系统设置 → 隐私与安全性”中核对应用名称后选择“仍要打开”。不要对来源不明或校验值不匹配的安装包绕过系统安全检查。

## 核心能力

### 精准筛选

- 包含与排除关键词，可用逗号组合多个条件
- 按群组/频道、主列表/归档、群主/管理员/成员筛选
- 按成员数量、最近活跃时间和观察清单筛选
- 保存常用筛选方案，一键选择 90 天未活跃会话

### 安全批处理

- 批量归档、取消归档、静音、清除本人聊天历史和退出群组
- 群主创建的会话始终锁定，可选择默认保护管理员会话
- 本地白名单保护与 7 天观察清单
- 危险操作需要输入精确确认短语
- 串行执行、Telegram 限流等待、安全暂停、断点恢复和失败重试

### 本地优先

- 不读取或展示消息正文
- 不上传 Telegram session，不提供云端账号托管
- API 凭证、代理密码和 TDLib 数据库密钥使用 AES-256-GCM 与本机随机密钥加密，不调用系统钥匙串
- 本地审计历史与 CSV 导出；导出时防止表格公式注入
- 偏好备份只包含设置、筛选方案、白名单和观察清单
- 最多管理 10 个本地账号，每个账号使用独立 TDLib 数据目录和密钥

### 桌面体验

- 简体中文与英文
- 浅色、深色与跟随系统主题
- 固定应用框架与单一列表滚动区域，适合大量群组
- 键盘焦点、跳过链接和减少动态效果支持
- 启动更新检查与 GitHub Release 下载入口
- 默认关闭的可选崩溃报告

## 快速开始

1. 从 Releases 下载对应系统的安装包并启动 ChatClear。
2. 登录 [my.telegram.org/apps](https://my.telegram.org/apps)，创建 Telegram API 应用并取得 `api_id` 和 `api_hash`。
3. 在 ChatClear 首次启动页面输入自己的凭证；应用不会内置或共享开发者凭证。
4. 输入带国家或地区代码的手机号，例如 `+8613812345678`。
5. 在 Telegram 官方客户端中查看验证码，并按界面提示完成两步验证或邮箱验证。
6. 如所在网络无法连接 Telegram，可在连接设置中配置 SOCKS5 或 HTTP CONNECT 代理。

登录后先使用筛选、白名单和观察清单缩小范围，再审核所选会话。退出私有群后可能无法重新加入，建议先归档或观察，再进行不可撤销操作。

## 数据与隐私

ChatClear 仅从 Telegram 获取整理列表所需的元数据：会话名称、类型、成员数量、当前账号身份、归档/静音状态和最近活动时间。

以下内容不会包含在偏好备份中：

- `api_id`、`api_hash` 与代理认证信息
- Telegram session 和 TDLib 数据库密钥
- 手机号、验证码及两步验证密码
- 本地操作历史、失败任务和未完成任务

本地数据通常位于 Electron 的应用数据目录：

- macOS：`~/Library/Application Support/chatclear`
- Windows：`%APPDATA%\chatclear`
- Linux：`$XDG_CONFIG_HOME/chatclear` 或 `~/.config/chatclear`

完整说明见 [PRIVACY.md](./PRIVACY.md) 和 [SECURITY.md](./SECURITY.md)。

## 技术架构

```text
React Renderer
      │ 仅允许白名单 IPC
Electron Preload
      │ contextIsolation + sandbox
Electron Main Process
      ├── 本地加密文件存储
      ├── 本地偏好与审计记录
      └── tdl / Telegram TDLib
```

本地加密主密钥与密文均位于当前系统用户的应用数据目录，文件权限会尽量限制为当前用户可读写。这种模式可避免 macOS 钥匙串授权窗口，并能防止凭证以明文形式出现在磁盘中；但它不等同于操作系统钥匙串，已经能够读取当前用户应用数据目录的恶意程序仍可能同时取得密钥和密文。

从 0.3.1 或更早版本升级到 0.3.2 时，ChatClear 不会访问旧版钥匙串数据，因此需要重新填写一次连接设置并重新登录 Telegram。旧版 session 文件不会被新版本加载。

网络、登录、批处理、文件导入导出和系统能力全部位于 Electron 主进程。渲染进程不能访问 Node.js、凭证明文或 TDLib session。

## 本地开发

要求：

- Node.js 24
- pnpm 11
- macOS、Windows 或 Linux 桌面环境

```bash
git clone https://github.com/kakui-lau/ChatClear.git
cd ChatClear
pnpm install --frozen-lockfile
pnpm dev
```

质量检查与构建：

```bash
pnpm check
pnpm package
pnpm dist -- --mac --arm64
pnpm dist -- --win --x64
pnpm dist -- --linux --x64
```

`pnpm check` 会依次执行 ESLint、Prettier、TypeScript、Vitest 和生产构建。请勿把 `.env`、用户 session、验证码、两步验证密码或 Telegram API 凭证提交到仓库。

## 跨平台发布

[Release workflow](./.github/workflows/release.yml) 在推送 `v*` 标签时并行构建 macOS arm64、Windows x64 和 Linux x64 包，随后上传到同一个 GitHub Release。也可从 Actions 页面手动运行工作流，仅生成构建产物而不创建 Release。

正式签名需要在 GitHub Secrets 中配置：

| 平台         | Secrets                                                    |
| ------------ | ---------------------------------------------------------- |
| macOS 签名   | `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`                     |
| macOS 公证   | `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` |
| Windows 签名 | `WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`                     |

发布步骤：

```bash
pnpm check
git tag v0.3.2
git push origin v0.3.2
```

未配置签名 Secrets 时工作流仍会生成预发行测试包，但不应把它们描述为已签名版本。

## 项目文档

- [更新记录](./CHANGELOG.md)
- [隐私说明](./PRIVACY.md)
- [安全策略](./SECURITY.md)
- [验收记录](./ACCEPTANCE.md)
- [第三方声明](./THIRD_PARTY_NOTICES.md)
- [贡献指南](./CONTRIBUTING.md)
- [品牌规范](./docs/BRAND.md)

## 联系与支持

- Telegram：[@tg_kakui](https://t.me/tg_kakui)
- Issues：[提交问题或功能建议](https://github.com/kakui-lau/ChatClear/issues)
- 赞助地址：`0x435d2f7f70c220e4218adfa090da964928888888`

赞助转账前请自行确认所使用的区块链网络、币种和地址。链上交易通常不可撤销。

## Telegram API 条款

使用、修改或分发本项目时，请同时遵守 [Telegram API Terms of Service](https://core.telegram.org/api/terms)。应用名称、图标与介绍不得暗示 ChatClear 是 Telegram 官方产品。
