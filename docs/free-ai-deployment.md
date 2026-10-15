# 免费托管 AI 后端

## 当前部署：Vercel Hobby

生产地址：https://moontrip-assistant.vercel.app。函数区域为Vercel默认区域iad1，使用IPv4 TLS连接及连接超时的一次重试。2026-10-15状态接口返回 configured=true、model=kimi-k2.6；真实请求成功将“十点出门，预算八百元”转换为 start=600、budget=800，经 MoonBit 校验返回。网页入口仍为 https://kleinrat.github.io/Traveling/ 。



当前采用 Vercel Hobby 个人免费方案，GitHub Pages 保留现有网页。导入 `Kleinrat/Traveling` 的 main，Framework 选 Other，保留 `vercel.json` 中的构建配置。环境变量设置 `KIMI_API_KEY`（私有）、`KIMI_MODEL=kimi-k2.6`，允许来源默认为 `https://kleinrat.github.io`。

发布后先实测 `/api/status` 和 `/api/assistant`，再将实际的 HTTPS 后端根地址填入 `web/runtime-config.json`。没有实际地址前保持空值，不声称公网 AI 已启用。

Hobby 限个人、非商业使用，适合本项目的个人演示；超出额度通常暂停对应功能。免费托管不含 Kimi 调用费用。使用前确认账户为 Hobby，勿开通 Pro 试用。官方：[Hobby 方案](https://vercel.com/docs/plans/hobby)。

AI 请求最大45秒，上层函数最多60秒；MoonBit 负责提示词和结果校验，用户确认后再生成路书。每个运行实例最多2个并发、共享3次/分钟和默认30次/天尝试。服务重启和多实例会分别计数，因此这些不是严格的全站次数或账单上限。来源检查不能防止伪造请求，应在 Kimi 账户控制余额/专用密钥额度。密钥不进入网页、仓库或模型错误信息。

## 备选：Render Free

实际操作中当前 Render 账户要求绑卡和1美元临时预授权；用户选择不绑卡，因此未完成 Render 部署。以下保留通用服务器配置供以后自托管使用，不作为当前上线状态。

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
