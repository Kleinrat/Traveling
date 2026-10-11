///|
/// Explicitly add an unused place or replace a same-kind stop. Reflow only the
/// affected day; other days and the prefix before insertion keep their times.
pub fn change_place(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
  locks : TripLocks,
  place_id : String,
  action : String,
  day : Int,
  target_id : String,
  after_id : String?,
  meal : String,
) -> Result[Replacement, Array[String]] {
  let errors = validate_locks(edits, routing, locks)
  if !errors.is_empty() {
    return Err(errors)
  }
  let original = match edit_trip(input, prefs, routing, meals, edits) {
    Ok(p) => p
    Err(e) => return Err(e)
  }
  let p = match input.places.search_by(p => p.id == place_id) {
    Some(i) => input.places[i]
    None => return Err(["地点资料不存在"])
  }
  if edits.any(s => s.id == place_id) {
    return Err(["这个地点已在路书中，无需重复加入"])
  }
  if action != "add" && action != "replace" {
    return Err(["请选择加入或替换"])
  }
  let mut affected_day = day
  let mut replacement_index = -1
  let mut removed_id = ""
  let mut start = input.request.start
  if action == "replace" {
    let old_stop = match edits.search_by(s => s.id == target_id) {
      Some(i) => edits[i]
      None => return Err(["请选择路书里要替换的一站"])
    }
    let old = match input.places.search_by(p => p.id == target_id) {
      Some(i) => input.places[i]
      None => return Err(["原地点资料不存在"])
    }
    if old.kind != p.kind {
      return Err(["景点请替换景点，餐厅请替换餐厅"])
    }
    if locks.places.any(s => s.id == target_id) ||
      locks.times.any(s => s.id == target_id) ||
      locks.legs.any(r => r.from_id == target_id || r.to_id == target_id) {
      return Err(["这站已有锁定安排，请先解锁再替换"])
    }
    affected_day = old_stop.day
    start = old_stop.start
    removed_id = target_id
  }
  if affected_day < 1 || affected_day > input.request.days {
    return Err(["日期超出旅行范围"])
  }
  let request = {
    ..input.request,
    must_visit: input.request.must_visit.filter(id => {
      id != removed_id && id != place_id
    }) +
    [place_id],
    avoid: input.request.avoid.filter(id => id != place_id),
  }
  if exclusion_reason(p, request) is Some(reason) {
    return Err([p.name + "：" + reason])
  }
  let day_stops = edits.filter(s => s.day == affected_day)
  if action == "replace" {
    replacement_index = day_stops
      .search_by(s => s.id == target_id)
      .unwrap_or(-1)
  } else if p.kind == "food" {
    if meal == "lunch" && meals.lunch {
      start = 660
    } else if meal == "dinner" && meals.dinner {
      start = 1020
    } else {
      return Err(["请选择已开启的午餐或晚餐时段"])
    }
    if day_stops.any(s => {
        let food = input.places.any(p => p.id == s.id && p.kind == "food")
        food &&
        (
          (meal == "lunch" && s.start < 840) ||
          (meal == "dinner" && s.start >= 840)
        )
      }) {
      return Err([
        "这一天的该餐次已有餐厅，请使用替换，或选择其他日期 / 餐次",
      ])
    }
  }
  let positions : Array[Int] = []
  if action == "replace" {
    positions.push(replacement_index)
  } else {
    match after_id {
      None =>
        for i in 0..<(day_stops.length() + 1) {
          positions.push(i)
        }
      Some("") => positions.push(0)
      Some(id) =>
        match day_stops.search_by(s => s.id == id) {
          Some(i) => positions.push(i + 1)
          None => return Err(["所选插入位置已变化，请重新选择"])
        }
    }
  }
  let mut best : Replacement? = None
  let mut best_shift = 2147483647
  let failures : Array[String] = []
  for position in positions {
    let adjusted = edits.filter(s => s.day != affected_day)
    let times = locks.times.copy()
    for s in adjusted {
      if !times.any(t => t.id == s.id) {
        times.push(s)
      }
    }
    for i in 0..<day_stops.length() {
      if i < position && !times.any(t => t.id == day_stops[i].id) {
        times.push(day_stops[i])
      }
      if i == position {
        adjusted.push({ id: place_id, day: affected_day, start, })
      }
      if action != "replace" || i != position {
        adjusted.push(day_stops[i])
      }
    }
    if position == day_stops.length() {
      adjusted.push({ id: place_id, day: affected_day, start, })
    }
    match
      arrange_trip({ ..input, request, }, prefs, routing, meals, adjusted, {
        ..locks,
        times,
      }) {
      Err(errors) =>
        for error in errors {
          if !failures.contains(error) && failures.length() < 4 {
            failures.push(error)
          }
        }
      Ok(plan) => {
        let mut shift = 0
        for d in plan.days {
          for s in d.stops {
            match edits.search_by(old => old.id == s.place.id) {
              Some(i) => shift += (s.start - edits[i].start).abs()
              None => ()
            }
          }
        }
        if shift < best_shift {
          best_shift = shift
          best = Some({
            id: p.id,
            name: p.name,
            district: p.district,
            cost: p.cost,
            duration: p.duration,
            request,
            plan,
            routing,
            cost_delta: plan.total_cost - original.total_cost,
            reasons: [
              "保留其他地点和日期，仅重排受影响当天的后续时刻",
            ],
          })
        }
      }
    }
  }
  match best {
    Some(result) => Ok(result)
    None =>
      Err(
        if failures.is_empty() {
          ["没有可行位置，请选择替换或调整时间和预算"]
        } else {
          failures
        },
      )
  }
}
