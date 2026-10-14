///|
pub(all) struct Route {
  from_id : String
  to_id : String
  mode : String
  minutes : Int32
  distance : Int32
  cost : Int32
  source : String
  fetched_at : String
} derive(ToJson, @json.FromJson)

///|
pub(all) struct Routing {
  mode : String
  strict : Bool
  distance_limit : Int32
  routes : Array[Route]
} derive(ToJson, @json.FromJson)

///|
pub fn default_routing() -> Routing {
  { mode: "transit", strict: false, distance_limit: 1000000, routes: [], }
}

///|
pub(all) struct Meals {
  lunch : Bool
  dinner : Bool
} derive(ToJson, @json.FromJson)

///|
pub fn default_meals(r : Request) -> Meals {
  { lunch: r.include_food, dinner: false, }
}

///|
pub fn validate_routing(r : Routing) -> Array[String] {
  let errors = []
  if !["walking", "transit", "mixed"].contains(r.mode) ||
    r.distance_limit < 0 ||
    r.distance_limit > 1000000 ||
    r.routes.length() > 1000 {
    errors.push("路线方式、距离上限或路线数量无效")
  }
  let seen : Map[String, Bool] = Map([])
  for route in r.routes {
    let key = route.from_id +
      "|" +
      route.to_id +
      (if r.mode == "mixed" { "" } else { "|" + route.mode })
    if route.from_id == "" ||
      route.to_id == "" ||
      !["walking", "transit"].contains(route.mode) ||
      route.minutes < 0 ||
      route.minutes > 1440 ||
      route.distance < 0 ||
      route.distance > 1000000 ||
      route.cost < 0 ||
      route.cost > 10000 ||
      (route.mode == "walking" && route.cost != 0) ||
      route.source != "高德路线规划" ||
      route.fetched_at == "" ||
      seen.contains(key) {
      errors.push("路线资料无效或重复")
    }
    seen[key] = true
  }
  errors
}

///|
/// Directional results: A -> B never imply B -> A.
pub fn route_transfer(
  previous : Place?,
  next : Place,
  routing : Routing,
) -> Route? {
  match previous {
    None =>
      Some({
        from_id: "",
        to_id: next.id,
        mode: routing.mode,
        minutes: 0,
        distance: 0,
        cost: 0,
        source: "每日第一站未计接驳",
        fetched_at: "",
      })
    Some(old) => {
      for route in routing.routes {
        if route.from_id == old.id &&
          route.to_id == next.id &&
          (routing.mode == "mixed" || route.mode == routing.mode) {
          return Some(route)
        }
      }
      if routing.strict {
        return None
      }
      let (minutes, cost) = transfer(previous, next)
      Some({
        from_id: old.id,
        to_id: next.id,
        mode: routing.mode,
        minutes,
        distance: 0,
        cost,
        source: "片区估算，未查询路线",
        fetched_at: "",
      })
    }
  }
}

///|
pub fn allowed_leg(
  route : Route,
  p : Preferences,
  routing : Routing,
  minutes : Int32,
  distance : Int32,
) -> Bool {
  if minutes + route.minutes > p.transfer_limit ||
    distance + route.distance > routing.distance_limit {
    return false
  }
  if p.walking {
    if route.source == "高德路线规划" {
      return route.mode == "walking" && route.distance <= 1500
    }
    return route.minutes <= 15
  }
  true
}

///|
pub fn meal_window(
  p : Place,
  arrival : Int32,
  r : Request,
  meals : Meals,
  lunch_used : Bool,
  dinner_used : Bool,
) -> (String, Int32)? {
  for
    (label, enabled, used, open, close) in [
      ("午餐", meals.lunch, lunch_used, 660, 840),
      ("晚餐", meals.dinner, dinner_used, 1020, 1260),
    ] {
    if !enabled || used || !r.include_food {
      continue
    }
    if available_begin(p, max_int(arrival, open), min_int(r.end, close))
      is Some(begin) {
      return Some((label, begin))
    }
  }
  None
}

