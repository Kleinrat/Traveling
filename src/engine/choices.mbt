///|
pub(all) struct PlaceChoice {
  id : String
  state : String
  day : Int32
} derive(ToJson, @json.FromJson)

///|
pub(all) struct TripLocks {
  places : Array[ManualStop]
  times : Array[ManualStop]
  legs : Array[Route]
} derive(ToJson, @json.FromJson)

///|
pub fn empty_locks() -> TripLocks {
  { places: [], times: [], legs: [], }
}

///|
fn same_route(a : Route, b : Route) -> Bool {
  a.from_id == b.from_id &&
  a.to_id == b.to_id &&
  a.mode == b.mode &&
  a.minutes == b.minutes &&
  a.distance == b.distance &&
  a.cost == b.cost &&
  a.fetched_at == b.fetched_at
}

///|
pub fn validate_locks(
  stops : Array[ManualStop],
  routing : Routing,
  locks : TripLocks,
) -> Array[String] {
  let errors = []
  if locks.places.length() > 70 ||
    locks.times.length() > 70 ||
    locks.legs.length() > 70 {
    return ["锁定安排数量超出范围"]
  }
  for locked in locks.places {
    if !stops.any(s => s.id == locked.id && s.day == locked.day) {
      errors.push("已锁定地点或日期：" + locked.id + "，请先解锁")
    }
  }
  for locked in locks.times {
    if !stops.any(s => {
        s.id == locked.id && s.day == locked.day && s.start == locked.start
      }) {
      errors.push("已锁定开始时间：" + locked.id + "，请先解锁")
    }
  }
  for locked in locks.legs {
    let mut adjacent = false
    for i in 1..<stops.length() {
      if stops[i - 1].day == stops[i].day &&
        stops[i - 1].id == locked.from_id &&
        stops[i].id == locked.to_id {
        adjacent = true
      }
    }
    if !adjacent || !routing.routes.any(r => same_route(r, locked)) {
      errors.push(
        "已锁定路段：" +
        locked.from_id +
        " → " +
        locked.to_id +
        "，请先解锁",
      )
    }
  }
  errors
}

///|
/// The incoming array defines the within-day order. Start preserves meal identity;
/// a time lock additionally fixes the exact start instead of silently moving it.
pub fn arrange_trip(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
  locks : TripLocks,
) -> Result[Plan, Array[String]] {
  let errors = validate(input)
  errors.append(validate_preferences(prefs))
  errors.append(validate_routing(routing))
  errors.append(validate_locks(edits, routing, locks))
  if edits.length() > 70 {
    errors.push("行程最多 70 站")
  }
  if !errors.is_empty() {
    return Err(errors)
  }
  let adjusted : Array[ManualStop] = []
  for day in 1..<(input.request.days + 1) {
    let mut previous : Place? = None
    let mut cursor = input.request.start
    for edit in edits.filter(s => s.day == day) {
      let place = match input.places.search_by(p => p.id == edit.id) {
        Some(i) => input.places[i]
        None => return Err(["地点不存在：" + edit.id])
      }
      let route = match route_transfer(previous, place, routing) {
        Some(r) => r
        None => return Err([place.name + "：该方向尚未查询路线"])
      }
      let rest = if previous is Some(_) {
        rest_minutes(input.request, prefs)
      } else {
        0
      }
      let arrival = cursor + route.minutes + rest
      let fixed = locks.times.any(s => s.id == edit.id)
      let begin = if fixed {
        if arrival > edit.start {
          return Err([
            place.name +
            "：无法赶上锁定时间，请调整前站或解锁",
          ])
        }
        edit.start
      } else if place.kind == "food" {
        let meal : Meals = if edit.start < 840 {
          { lunch: meals.lunch, dinner: false, }
        } else {
          { lunch: false, dinner: meals.dinner, }
        }
        match meal_window(place, arrival, input.request, meal, false, false) {
          Some((_, begin)) => begin
          None =>
            return Err([
              place.name +
              "：无法赶上原定用餐时段，请换日期、换地点或放宽时间",
            ])
        }
      } else {
        match available_begin(place, arrival, input.request.end) {
          Some(begin) => begin
          None =>
            return Err([place.name + "：无法在开放时段完成停留"])
        }
      }
      adjusted.push({ id: edit.id, day, start: begin, })
      cursor = begin + place.duration
      previous = Some(place)
    }
  }
  if edits.any(s => s.day < 1 || s.day > input.request.days) {
    return Err(["日期超出旅行范围"])
  }
  let locked_errors = validate_locks(adjusted, routing, locks)
  if !locked_errors.is_empty() {
    return Err(locked_errors)
  }
  edit_trip(input, prefs, routing, meals, adjusted)
}

