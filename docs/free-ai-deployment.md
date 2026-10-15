# 免费托管 AI 后端（Render）

目标：GitHub Pages 继续托管公开网页；Render 的 Free Web Service 仅提供 `/api/status` 和 `/api/assistant`。规划、提示词契约和输出校验继续使用 MoonBit 编译产物。无需购买服务器或域名。

## 部署

1. 登录 Render，创建 Blueprint，选择 `Kleinrat/Traveling` 的 `main`。仓库的 `render.yaml` 明确设为 `plan: free`；也可通过公共仓库 URL 新建 Node Web Service。
2. 构建命令 `bash scripts/build_render.sh`，启动命令 `node server/public.mjs`，健康检查 `/healthz`，实例类型 **Free**。
3. 在 Render 环境变量中保存 `KIMI_API_KEY`，不要写入仓库、构建命令或前端配置。`KIMI_MODEL=kimi-k2.6`，`ALLOWED_ORIGIN=https://kleinrat.github.io`，`DAILY_LIMIT=30`。
4. 等待服务 Live，获得实际的 `https://….onrender.com` 地址。先从允许来源请求 `/api/status`，再用实际旅行条件调用 `/api/assistant`。
5. 将实际地址填到 `web/runtime-config.json` 的 `ai_backend`。不要预填猜测的地址。提交后等待 Pages 发布，并验证网页的“整理我的需求 → 确认条件 → 生成路书”。

无须授权 Render 访问其他私有仓库；使用公共仓库部署时可直接填写仓库 URL。注册条款、GitHub OAuth 等账号步骤由账号持有人确认。

## 免费范围与边界

- Render Free 服务闲置 15 分钟会休眠，再次访问约一分钟唤醒。网页等待连接时仍能手动规划，失败后提供重连按钮；不会定时发送保活请求。
- 工作区每月 750 个免费实例小时，另有构建和流量额度。按实际账户页面确认免费实例与额度；本项目不要求升级或添加付费资源。
- **免费的是后端托管，不包含 Kimi API 调用费用。** 使用月之暗面的可用额度，建议使用专用密钥并在服务商账户限制开销。
- 此后端仅允许指定网页来源，拒绝过大请求，最多两个同时处理的请求；共享实例每分钟最多 3 次、每天默认 30 次 AI 尝试。Origin 限制不能阻止伪造请求。
- 免费实例没有持久磁盘。上述计数在重启、休眠后会重置，**不是严格的账户费用上限**。失败的上游请求也计入实例次数。
- 只返回经 MoonBit 校验的条件；用户确认前不会改动行程。不会向浏览器返回密钥、上游原始错误或记录需求正文。
- 此免费后端暂不提供高德管理查询接口；公开地图继续使用现有方案。
- `/healthz` 仅检查进程就绪；`configured: true` 表示存在配置，不代表已验证真实密钥、余额或模型权限，须实际调用验证。

官方说明：[免费实例及限制](https://render.com/docs/free)。
