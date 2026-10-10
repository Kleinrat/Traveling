# 旅衡 MoonTrip

选城市，描述旅行风格与习惯，比较候选方案，自己选定地点并调整行程。
MoonTrip 是以 **MoonBit 为主要实现语言** 的开源旅行规划应用和可复用规划库。

## 已实现

- 城市、兴趣、每日作息、每天景点上限、亲子、雨天和慢游条件。
- 均衡、预算优先、兴趣优先三种方案比较。不同策略可能得出相同方案。
- 心仪地点锁定、排除、移除、顺序调整；不可行的选择会返回明确冲突。
- 午餐候选安排和素食 / 不辣标签筛选；景点、餐饮与接驳费用分项计算。
- 带来源链接的餐厅资料卡：保存用户核对的餐厅信息与原始网页链接。
- 本地保存条件与资料，导入 JSON，导出 JSON、Markdown 和单文件离线路书。
- 可配置的 OpenAI 兼容 AI 接口：自然语言 → 条件提议 → 用户确认 → MoonBit 校验规划。
- 无密钥时，手动条件和完整行程演示仍然可运行。

**当前版本是可运行的原型。内置杭州、成都的 23 条数据全部是原创虚构测试资料，
不是实际景点 / 餐厅的名称、价格或营业信息。其他城市需导入或添加资料。**

## 快速运行