///|
pub fn choose_trip(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  choices : Array[PlaceChoice],
  locks : TripLocks,
) -> Result[Plan, Array[String]] {
  if choices.length() > 500 {
    return Err(["地点选择数量超出范围"])
  }
  let mut request = input.request
  let must = request.must_visit.copy()
  let avoid = request.avoid.copy()
  let seen : Map[String, Bool] = Map([])
  for c in choices {
    if !["must", "maybe", "avoid"].contains(c.state) ||
      c.day < 0 ||
      c.day > request.days ||
      seen.contains(c.id) ||
      !input.places.any(p => p.id == c.id && p.city == request.city) ||
      (c.state == "avoid" && c.day != 0) {
      return Err(["地点选择或指定日期无效：" + c.id])
    }
    seen[c.id] = true
    if c.state == "must" || c.day > 0 {
      if !must.contains(c.id) {
        must.push(c.id)
      }
    }
    if c.state == "avoid" {
      if !avoid.contains(c.id) {
        avoid.push(c.id)
      }
    }
  }
  for s in locks.places + locks.times {
    if !must.contains(s.id) {
      must.push(s.id)
    }
  }
  for r in locks.legs {
    for id in [r.from_id, r.to_id] {
      if !must.contains(id) {
        must.push(id)
      }
    }
  }
  request = { ..request, must_visit: must, avoid, }
  let chosen = { ..input, request, }
  let plan = match plan_trip(chosen, prefs, routing, meals) {
    Ok(p) => p
    Err(e) => return Err(e)
  }
  let edits : Array[ManualStop] = []
  for d in plan.days {
    for s in d.stops {
      let mut day = d.day
      let mut start = s.start
      for c in choices {
        if c.id == s.place.id && c.day > 0 {
          day = c.day
        }
      }
      for l in locks.places {
        if l.id == s.place.id {
          if day != l.day && choices.any(c => c.id == l.id && c.day > 0) {
            return Err([
              s.place.name +
              "：指定日期与锁定日期冲突，请先解锁",
            ])
          }
          day = l.day
        }
      }
      for l in locks.times {
        if l.id == s.place.id {
          day = l.day
          start = l.start
        }
      }
      edits.push({ id: s.place.id, day, start, })
    }
  }
  edits.sort_by((a, b) => {
    if a.day == b.day {
      a.start - b.start
    } else {
      a.day - b.day
    }
  })
  if choices.any(c => c.day > 0) ||
    !locks.places.is_empty() ||
    !locks.times.is_empty() ||
    !locks.legs.is_empty() {
    arrange_trip(chosen, prefs, routing, meals, edits, locks)
  } else {
    Ok(plan)
  }
}

///|
pub(all) struct Suggestion {
  label : String
  reason : String
  plan : Plan
  routing : Routing
  cost_delta : Int32
  transfer_delta : Int32
} derive(ToJson)

///|
fn transfer_total(p : Plan) -> Int32 {
  let mut total = 0
  for d in p.days {
    for s in d.stops {
      total += s.transfer_minutes
    }
  }
  total
}

///|
pub fn suggest_trip(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
  locks : TripLocks,
  options : Array[Route],
) -> Result[Array[Suggestion], Array[String]] {
  let lock_errors = validate_locks(edits, routing, locks)
  if !lock_errors.is_empty() {
    return Err(lock_errors)
  }
  let original = match edit_trip(input, prefs, routing, meals, edits) {
    Ok(p) => p
    Err(e) => return Err(e)
  }
  if options.length() > 1000 {
    return Err(["交通候选方案过多"])
  }
  for option in options {
    if !validate_routing({ ..default_routing(), routes: [option], }).is_empty() {
      return Err(["交通候选资料无效"])
    }
  }
  let suggestions : Array[Suggestion] = []
  for i in 1..<edits.length() {
    let a = edits[i - 1]
    let b = edits[i]
    if a.day != b.day ||
      locks.legs.any(r => r.from_id == a.id && r.to_id == b.id) {
      continue
    }
    let to = input.places.search_by(p => p.id == b.id)
    for metric in ["time", "cost"] {
      let mut best : Route? = None
      for r in options.filter(r => r.from_id == a.id && r.to_id == b.id) {
        match best {
          None => best = Some(r)
          Some(old) =>
            if (metric == "time" && r.minutes < old.minutes) ||
              (metric == "cost" && r.cost < old.cost) {
              best = Some(r)
            }
        }
      }
      if best is Some(best) {
        let chosen = routing.routes.filter(r => {
          !(r.from_id == a.id && r.to_id == b.id)
        })
        chosen.push(best)
        let candidate = { ..routing, mode: "mixed", routes: chosen, }
        match arrange_trip(input, prefs, candidate, meals, edits, locks) {
          Err(_) => ()
          Ok(plan) => {
            let cost_delta = plan.total_cost - original.total_cost
            let transfer_delta = transfer_total(plan) - transfer_total(original)
            if (metric == "time" && transfer_delta < 0) ||
              (metric == "cost" && cost_delta < 0) {
              let label = if metric == "time" {
                "缩短这段接驳"
              } else {
                "节省这段费用"
              }
              let name = match to {
                Some(index) => input.places[index].name
                None => b.id
              }
              if !suggestions.any(s => {
                  s.cost_delta == cost_delta &&
                  s.transfer_delta == transfer_delta &&
                  s.reason.contains(name)
                }) {
                suggestions.push({
                  label,
                  reason: "前往" +
                  name +
                  "；保留地点与日期，以已查询交通候选重排时间",
                  plan,
                  routing: candidate,
                  cost_delta,
                  transfer_delta,
                })
              }
            }
          }
        }
      }
    }
    if suggestions.length() >= 8 {
      break
    }
  }
  // Try an adjacent sight swap only when every affected directional leg is known.
  for i in 1..<edits.length() {
    if suggestions.length() >= 8 {
      break
    }
    let a = edits[i - 1]
    let b = edits[i]
    if a.day != b.day {
      continue
    }
    if !input.places.any(p => p.id == a.id && p.kind == "sight") ||
      !input.places.any(p => p.id == b.id && p.kind == "sight") {
      continue
    }
    let swapped = edits.copy()
    swapped[i - 1] = b
    swapped[i] = a
    let mut complete = true
    let candidate_routes = routing.routes.copy()
    for j in 1..<swapped.length() {
      let from = swapped[j - 1]
      let to = swapped[j]
      if from.day != to.day {
        continue
      }
      if candidate_routes.any(r => r.from_id == from.id && r.to_id == to.id) {
        continue
      }
      let mut best : Route? = None
      for r in options.filter(r => r.from_id == from.id && r.to_id == to.id) {
        // Use the default mode for newly required links, minimizing duration.
        if routing.mode != "mixed" && r.mode != routing.mode {
          continue
        }
        if best is None || (best is Some(old) && r.minutes < old.minutes) {
          best = Some(r)
        }
      }
      match best {
        Some(r) => candidate_routes.push(r)
        None => complete = false
      }
    }
    let candidate_routing = {
      ..routing,
      mode: "mixed",
      routes: candidate_routes,
    }
    if !complete {
      continue
    }
    match
      arrange_trip(
        input,
        prefs,
        { ..candidate_routing, strict: true, },
        meals,
        swapped,
        locks,
      ) {
      Err(_) => ()
      Ok(plan) => {
        let delta = transfer_total(plan) - transfer_total(original)
        if delta < 0 {
          suggestions.push({
            label: "调换相邻景点",
            reason: "第 \{a.day} 天调换相邻景点；按已查询的定向路线校验",
            plan,
            routing: candidate_routing,
            cost_delta: plan.total_cost - original.total_cost,
            transfer_delta: delta,
          })
        }
      }
    }
  }
  Ok(suggestions)
}

