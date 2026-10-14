///|
pub(all) struct Preferences {
  mode : String
  environment : String
  walking : Bool
  transfer_limit : Int32
} derive(ToJson, @json.FromJson)

///|
pub fn default_preferences() -> Preferences {
  { mode: "custom", environment: "any", walking: false, transfer_limit: 1440, }
}

///|
pub fn validate_preferences(p : Preferences) -> Array[String] {
  let errors = []
  if !["custom", "lazy", "intense", "weekend"].contains(p.mode) {
    errors.push("未知旅行模式")
  }
  if !["any", "indoor", "outdoor"].contains(p.environment) {
    errors.push("未知室内外偏好")
  }
  if p.transfer_limit < 0 || p.transfer_limit > 1440 {
    errors.push("每日接驳时间上限无效")
  }
  errors
}

///|
pub fn rest_minutes(r : Request, preferences : Preferences) -> Int32 {
  if r.relaxed || preferences.mode == "lazy" {
    45
  } else if preferences.mode == "intense" {
    5
  } else {
    20
  }
}

///|
pub fn preference_score(
  p : Place,
  previous : Place?,
  preferences : Preferences,
) -> (Int32, Array[String]) {
  let reasons = []
  let mut bonus = 0
  if preferences.mode == "lazy" && p.kind == "food" {
    bonus += 60
    reasons.push("懒人旅行，美食优先（+60）")
  }
  if (preferences.environment == "indoor" && p.indoor) ||
    (preferences.environment == "outdoor" && !p.indoor) {
    bonus += 20
    reasons.push("匹配室内外偏好（+20）")
  }
  if previous is Some(old) && old.district == p.district {
    let points = if preferences.mode == "lazy" {
      40
    } else if preferences.mode == "weekend" || preferences.walking {
      25
    } else {
      0
    }
    bonus += points
    if points > 0 {
      reasons.push("优先同片区，减少转场（+\{points}）")
    }
  }
  (bonus, reasons)
}

///|
pub(all) struct ManualStop {
  id : String
  day : Int32
  start : Int32
} derive(ToJson, @json.FromJson)

///|
pub fn edit_plan(
  input : Input,
  preferences : Preferences,
  edits : Array[ManualStop],
) -> Result[Plan, Array[String]] {
  edit_trip(
    input,
    preferences,
    default_routing(),
    default_meals(input.request),
    edits,
  )
}

