///|
pub fn restaurant_identity(city : String, name : String) -> String {
  let mut base = name.trim().to_owned()
  for separator in ["(", "（", "·", "•", "|", "｜", "【", "["] {
    if base.split_once(separator) is Some((head, _)) {
      if head.trim().length() >= 2 {
        base = head.to_owned()
      }
    }
  }
  base = base.replace_all(old=" ", new="").trim().to_owned()
  // Cuisine and advertising suffixes are not the restaurant brand.
  for
    descriptor in [
      "天津菜", "杭帮菜", "浙江菜", "本帮菜", "北京菜", "私房菜",
      "川湘菜", "地道川菜", "湘菜", "粤菜", "津菜馆", "津味家常菜",
    ] {
    if base.split_once(descriptor) is Some((head, _)) {
      if head.length() >= 2 && head != city {
        base = head.to_owned()
      }
    }
  }
  city + ":" + base
}

///|
pub fn restaurants_similar(
  city_a : String,
  name_a : String,
  city_b : String,
  name_b : String,
) -> Bool {
  if city_a != city_b {
    return false
  }
  let a = restaurant_identity("", name_a)
  let b = restaurant_identity("", name_b)
  if a == b {
    return true
  }
  let aa = a[1:].to_owned().iter().to_array()
  let bb = b[1:].to_owned().iter().to_array()
  if aa.length() < 3 ||
    bb.length() < 3 ||
    aa.length() > 5 ||
    bb.length() > 5 ||
    aa[0] != bb[0] {
    return false
  }
  let mut common = 0
  let counted : Map[Char, Bool] = Map([])
  for ch in aa {
    if !counted.contains(ch) && bb.contains(ch) {
      common += 1
      counted[ch] = true
    }
  }
  common * 3 >= aa.length() * 2 && common * 3 >= bb.length() * 2
}

///|
/// All money is in whole CNY per person; times are minutes after midnight.
pub(all) struct Place {
  id : String
  name : String
  city : String
  district : String
  tags : Array[String]
  cost : Int32
  duration : Int32
  open : Int32
  close : Int32
  indoor : Bool
  family : Bool
  source : String
  url : String
  kind : String
  windows : Array[OpenWindow]?
} derive(Debug, ToJson, @json.FromJson)

///|
/// Budget covers activities and estimated local transfers only.
pub(all) struct Request {
  city : String
  days : Int32
  budget : Int32
  start : Int32
  end : Int32
  interests : Array[String]
  family : Bool
  rain : Bool
  relaxed : Bool
  must_visit : Array[String]
  avoid : Array[String]
  priority : String
  include_food : Bool
  diet : String
  max_visits : Int32
} derive(Debug, ToJson, @json.FromJson)

///|
pub(all) struct Input {
  request : Request
  places : Array[Place]
} derive(Debug, ToJson, @json.FromJson)

///|
pub(all) struct Stop {
  place : Place
  start : Int32
  end : Int32
  transfer_minutes : Int32
  transfer_cost : Int32
  score : Int32
  meal : String
  transfer_distance : Int32
  route_source : String
  reasons : Array[String]
} derive(Debug, ToJson)

///|
pub(all) struct Day {
  day : Int32
  stops : Array[Stop]
  cost : Int32
  used_minutes : Int32
} derive(Debug, ToJson)

///|
pub(all) struct Exclusion {
  id : String
  name : String
  reason : String
} derive(Debug, ToJson)

///|
pub(all) struct Plan {
  days : Array[Day]
  activity_cost : Int32
  food_cost : Int32
  transfer_cost : Int32
  total_cost : Int32
  remaining_budget : Int32
  exclusions : Array[Exclusion]
  warnings : Array[String]
} derive(Debug, ToJson)

///|
/// Reject malformed data before ranking, preventing arithmetic overflow.
pub fn validate(input : Input) -> Array[String] {
  let r = input.request
  let errors : Array[String] = []
  if r.city == "" {
    errors.push("城市不能为空")
  }
  if r.days < 1 || r.days > 7 {
    errors.push("天数必须为 1–7")
  }
  if r.budget < 0 || r.budget > 100000 {
    errors.push("预算必须为 0–100000 元")
  }
  if r.start < 0 || r.end > 1440 || r.start >= r.end {
    errors.push(
      "每日时间必须在 00:00–24:00 内，且结束晚于开始",
    )
  }
  if r.interests.length() > 10 {
    errors.push("兴趣标签最多 10 个")
  }
  if input.places.length() > 500 {
    errors.push("景点最多 500 个")
  }
  let ids : Map[String, Bool] = Map([])
  for p in input.places {
    if p.id == "" || p.name == "" || p.city == "" || p.source == "" {
      errors.push("景点 ID、名称、城市和来源不能为空")
    }
    if ids.contains(p.id) {
      errors.push("重复景点 ID: \{p.id}")
    }
    ids[p.id] = true
    if p.cost < 0 || p.cost > 100000 || p.duration < 1 || p.duration > 1440 {
      errors.push("景点费用或游览时长无效: \{p.id}")
    }
    if p.open < 0 || p.close > 1440 || p.open >= p.close {
      errors.push("景点开放时间无效: \{p.id}")
    }
    for window in p.windows.unwrap_or([]) {
      if window.open < p.open ||
        window.close > p.close ||
        window.open >= window.close {
        errors.push("分段营业时间无效: " + p.id)
      }
    }
    if p.windows is Some(windows) &&
      (windows.is_empty() || windows.length() > 10) {
      errors.push("分段营业时间数量无效: " + p.id)
    }
    if p.tags.length() > 20 {
      errors.push("景点标签最多 20 个: \{p.id}")
    }
  }
  if !["balanced", "budget", "interest"].contains(r.priority) {
    errors.push("未知推荐策略")
  }
  if r.max_visits < 1 || r.max_visits > 8 {
    errors.push("每天景点数必须为 1–8")
  }
  if !["不限", "素食", "不辣"].contains(r.diet) {
    errors.push("未知饮食条件")
  }
  if r.must_visit.length() > 56 || r.avoid.length() > 500 {
    errors.push("地点选择数量超出范围")
  }
  let required : Map[String, Bool] = Map([])
  for id in r.must_visit {
    if !ids.contains(id) {
      errors.push("心仪地点不存在: \{id}")
    }
    if required.contains(id) {
      errors.push("心仪地点重复: \{id}")
    }
    required[id] = true
    if r.avoid.contains(id) {
      errors.push("同一地点不能同时选中和排除: \{id}")
    }
  }
  for p in input.places {
    if !["sight", "food"].contains(p.kind) {
      errors.push("地点类型必须为 sight 或 food: \{p.id}")
    }
    if p.url != "" &&
      !p.url.has_prefix("https://") &&
      !p.url.has_prefix("http://") {
      errors.push("来源链接必须使用 HTTP(S): \{p.id}")
    }
  }
  errors
}

///|
pub(all) struct OpenWindow {
  open : Int32
  close : Int32
} derive(Debug, ToJson, @json.FromJson)