///|
pub(all) struct Replacement {
  id : String
  name : String
  district : String
  cost : Int32
  duration : Int32
  request : Request
  plan : Plan
  routing : Routing
  cost_delta : Int32
  reasons : Array[String]
} derive(ToJson)

///|
/// Offer a few feasible substitutions while retaining all other places and days.
pub fn replacements(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
  locks : TripLocks,
  target_id : String,
) -> Result[Array[Replacement], Array[String]] {
  let original = match edit_trip(input, prefs, routing, meals, edits) {
    Ok(p) => p
    Err(e) => return Err(e)
  }
  let index = match edits.search_by(s => s.id == target_id) {
    Some(i) => i
    None => return Err(["请选择路书里的一站"])
  }
  if locks.places.any(s => s.id == target_id) ||
    locks.times.any(s => s.id == target_id) ||
    locks.legs.any(r => r.from_id == target_id || r.to_id == target_id) {
    return Err(["这站已有锁定安排，请先解锁再替换"])
  }
  let old = match input.places.search_by(p => p.id == target_id) {
    Some(i) => input.places[i]
    None => return Err(["地点资料不存在"])
  }
  let candidates = input.places.filter(p => {
    p.city == input.request.city &&
    p.kind == old.kind &&
    !edits.any(s => s.id == p.id) &&
    exclusion_reason(p, input.request) is None
  })
  candidates.sort_by((a, b) => {
    let (a_score, _) = score(a, input.request)
    let (b_score, _) = score(b, input.request)
    let a_near = if a.district == old.district { 15 } else { 0 }
    let b_near = if b.district == old.district { 15 } else { 0 }
    let delta = b_score + b_near - a_score - a_near
    if delta == 0 {
      a.cost - b.cost
    } else {
      delta
    }
  })
  let results : Array[Replacement] = []
  for p in candidates {
    let request = {
      ..input.request,
      must_visit: input.request.must_visit.filter(id => id != target_id) +
      [p.id],
    }
    let adjusted = edits.copy()
    adjusted[index] = { ..adjusted[index], id: p.id, }
    match
      arrange_trip(
        { ..input, request, },
        prefs,
        routing,
        meals,
        adjusted,
        locks,
      ) {
      Err(_) => ()
      Ok(plan) => {
        let (_, reasons) = score(p, request)
        if p.district == old.district {
          reasons.push("与原地点同片区")
        }
        results.push({
          id: p.id,
          name: p.name,
          district: p.district,
          cost: p.cost,
          duration: p.duration,
          request,
          plan,
          routing,
          cost_delta: plan.total_cost - original.total_cost,
          reasons,
        })
      }
    }
    if results.length() == 3 {
      break
    }
  }
  Ok(results)
}