///|
pub fn route_warnings(
  days : Array[Day],
  r : Request,
  meals : Meals,
) -> Array[String] {
  let warnings = [
    "费用和营业时间为资料估算；景区预约、闭馆日与餐厅排队需出行前核实。",
    "每天第一站未计出发点接驳；预算含已安排的餐饮，不含住宿。",
    "高德路线为查询时的方案预估，不保证出行当天的班次、路况和票价。未查询路段会明确标注片区估算。",
    "使用可解释的贪心规划，不保证全局最优；餐饮缺项不会按免费处理。",
  ]
  for day in days {
    if r.include_food {
      for
        (label, enabled) in [("午餐", meals.lunch), ("晚餐", meals.dinner)] {
        if enabled && !day.stops.any(stop => stop.meal == label) {
          warnings.push(
            "第 \{day.day} 天未安排\{label}：没有同时满足时间、预算、饮食和不重复条件的餐厅；餐饮总额未包含这顿饭。",
          )
        }
      }
    }
  }
  warnings
}

///|
/// Retain selected stops and dates; recompute starts with route durations.
pub fn reflow_trip(
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
    return Err(["行程最多 70 站"])
  }
  let adjusted = []
  let sorted = edits.copy()
  sorted.sort_by((a, b) => {
    if a.day == b.day {
      a.start - b.start
    } else {
      a.day - b.day
    }
  })
  for day in 1..<(input.request.days + 1) {
    let mut previous : Place? = None
    let mut cursor = input.request.start
    for edit in sorted.filter(item => item.day == day) {
      let place = match input.places.search_by(p => p.id == edit.id) {
        Some(index) => input.places[index]
        None => return Err(["地点不存在"])
      }
      let route = match route_transfer(previous, place, routing) {
        Some(route) => route
        None => return Err([place.name + "：尚未查询路线"])
      }
      let rest = if previous is Some(_) {
        rest_minutes(input.request, preferences)
      } else {
        0
      }
      let arrival = cursor + route.minutes + rest
      let begin = if place.kind == "food" {
        let selected_meal : Meals = if edit.start < 840 {
          { lunch: meals.lunch, dinner: false, }
        } else {
          { lunch: false, dinner: meals.dinner, }
        }
        match
          meal_window(
            place,
            arrival,
            input.request,
            selected_meal,
            false,
            false,
          ) {
          Some((_, begin)) => begin
          None =>
            return Err([
              place.name +
              "：新路线无法赶上原定用餐时段，请换地点或重新生成",
            ])
        }
      } else {
        match available_begin(place, arrival, input.request.end) {
          Some(begin) => begin
          None =>
            return Err([
              place.name + "：路线重排后无法在营业时段停留",
            ])
        }
      }
      adjusted.push({ id: edit.id, day, start: begin, })
      cursor = begin + place.duration
      previous = Some(place)
    }
  }
  if edits.any(edit => edit.day < 1 || edit.day > input.request.days) {
    return Err(["日期超出旅行范围"])
  }
  edit_trip(input, preferences, routing, meals, adjusted)
}

///|
fn max_int(a : Int32, b : Int32) -> Int32 {
  if a > b {
    a
  } else {
    b
  }
}

///|
fn min_int(a : Int32, b : Int32) -> Int32 {
  if a < b {
    a
  } else {
    b
  }
}

///|
pub fn available_begin(p : Place, arrival : Int32, end : Int32) -> Int32? {
  let mut best : Int32? = None
  for window in p.windows.unwrap_or([{ open: p.open, close: p.close, }]) {
    let begin = max_int(arrival, window.open)
    if begin + p.duration <= min_int(end, window.close) {
      if best is None || (best is Some(old) && begin < old) {
        best = Some(begin)
      }
    }
  }
  best
}
