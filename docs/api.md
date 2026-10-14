# MoonBit接口与地点格式

### 规划接口与数据

MoonBit 使用示例见 [src/main/main.mbt](src/main/main.mbt)。编译后的主要 JSON 入口：

| 接口 | 用途 |
|---|---|
| `plan_with_preferences_json` | 按条件、模式、餐次和路线资料规划 |
| `alternatives_with_preferences_json` | 比较三种推荐取向 |
| `edit_plan_json` | 校验手动日期、顺序和开始时间 |
| `choose_plan_json` | 三态地点选择、指定日期与锁定约束 |
| `arrange_plan_json` | 按数组顺序重排或精确校验，保留锁定时刻 |
| `replacements_json` | 当前一站的最多三项可行替代，保留其余地点与日期 |
| `suggestions_json` | 基于路线候选生成可预览的改进方案 |
| `route_options_json` | 校验交通候选及可选步行量、换乘数 |
| `reflow_plan_json` | 保留地点和日期，按路线重新编排时间 |
| `trip_cost_json` | 计算人数、往返交通和全团预算 |
| `route_query_json` / `route_result_json` | 校验路线请求及高德结果 |

旧入口 `plan_json`、`alternatives_json` 继续兼容。成功返回 `{"ok":true,"plan":...}` 或对应结果，失败返回 `{"ok":false,"errors":[...]}`。
旅行规划接口可传入 `meals: {lunch, dinner}` 和 `routing: {mode, strict, distance_limit, routes}`；路程单位为米。

景点和餐厅统一使用 `Place`。导入支持 `Place[]` 或含 `places` 的导出对象；导入文件会加载地点资料，不会完整恢复导出行程的条件与手动安排。
下例只是格式示例，费用、来源和标签须替换为核对过的资料：

```json
[
  {
    "id": "my-restaurant",
    "name": "自定义餐厅",
    "city": "杭州",
    "district": "上城区",
    "kind": "food",
    "tags": ["美食"],
    "cost": 50,
    "duration": 60,
    "open": 660,
    "close": 1260,
    "windows": [{"open": 660, "close": 840}, {"open": 1020, "close": 1260}],
    "indoor": true,
    "family": false,
    "location": "120.169899,30.239827",
    "url": "https://example.com/location",
    "source": "填写费用、营业时段的依据及核对日期"
  }
]
```

`location` 为高德使用的GCJ-02经度、纬度字符串；地图层会近似转换为WGS84。导入其他坐标系请先转换，避免地图位置偏移。

时间为午夜起分钟数，例如 09:00 为 540。`windows` 可选，表示分段营业；未提供时使用 `open` / `close`，有分段时避开午休或闭店间隙。
重复 ID、异常费用、非法时间、缺失来源或非 HTTP(S) 来源链接会被拒绝。

