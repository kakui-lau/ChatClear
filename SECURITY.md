# 安全策略

## 报告安全问题

请通过 GitHub 仓库的 **Security → Report a vulnerability** 私下提交安全问题。请勿在公开 Issue
中发布 API 凭证、手机号、验证码、两步验证密码、Telegram session、代理密码或可复现的敏感数据。

报告中建议包含受影响版本、复现条件、风险说明和最小化的复现步骤。维护者确认问题前，不承诺具体修复时限。

## 数据与凭证边界

- ChatClear 不内置 Telegram `api_id/api_hash`，由每位用户自行配置。
- API 凭证和代理认证信息由 Electron `safeStorage` 加密并仅保存在当前系统用户的应用数据目录。
- Linux 环境若只能使用 `basic_text` 后备存储，应用会拒绝保存凭证并提示启用 Secret Service。
- Telegram session 和 TDLib 数据保存在本机，不上传到 ChatClear 服务。
- 应用不读取消息正文；退出群组只能在用户明确选择并二次确认后执行。

发布构建仍需由发布者配置平台代码签名、公证和可信分发渠道。
