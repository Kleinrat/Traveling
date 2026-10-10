///|
/// All money is in whole CNY per person; times are minutes after midnight.
pub struct Place {
  id : String
  name : String
  city : String
  district : String
  tags : Array[String]
  cost : Int
  duration : Int
  open : Int
  close : Int
  indoor : Bool
  family : Bool
  source : String
} derive(Debug, ToJson, @json.FromJson)

///|
/// Budget covers activities and estimated local transfers only.
pub struct Request {
  city : String
  days : Int
  budget : Int
  start : Int
  end : Int
  interests : Array[String]
  family : Bool
  rain : Bool
  relaxed : Bool
} derive(Debug, ToJson, @json.FromJson)

///|
pub struct Input {
  request : Request
  places : Array[Place]
} derive(Debug, ToJson, @json.FromJson)

///|
pub struct Stop {
  place : Place
  start : Int
  end : Int
  transfer_minutes : Int
  transfer_cost : Int
  score : Int
  reasons : Array[String]
} derive(Debug, ToJson)

///|
pub struct Day {
  day : Int
  stops : Array[Stop]
  cost : Int
  used_minutes : Int
} derive(Debug, ToJson)

///|
pub struct Exclusion {
  id : String
  name : String
  reason : String
} derive(Debug, ToJson)

///|
pub struct Plan {
  days : Array[Day]
  total_cost : Int
  remaining_budget : Int
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
    if p.tags.length() > 20 {
      errors.push("景点标签最多 20 个: \{p.id}")
    }
  }
  errors
}
