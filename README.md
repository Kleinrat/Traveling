# 旅衡 MoonTrip

**杭州 / 成都旅行规划 · MoonBit 驱动 · v0.1.0**

选城市、旅行节奏和预算，先拿到一份按时间排列的路书；满意就保存，需要时再调整。景点、午晚餐、站间交通和费用列在同一条时间线上。推荐、时间约束、餐厅去重、调整校验和预算计算由 **MoonBit** 实现。

[在线使用](https://kleinrat.github.io/Traveling/) · [稳定版本](https://github.com/Kleinrat/Traveling/releases/tag/v0.1.0) · [演示视频](https://github.com/Kleinrat/Traveling/releases/download/v0.1.0/moontrip-v0.1.0.mp4) · [测试记录](docs/testing-2026-10-14.md) · [运行检查](https://github.com/Kleinrat/Traveling/actions/workflows/ci.yml)

## 马上开始

1. 选择杭州或成都，选旅行模式，设置天数与**全程每人预算**，点击“生成我的路书”。两天四顿午晚餐可先用每人1000元演示；较小预算可能安排不齐餐次，页面会说明原因。
2. 按每天的时间顺序阅读。展开“查看当天路线地图”，切换日期、缩放地图、点击编号查看地点。绿色为景点，暖色为餐厅。
3. 满意后“保存这份路书”，得到可离线阅读的HTML。要改时再展开“想改一点？”或“看看未安排的地点”，加入 / 替换一站，先预览再确认，也可撤销。

演示视频为实际公网页面的分步截图编排，45秒，无旁白；操作顺序、参数和限制见 [演示说明](docs/demo/README.md)。

## 当前能力

首版聚焦杭州、成都，随项目提供来源快照，无密钥也能规划和调整。**不考虑住宿。**

| 能力 | 公网版 | 本地版 |
|---|---|---|
| 两城来源资料、三种旅行模式、兴趣和习惯条件 | 支持 | 支持 |
| 午晚餐、末站邻近晚餐选择、同品牌 / 相似餐厅名称去重 | 支持 | 支持 |
| 地点分类、加入 / 替换、日期与时刻调整、锁定、预览和撤销 | 支持 | 支持 |
| 预算分项、人数与往返交通、离线HTML / Markdown / JSON导出 | 支持 | 支持 |
| 每日真实地图、编号与地点详情、备用简图 | 联网显示 | 联网显示 |
| AI提取需求，确认后生成 | 支持连接免费后端，部署后启用 | 配置AI后支持 |
| 高德地点查询、真实步行 / 公交候选 | 未启用 | 配置高德后支持 |

### 三种旅行模式

| 模式 | 默认安排 |
|---|---|
| 懒人旅行 | 10:00–18:00，最多2个景点 / 天，站间休息45分钟，美食和同片区优先 |
| 特种兵旅行 | 07:00–22:00，最多6个景点 / 天，休息5分钟，早出晚归 |
| 周末轻旅行 | 2天，09:00–18:00，最多3个景点 / 天，接驳时间和已查询路程设上限 |

景点仍须满足自己的开放窗口，模式不会绕过营业时段。每日景点上限也不保证全部排满。

### 真实地图与交通

使用 Leaflet 1.9.4 和 OpenStreetMap 底图，展开后才加载当前视野瓦片，无需公开密钥。高德地点GCJ-02坐标在显示层近似转为WGS84；底图加载失败仍可使用编号和备用简图。

**虚线仅表示行程顺序，不是道路导航。** 公网版未查询交通时使用片区估算：同片区15分钟 / 8元，跨片区35分钟 / 15元。首站没有计入出发点接驳。已查询路程上限不包含未知距离的路段。

真实步行 / 公交路线候选需要本地配置高德。地图联网加载，离线路书不含底图。保留署名，不预下载、不提供离线地图瓦片，遵守 [OSM瓦片政策](https://operations.osmfoundation.org/policies/tiles/)。

## 资料与预算口径

- 两城景点、餐厅记录保存来源、坐标和查询日期。已有浏览器资料可在“管理地点资料”中点击“载入杭州真实资料 / 载入成都真实资料”更新公开来源；明确由用户整理的同ID记录保留。
- [41条景点证据](docs/source-review-2026-10-15.md)区分官方、旧官方、商业交叉参考和未知资料。当前资料已处理原有待补充记录；博物馆按周一闭馆约束规划，日期未知时不自动安排。公告关闭的金沙及范围有歧义的运河记录被排除。节假日调休、临时闭馆仍需出行前查看公告。
- 景点规划窗口为08:00–17:00与已知可用时段的交集，**不等于统一真实开放时间**；预约、最晚入园和季节差异保留在来源说明中。免费公共区域不含游船、演出等收费项目。
- 餐厅费用为人均消费线索，非实时菜单报价。高德人均消费不会当作景点门票。资料缺失先留待补充，不自动按免费 / 全天开放处理。
- 每人规划预算覆盖活动、餐饮、市内接驳。全团总账分别乘人数，加上用户填写的每人往返交通。全团预算只提示余额或超额，不会自动删行程。往返交通默认0，请按实际补充。
- 没有小红书、抖音或大众点评内容接入。原创虚构资料仅用于测试或主动恢复示例，不能作为真实出行依据。

## 本地安装

需要 **MoonBit、Node.js 22+、Python 3.9+**。本次验证工具链为 `moon 0.1.20261012`，整数采用新版格式器的 `Int32`。从 [MoonBit官方](https://www.moonbitlang.com/download/) 安装工具链。

```sh
git clone https://github.com/Kleinrat/Traveling.git
cd Traveling
# 固定使用发布基线；跟进开发时可使用 main
git checkout v0.1.0
sh scripts/build.sh
python3 scripts/serve.py
```

浏览器打开 **http://127.0.0.1:8787/**。不要直接打开 `web/index.html`。构建生成的 `web/engine.js` 不提交；运行应用无需安装npm开发依赖。

### 可选配置 AI 和高德

```sh
cp .env.example .env
```

编辑本机 `.env`，不使用的密钥留空；修改后重启服务：

```dotenv
AI_API_KEY=填写自己的密钥
AI_BASE_URL=https://api.moonshot.cn/v1
AI_MODEL=kimi-k2.6
AMAP_API_KEY=填写自己的高德Web服务密钥
PORT=8787
```

`.env`被忽略，密钥只由本地服务读取，不进入浏览器或公开产物。AI收到用户需求文本和当前偏好，提议须确认，并由MoonBit校验；公网版通过 `web/runtime-config.json` 连接独立 AI 后端；空地址时保持手动规划。兼容服务需支持聊天补全与JSON输出，具体兼容性须验证。

高德使用 **Web服务** 类型密钥。本地“管理地点资料”可查询或两城批量查询，有限候选进入待核对列表；也可手动添加、导入和导出地点JSON。维护者采集脚本见 `scripts/collect_hangzhou.py` 和 `scripts/collect_chengdu.py`。

## 免费接入公网 AI

已提供 Vercel Hobby 免费函数、MoonBit 构建流程及独立后端。创建服务后，将 Kimi 密钥保存到 Vercel 私有环境变量，再把真实后端地址写入网页配置。Kimi 调用额度单独计算；另保留 Render / 自托管运行入口。具体操作与免费限额见 [免费部署说明](docs/free-ai-deployment.md)。仅提交配置不代表已上线，实际部署需登录服务商账户并验证。

## 验证与稳定版本

```sh
sh scripts/build.sh
moon test --target js
python3 -m unittest discover -s scripts -p 'test_*.py'
node scripts/smoke.mjs
node scripts/check_cities.mjs
node scripts/check_sight_evidence.mjs
node scripts/test_map.mjs
# 页面交互回归的开发依赖
pnpm install --frozen-lockfile --ignore-scripts
node scripts/test_ui.mjs
```

回归基线：**70项MoonBit、23项Python测试**，两城六种模式组合、景点证据、地图适配与DOM交互检查。公网实际验收包括两城地图、日期切换、地点详情、替换预览 / 接受 / 撤销和390像素手机宽度显示。详见 [测试记录](docs/testing-2026-10-14.md)。

`main`通过Actions自动构建、检查并部署；稳定版本在检查通过后单独创建标签和Release，附公开页面压缩包与演示视频。固定版本使用Release或标签，在线演示随main更新。[更新记录](CHANGELOG.md) · [发布说明](docs/releases/v0.1.0.md)

## 实现与边界

`src/engine`为MoonBit推荐、约束、餐饮、路线重排和预算；`src/assistant`为AI契约和输出校验；`src/api`提供JSON接口并编译浏览器模块。JavaScript负责页面 / 地图交互，Python负责本地网络传输和来源字段整理。[接口与数据格式](docs/api.md)

使用确定性的贪心规划，不保证全局最优。未自动核验天气、节假日、预约余量、排队和每周闭馆规则；来源价格并非当天报价，地图转换存在近似误差。首版不含住宿、社交平台采集和公网AI服务。

自研代码采用 [MIT](LICENSE)。Leaflet采用 [BSD-2-Clause](web/vendor/leaflet/LICENSE)，地图署名OpenStreetMap contributors；第三方地点资料的原始链接与日期保留，代码许可证不改变资料的使用条件。AI辅助参与实现与测试，参赛者需理解并掌握实现和质量。

问题或地点纠错请提交 [Issue](https://github.com/Kleinrat/Traveling/issues)，附城市、条件、复现步骤及来源日期；请勿提交密钥或`.env`。
