# 旅衡 MoonTrip

**杭州 / 成都旅行规划，用 MoonBit 把偏好变成可调整的路书。**

选城市、旅行节奏和预算，直接拿到按时间排列的景点、午晚餐与接驳安排。也可以描述自己的习惯，让 Kimi 整理条件，确认后再生成。想换地方时，预览变化、接受或撤销，费用同步更新。

[在线使用](https://kleinrat.github.io/Traveling/) · [观看新版演示](https://kleinrat.github.io/Traveling/demo.html) · [测试记录](docs/testing-2026-10-21.md) · [持续集成](https://github.com/Kleinrat/Traveling/actions/workflows/ci.yml)

[![观看91秒功能演示](web/media/moontrip-demo-2026-10-21.jpg)](https://kleinrat.github.io/Traveling/demo.html)

91秒中文分步演示，展示真实公网页面与一次真实 Kimi 请求；由操作截图编排，无旁白、非连续录屏。[演示步骤与归档](docs/demo/README.md)

## 三步开始

1. **说说怎么旅行。** 选择杭州或成都、天数、出发日期、旅行模式和全程每人预算。可直接生成，也可点“整理我的需求”，核对 AI 提取的条件后确认。
2. **先看完整路书。** 时间线包含景点、午晚餐、接驳估算和预算。展开地图，切换日期查看当天地点。
3. **需要时再调整。** 从未安排的景点 / 餐厅中加入或替换一站，先预览再接受；支持撤销、日期与时刻调整、锁定。满意后保存 HTML 路书，也可导出 Markdown / JSON。

不用 AI、没有密钥也能手动规划。两天四顿午晚餐可先用每人1000元体验；预算不足或条件冲突时会说明原因。**当前聚焦两城，不考虑住宿。**

## 核心能力

| 能力 | 当前实现 |
|---|---|
| 理解偏好 | 公网接入 kimi-k2.6，提取预算、兴趣与作息；确认前不改路书 |
| 安排餐饮 | 午餐与晚餐；晚餐优先靠近末站；按品牌及相似名称抑制重复 |
| 自主调整 | 景点 / 餐厅分类候选，加入、替换、预览、接受、撤销 |
| 计算费用 | 活动、餐饮、市内接驳分项；人数与用户填写的往返交通总账 |
| 查看路线 | Leaflet + OpenStreetMap 真实底图、日期切换、编号与地点详情 |
| 保存与资料 | HTML / Markdown / JSON 导出；地点来源、日期和费用说明 |

| 旅行模式 | 默认节奏 |
|---|---|
| 懒人旅行 | 10:00–18:00，每天最多2个景点，站间休息45分钟，美食与少转场优先 |
| 特种兵旅行 | 07:00–22:00，每天最多6个景点，站间休息5分钟，早出晚归 |
| 周末轻旅行 | 2天，09:00–18:00，每天最多3个景点，限制接驳时间与已查询路程 |

模式不能绕过地点开放窗口；景点上限不保证排满。博物馆按已记录的每周闭馆规则处理，日期未知时不自动安排相关地点。

## 本地运行

需要 **MoonBit、Node.js 22+、Python 3.9+**。验证工具链为 `moon 0.1.20261012`。[安装 MoonBit](https://www.moonbitlang.com/download/)

```sh
git clone https://github.com/Kleinrat/Traveling.git
cd Traveling
sh scripts/build.sh
python3 scripts/serve.py
```

打开 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)，不要直接打开 `web/index.html`。上述命令使用当前 `main`；构建生成的 `web/engine.js` 不提交，日常运行无需安装 npm 开发依赖。

可运行 MoonBit 命令行示例：

```sh
moon run src/main --target js
```

### 可选：自己的 AI 与高德服务

```sh
cp .env.example .env
```

在本机 `.env` 填写 `AI_API_KEY`，默认服务为 `https://api.moonshot.cn/v1`，模型 `kimi-k2.6`。需要高德地点与步行 / 公交查询时，填写 **Web服务类型**的 `AMAP_API_KEY`，重启本地服务。不使用的密钥留空。

`.env` 被忽略；密钥由服务端读取，不放进浏览器。高德批量查询入口位于“管理地点资料”，查询结果仍需核对后使用。其他兼容 AI 服务需支持聊天补全与 JSON 输出，兼容性需单独验证。

公网版通过独立 Vercel Hobby 后端接入 Kimi，配置入口为 `web/runtime-config.json`。免费托管与 Kimi 调用额度分别计算；当前限流为实例内计数，不能当作账户级费用上限。[部署与限额说明](docs/free-ai-deployment.md)

## 资料与使用边界

- **两城共66个可规划地点：39个景点、27家餐厅。** [41条景点证据](docs/source-review-2026-10-15.md)区分官方、旧官方、商业参考与未知信息；关闭或范围有歧义的2条记录已排除。处理完待补充记录不代表实时核验了所有价格。
- 景点规划窗口采用08:00–17:00与已知可用时段的交集，**不是所有地点的真实营业时间**。预约、季节差异和最晚入园见来源；节假日调休、临时闭馆仍需出行前看公告。公共区域免费不包含游船、演出等项目。
- 餐厅费用是人均消费线索，非实时菜单报价。每人规划预算包含活动、餐饮和市内接驳；全团总账再加用户填写的往返交通，默认往返费用为0。全团预算提示不会自动删行程。
- **地图虚线表示访问顺序，不是道路导航。** 公网交通暂按片区估算：同片区15分钟 / 8元，跨片区35分钟 / 15元；首站不含出发点接驳。真实高德路线候选需本地配置，未知距离不计入已查询路程上限。
- 地图联网显示，坐标转换存在近似误差；离线 HTML 不含地图瓦片。保留 OpenStreetMap 署名，按需加载，不预下载。[OSM瓦片政策](https://operations.osmfoundation.org/policies/tiles/)
- 确定性的贪心规划不保证全局最优。不提供住宿、社交平台采集、实时天气 / 排队 / 预约余量；AI 提取结果须确认，不能代替来源核实。

## 验证与版本

```sh
sh scripts/build.sh
moon test --target js
python3 -m unittest discover -s scripts -p 'test_*.py'
node scripts/smoke.mjs
node scripts/check_cities.mjs
node scripts/check_sight_evidence.mjs
node scripts/test_map.mjs
node scripts/test_worker.mjs
node scripts/test_public.mjs
node scripts/test_hosted.mjs
# 页面交互回归需要开发依赖
pnpm install --frozen-lockfile --ignore-scripts
node scripts/test_ui.mjs
# 打包公开静态站点
python3 scripts/build_pages.py
```

当前基线为 **75项 MoonBit、23项 Python 测试**，另有两城模式组合、地图、AI适配与页面交互检查。[本次演示验收](docs/testing-2026-10-21.md) · [功能回归记录](docs/testing-2026-10-15.md)

在线应用随 `main` 更新，GitHub Actions 负责检查与 Pages 部署。**[v0.1.0](https://github.com/Kleinrat/Traveling/releases/tag/v0.1.0)是2026-10-14的历史稳定基线**，早于公网 AI 和后续日历改进；体验本文功能请使用在线应用或当前 `main`。[更新记录](CHANGELOG.md)

## 实现与许可

MoonBit 实现推荐、时间约束、餐厅去重、路书调整校验、预算计算及 AI 契约：`src/engine`、`src/assistant`、`src/api`。JavaScript 负责页面与地图，Python 提供本地传输，Node.js 提供公网 AI 传输；AI 输出仍经 MoonBit 校验。[接口与数据格式](docs/api.md)

自研代码采用 [MIT](LICENSE)，Leaflet 采用 [BSD-2-Clause](web/vendor/leaflet/LICENSE)。第三方地点资料保留原始链接与日期，代码许可不改变资料使用条件。AI 辅助参与实现与测试，参赛者需理解并掌握实现和质量。

反馈请提交 [Issue](https://github.com/Kleinrat/Traveling/issues)，附城市、条件、复现步骤或来源日期；请勿提交密钥和 `.env`。
