# 安全策略

## 报告安全问题

请通过 GitHub 仓库的 **Security → Report a vulnerability** 私下提交安全问题。请勿在公开 Issue
中发布 API 凭证、手机号、验证码、两步验证密码、Telegram session、代理密码或可复现的敏感数据。

报告中建议包含受影响版本、复现条件、风险说明和最小化的复现步骤。维护者确认问题前，不承诺具体修复时限。

## 数据与凭证边界

- ChatClear 不内置 Telegram `api_id/api_hash`，由每位用户自行配置。
- API 凭证、代理认证信息和 TDLib 数据库密钥使用 AES-256-GCM 与安装时生成的随机主密钥加密，仅保存在当前系统用户的应用数据目录。
- 应用不会调用 macOS 钥匙串、Windows Credential Manager 或 Linux Secret Service，因此不会出现对应的系统授权窗口。
- 打包时显式关闭 Electron `cookieEncryption` fuse，避免 Chromium Cookie 存储间接调用系统钥匙串；应用不使用 Cookie 保存登录信息。
- 主密钥文件与密文分离，应用在支持权限位的平台上将其限制为当前用户可读写。该设计用于避免磁盘明文和意外泄露，但不能抵御已经获得当前系统用户文件读取权限的恶意程序。
- Telegram session 和 TDLib 数据保存在本机，不上传到 ChatClear 服务。
- 应用不读取消息正文；退出群组只能在用户明确选择并二次确认后执行。

发布构建仍需由发布者配置平台代码签名、公证和可信分发渠道。
