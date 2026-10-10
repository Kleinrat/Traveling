///|
priv struct CityEntry {
  province : String
  city : String
  code : String
} derive(ToJson)

///|
fn seed_cities() -> Array[CityEntry] {
  [
    { province: "北京", city: "北京", code: "110000", },
    { province: "天津", city: "天津", code: "120000", },
    { province: "河北", city: "秦皇岛", code: "130300", },
    { province: "山西", city: "大同", code: "140200", },
    { province: "内蒙古", city: "呼和浩特", code: "150100", },
    { province: "辽宁", city: "大连", code: "210200", },
    { province: "吉林", city: "长春", code: "220100", },
    { province: "黑龙江", city: "哈尔滨", code: "230100", },
    { province: "上海", city: "上海", code: "310000", },
    { province: "江苏", city: "南京", code: "320100", },
    { province: "浙江", city: "杭州", code: "330100", },
    { province: "安徽", city: "黄山", code: "341000", },
    { province: "福建", city: "厦门", code: "350200", },
    { province: "江西", city: "南昌", code: "360100", },
    { province: "山东", city: "青岛", code: "370200", },
    { province: "河南", city: "洛阳", code: "410300", },
    { province: "湖北", city: "武汉", code: "420100", },
    { province: "湖南", city: "长沙", code: "430100", },
    { province: "广东", city: "广州", code: "440100", },
    { province: "广西", city: "桂林", code: "450300", },
    { province: "海南", city: "三亚", code: "460200", },
    { province: "重庆", city: "重庆", code: "500000", },
    { province: "四川", city: "成都", code: "510100", },
    { province: "贵州", city: "贵阳", code: "520100", },
    { province: "云南", city: "昆明", code: "530100", },
    { province: "西藏", city: "拉萨", code: "540100", },
    { province: "陕西", city: "西安", code: "610100", },
    { province: "甘肃", city: "兰州", code: "620100", },
    { province: "青海", city: "西宁", code: "630100", },
    { province: "宁夏", city: "银川", code: "640100", },
    { province: "新疆", city: "乌鲁木齐", code: "650100", },
  ]
}

///|
pub fn cities_json() -> String {
  @json.to_json(seed_cities()).stringify()
}

///|
priv struct SearchInput {
  city : String
  kind : String
} derive(@json.FromJson)

///|
pub fn place_query_json(text : String) -> String {
  let input : SearchInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["城市查询条件无效"] } : Json).stringify()
  }
  if !["sight", "food"].contains(input.kind) {
    return ({ "ok": false, "errors": ["请选择景点或餐厅"] } : Json).stringify()
  }
  for entry in seed_cities() {
    if entry.city == input.city {
      return (
        {
          "ok": true,
          "city": entry.city,
          "code": entry.code,
          "kind": input.kind,
          "types": if input.kind == "food" {
            "050000"
          } else {
            "110000|140100"
          },
        } : Json).stringify()
    }
  }
  ({ "ok": false, "errors": ["请选择首发清单中的城市"] } : Json).stringify()
}

///|
priv struct PendingPoi {
  id : String
  name : String
  city : String
  district : String
  address : String
  location : String
  kind : String
  cost_hint : String
  open_hint : String
  fetched_at : String
  url : String
} derive(ToJson, @json.FromJson)

///|
pub fn pending_places_json(text : String) -> String {
  let raw : Array[PendingPoi] = @json.from_json(@json.parse(text)) catch {
    _ =>
      return (
        { "ok": false, "errors": ["高德地点资料格式无效"] } : Json).stringify()
  }
  if raw.length() > 40 {
    return (
      { "ok": false, "errors": ["单次查询最多 40 条资料"] } : Json).stringify()
  }
  let seen : Map[String, Bool] = Map([])
  let clean : Array[PendingPoi] = []
  for poi in raw {
    if poi.id == "" ||
      poi.name == "" ||
      poi.city == "" ||
      !["sight", "food"].contains(poi.kind) ||
      !poi.url.has_prefix("https://www.amap.com/") {
      return (
        { "ok": false, "errors": ["地点身份、类型或来源无效"] } :
        Json).stringify()
    }
    if !seen.contains(poi.id) {
      clean.push(poi)
      seen[poi.id] = true
    }
  }
  (
    {
      "ok": true,
      "items": @json.to_json(clean),
      "status": "待核对",
      "note": "查询结果不等于热门榜单；费用、可用时间和适合人群由你核对后填写",
    } : Json).stringify()
}