需要 MoonBit、Node.js 22+、Python 3.9+。没有前端依赖，不需要安装 npm 包。
MoonBit 安装见 [官方工具链页面](https://www.moonbitlang.com/download/)。

```sh
git clone https://github.com/Kleinrat/Traveling.git
cd Traveling
sh scripts/build.sh
python3 scripts/serve.py
```

打开 `http://127.0.0.1:8787`。
构建生成的 `web/engine.js` 来自 MoonBit 源码，不提交到仓库。
本地构建已验证工具链版本：`moon 0.1.20260920`。

```sh
moon test --target js
python3 scripts/test_host.py
node scripts/smoke.mjs
moon run src/main --target js
```

如果 Node 不在默认路径，可设置 `MOONTRIP_NODE=/absolute/path/to/node`。

## 三个完整使用场景

1. **周末低预算游**：选杭州、两天，文化与自然兴趣，控制活动预算；
   比较三种方案，勾选心仪景点，删掉不想去的地点，再查看费用与来源。
2. **亲子慢游**：选成都，晚一点出门，每天最多两个景点，开启亲子和慢游，
   开启午餐并选择不辣；选择餐厅，调整地点优先级，观察路线和预算变化。
3. **雨天调整**：选择“雨天也精彩”，改为室内行程；导入更多室内地点，
   保留心仪地点、替换户外活动，导出离线路书在手机或电脑上查看。

## 分享在线测试版

仓库提供 GitHub Pages 发布流程。启用仓库 Settings → Pages → Source → GitHub Actions 后，
main 分支更新自动编译 MoonBit 并发布浏览器演示。发布产物仅包含四个公开页面资源，
不包含服务器、密钥或本机配置。在线演示支持手动规划、方案比较、调整和导出，未启用 AI。
首次部署成功后以 Pages 设置页显示的实际网址为准。

本地预览公开产物：

```sh
sh scripts/build.sh
python3 scripts/build_pages.py
python3 -m http.server 8788 --directory _site
```

## AI 服务

已支持 Kimi K2.6；也可连接支持 `/chat/completions` 和 JSON 输出的 OpenAI 兼容服务即可。
密钥只由本地 Python 传输层读取，不进入浏览器、公开仓库或日志。

```sh
export AI_API_KEY='在本机设置的密钥'
export AI_BASE_URL='https://你的服务地址/v1'
export AI_MODEL='你的模型名称'
python3 scripts/serve.py
```

复制 `.env.example` 到 `.env` 填入本机配置即可；环境变量优先于 `.env`。
`.env` 被 Git 忽略，不应上传。Kimi 使用 `https://api.moonshot.cn/v1` 与 `kimi-k2.6`，
按 [官方参数文档](https://platform.kimi.com/docs/api/models-overview) 使用非思考模式，
不强制设置 temperature，避免模型固定参数导致请求失败。
在“旅行风格与习惯”中输入需求，点击“整理我的需求”，核对建议后确认。
请求会把当前偏好和这段文本发送给你配置的 AI 服务；餐厅来源资料不会随此请求发送。
AI 输出不能修改用户选定 / 排除的地点，也不能绕过 MoonBit 的范围校验。

已在 2026-10-11 配置 Kimi K2.6 并验证真实需求提取；公开仓库不包含密钥，其他使用者需自行配置。
本地模拟服务验证 HTTP → 模型输出 → MoonBit 校验链路。用户须确认提议，语义理解可能有偏差。

## 自定义餐厅资料

“添加景点或餐厅资料”中填写城市、片区、停留时间、人均费用、可用时间窗口、标签，
以及一个或多个来源链接和核对笔记。
资料作为候选项参与同一套时间、费用和饮食条件规划，用户可以自行选择餐厅。

链接和笔记由用户整理。`素食` / `不辣` / `亲子适合` 是资料标签，不是现场服务保证。
目前支持午餐规划。

## MoonBit 库与数据接口

`src/engine` 实现模型、输入校验、评分、硬约束、行程编排、地点顺序、餐饮条件和预算。
`src/assistant` 实现 AI 提示契约和输出校验；`src/api` 编译为 JavaScript 模块供浏览器与服务器调用。
`web/app.js` 只负责表单、界面事件和下载，`scripts/serve.py` 只负责本地 HTTP 与模型请求。
规划逻辑不在 JavaScript / Python 中重新实现。

MoonBit 使用示例见 `src/main/main.mbt`。公共入口：

```moonbit
@engine.validate(input) // Array[String]
@engine.plan(input)     // Result[Plan, Array[String]]
```

主接口：`plan_json(input_json)`；策略对比：`alternatives_json(input_json)`。
成功返回 `{ "ok": true, "plan": ... }`，失败返回 `{ "ok": false, "errors": [...] }`。
景点 / 餐厅都用 `Place`，`kind` 为 `sight` 或 `food`。
导入文件可以是 `Place[]`，也可以是导出的 `{request, places, plan}`。
恢复导出文件时加载地点资料；条件可在界面重设。

```json
[
  {
    "id": "my-lunch", "name": "你核对过的餐厅", "city": "你的城市",
    "district": "中心", "kind": "food", "tags": ["美食", "不辣"],
    "cost": 50, "duration": 60, "open": 660, "close": 840,
    "indoor": true, "family": true,
    "url": "https://example.com/source",
    "source": "用户核对的人均消费依据和信息日期；未自动验证"
  }
]
```

钱为每人整元人民币；时间为午夜起分钟数，例如 09:00=540。
预算涵盖当前已安排的活动、餐饮估算和市内接驳；不含住宿和往返大交通。
重复地点 ID、异常费用、非法时间、缺失来源和非 HTTP(S) 链接会被拒绝。

## 算法与边界

- 决定性贪心算法：按心仪地点顺序优先，其他地点按兴趣 / 费用 / 邻近评分选取。
- 总预算、开放窗口、每日时间、亲子 / 雨天 / 饮食条件、每天景点数为硬约束。
- 每天安排至多一个午餐；接近用餐时段时提高餐厅优先级。
- 必选地点无法全部安排时返回冲突；普通候选不能安排时给出排除原因。
- 不保证全局最优，算法失败也不证明数学上不存在其他可行行程。
- 接驳为演示估计：首站 0 分钟/0 元，同片区 15 分钟/8 元，跨片区 35 分钟/15 元。
- 普通站间休息 20 分钟，慢游 45 分钟。无地图、实时路况、闭馆日期、天气 API 或预约接口。
- 同一地点全程至多访问一次；实际预算和营业时间应在出行前重新核实。

## 工程与参赛记录

参赛官网：[2026 MoonBit 黑客松](https://moonbitlang.github.io/Hackathon2026/)。
参赛要求核对见 [docs/competition.md](docs/competition.md)；开发路线见 [docs/roadmap.md](docs/roadmap.md)。
提交按实质模块演进保留，禁止空提交、无意义拆分和伪造测试数量。
申报书由参赛者本人撰写，此仓库不包含 AI 代写的申报书。

## 来源与许可证

本项目自研代码采用 MIT 许可证。内置样例数据由本项目原创编写。
使用 MoonBit 标准库及官方工具链；运行时使用 Node.js、Python 标准库和浏览器原生 API。
无复制的第三方旅游项目代码、页面模板或文案。
用户导入资料的来源记录随导出文件保留；公开共享前请核实使用权限。
AI 辅助参与实现与测试，参赛者应理解算法、边界和实现后再提交验收。