///|
pub fn edit_trip(
  input : Input,
  preferences : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
) -> Result[Plan, Array[String]] {
  let errors = validate(input)
  errors.append(validate_preferences(preferences))
  errors.append(validate_routing(routing))
  if !errors.is_empty() {
    return Err(errors)
  }
  if edits.length() > 70 {
    return Err(["手动行程最多 70 站"])
  }
  let r = input.request
  let used : Map[String, Bool] = Map([])
  let restaurants : Array[Place] = []
  let sorted = edits.copy()
  sorted.sort_by((a, b) => {
    if a.day == b.day {
      a.start - b.start
    } else {
      a.day - b.day
    }
  })
  for edit in sorted {
    if edit.day < 1 ||
      edit.day > r.days ||
      edit.start < r.start ||
      edit.start >= r.end {
      return Err(["手动日期或时间超出旅行范围"])
    }
    if used.contains(edit.id) {
      return Err(["同一地点不能重复安排"])
    }
    used[edit.id] = true
  }
  let days : Array[Day] = []
  let mut activity = 0
  let mut food = 0
  let mut fares = 0
  for day in 1..<(r.days + 1) {
    let stops : Array[Stop] = []
    let mut previous : Place? = None
    let mut finish = r.start
    let mut visits = 0
    let mut lunch_used = false
    let mut dinner_used = false
    let mut distance_total = 0
    let mut day_cost = 0
    let mut transfer_total = 0
    for edit in sorted.filter(item => item.day == day) {
      let p = match input.places.search_by(place => place.id == edit.id) {
        Some(index) => input.places[index]
        None => return Err(["手动地点不存在：" + edit.id])
      }
      if exclusion_reason(p, r) is Some(reason) {
        return Err([p.name + "：" + reason])
      }
      let route = match route_transfer(previous, p, routing) {
        Some(route) => route
        None => return Err([p.name + "：此路段尚未查询路线"])
      }
      let minutes = route.minutes
      let fare = route.cost
      let rest = if previous is Some(_) {
        rest_minutes(r, preferences)
      } else {
        0
      }
      if edit.start < finish + minutes + rest {
        return Err([
          p.name +
          "：与上一站重叠，或没有留足接驳和休息时间",
        ])
      }
      if available_begin(p, edit.start, r.end) != Some(edit.start) ||
        edit.start < p.open ||
        edit.start + p.duration > p.close ||
        edit.start + p.duration > r.end {
        return Err([p.name + "：超出可用时间或每日结束时间"])
      }
      if !allowed_leg(
          route, preferences, routing, transfer_total, distance_total,
        ) {
        return Err([
          p.name + "：超出接驳时间、距离上限或步行范围",
        ])
      }
      transfer_total += minutes
      distance_total += route.distance
      let mut meal = ""
      if p.kind == "food" {
        match meal_window(p, edit.start, r, meals, lunch_used, dinner_used) {
          Some((label, begin)) => {
            if begin != edit.start {
              return Err([
                p.name +
                "：请在午餐 11:00–14:00 或晚餐 17:00–21:00 时段内安排，并避免重复用餐",
              ])
            }
            meal = label
            if label == "午餐" {
              lunch_used = true
            } else {
              dinner_used = true
            }
          }
          None =>
            return Err([p.name + "：用餐时段无效或该顿饭已安排"])
        }
        if restaurants.any(old => {
            restaurants_similar(p.city, p.name, old.city, old.name)
          }) {
          return Err([
            "行程中已有同品牌或相似名称的菜馆，请换一家",
          ])
        }
        restaurants.push(p)
        food += p.cost
      } else {
        visits += 1
        activity += p.cost
      }
      if visits > r.max_visits {
        return Err(["超出每天景点数量上限"])
      }
      fares += fare
      day_cost += p.cost + fare
      let (_, reasons) = score(p, r)
      reasons.push("用户手动确定日期和时间")
      stops.push({
        place: p,
        start: edit.start,
        end: edit.start + p.duration,
        transfer_minutes: minutes,
        transfer_cost: fare,
        score: 0,
        meal,
        transfer_distance: route.distance,
        route_source: route.source,
        reasons,
      })
      finish = edit.start + p.duration
      previous = Some(p)
    }
    days.push({ day, stops, cost: day_cost, used_minutes: finish - r.start, })
  }
  if r.must_visit.any(id => !used.contains(id)) {
    return Err(["手动行程不能移除已选定的心仪地点"])
  }
  let total = activity + food + fares
  if total > r.budget {
    return Err(["调整后的活动、餐饮和接驳费用超出每人预算"])
  }
  let exclusions = input.places
    .filter(p => !used.contains(p.id))
    .map(p => Exclusion::{
      id: p.id,
      name: p.name,
      reason: "手动行程未安排",
    })
  Ok({
    days,
    activity_cost: activity,
    food_cost: food,
    transfer_cost: fares,
    total_cost: total,
    remaining_budget: r.budget - total,
    exclusions,
    warnings: route_warnings(days, r, meals),
  })
}

///|
pub(all) struct TripExpenses {
  people : Int32
  roundtrip : Int32
  trip_budget : Int32
} derive(ToJson, @json.FromJson)

///|
pub fn trip_cost(
  activity : Int32,
  food : Int32,
  transfer_cost : Int32,
  expenses : TripExpenses,
) -> Result[Json, Array[String]] {
  let e = expenses
  if e.people < 1 ||
    e.people > 30 ||
    e.roundtrip < 0 ||
    e.roundtrip > 100000 ||
    e.trip_budget < 0 ||
    e.trip_budget > 100000000 ||
    activity < 0 ||
    activity > 100000 ||
    food < 0 ||
    food > 100000 ||
    transfer_cost < 0 ||
    transfer_cost > 100000 ||
    activity + food + transfer_cost > 100000 {
    return Err(["人数、往返交通或总预算超出允许范围"])
  }
  let transportation = e.roundtrip * e.people
  let total = (activity + food + transfer_cost) * e.people + transportation
  Ok({
    "people": e.people,
    "activity": activity * e.people,
    "food": food * e.people,
    "transfer": transfer_cost * e.people,
    "roundtrip": transportation,
    "total": total,
    "per_person_estimate": (total + e.people - 1) / e.people,
    "budget_set": e.trip_budget > 0,
    "remaining": e.trip_budget - total,
    "over_budget": e.trip_budget > 0 && total > e.trip_budget,
  })
}
