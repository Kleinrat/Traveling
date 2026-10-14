///|
fn coordinates(p : Place) -> (Double, Double)? {
  let raw = match p.location {
    Some(s) => s
    None => return None
  }
  let parts = raw.split(",").to_array()
  if parts.length() != 2 {
    return None
  }
  let lon = @string.parse_double(parts[0]) catch { _ => return None }
  let lat = @string.parse_double(parts[1]) catch { _ => return None }
  if !(lon >= -180.0 && lon <= 180.0 && lat >= -90.0 && lat <= 90.0) {
    return None
  }
  Some((lon, lat))
}

///|
/// Approximate squared coordinate distance for these cities near latitude 30.
/// Ranking only: this does not claim a road distance, fare or walking duration.
fn dinner_distance(anchor : Place?, food : Place, routing : Routing) -> Double {
  let anchor = match anchor {
    Some(p) => p
    None => return 0.0
  }
  match (coordinates(anchor), coordinates(food)) {
    (Some((a_lon, a_lat)), Some((b_lon, b_lat))) => {
      let x = (a_lon - b_lon) * 96000.0
      let y = (a_lat - b_lat) * 111000.0
      x * x + y * y
    }
    _ => {
      for route in routing.routes {
        if route.from_id == anchor.id &&
          route.to_id == food.id &&
          route.distance > 0 {
          let distance = route.distance.to_double()
          return distance * distance
        }
      }
      if anchor.district == food.district {
        100000000.0
      } else {
        400000000.0
      }
    }
  }
}

///|
fn dinner_location_reason(anchor : Place?, food : Place) -> String {
  match anchor {
    None => "当天尚无景点，按餐饮偏好选择晚餐"
    Some(p) =>
      match (coordinates(p), coordinates(food)) {
        (Some(_), Some(_)) =>
          if p.kind == "sight" {
            "晚餐优先参考与最后游览景点的坐标距离；直线邻近不等于真实步行距离"
          } else {
            "当天未安排景点，晚餐参考上一站的坐标距离；不是实际步行距离"
          }
        _ =>
          "坐标资料不足，晚餐按最后景点同片区或已查询方向距离参考，不保证最近"
      }
  }
}

///|
/// Add dinner after the existing last stop without dropping or moving any stop.
pub fn complete_dinners(
  input : Input,
  prefs : Preferences,
  routing : Routing,
  meals : Meals,
  edits : Array[ManualStop],
  locks : TripLocks,
) -> Result[Replacement, Array[String]] {
  let locked_errors = validate_locks(edits, routing, locks)
  if !locked_errors.is_empty() {
    return Err(locked_errors)
  }
  let original = match edit_trip(input, prefs, routing, meals, edits) {
    Ok(p) => p
    Err(e) => return Err(e)
  }
  let request = {
    ..input.request,
    include_food: true,
    end: if input.request.end < 1200 {
      1200
    } else {
      input.request.end
    },
  }
  let mut result = original
  let mut selected = edits.copy()
  let dinner_meals = { ..meals, dinner: true, }
  for day in 1..<(request.days + 1) {
    let current_day = result.days[day - 1]
    if current_day.stops.any(s => s.meal == "晚餐") {
      continue
    }
    let mut anchor : Place? = None
    for stop in current_day.stops {
      if stop.place.kind == "sight" {
        anchor = Some(stop.place)
      }
    }
    if anchor is None && !current_day.stops.is_empty() {
      anchor = Some(current_day.stops[current_day.stops.length() - 1].place)
    }
    let foods = input.places.filter(p => {
      p.city == request.city &&
      p.kind == "food" &&
      !selected.any(s => s.id == p.id)
    })
    foods.sort_by((a, b) => {
      let aa = dinner_distance(anchor, a, routing)
      let bb = dinner_distance(anchor, b, routing)
      if aa < bb {
        -1
      } else if aa > bb {
        1
      } else {
        a.cost - b.cost
      }
    })
    let after = if current_day.stops.is_empty() {
      ""
    } else {
      current_day.stops[current_day.stops.length() - 1].place.id
    }
    let mut chosen : Plan? = None
    for food in foods {
      // Explicitly adding a place may cancel its avoid flag in change_place;
      // automatic dinner completion must keep every existing exclusion.
      if exclusion_reason(food, request) is Some(_) {
        continue
      }
      match
        change_place(
          { ..input, request, },
          prefs,
          routing,
          dinner_meals,
          selected,
          locks,
          food.id,
          "add",
          day,
          "",
          Some(after),
          "dinner",
        ) {
        Ok(change) => {
          let days = change.plan.days.map(d => {
            ..d,
            stops: d.stops.map(s => {
              if s.place.id == food.id {
                {
                  ..s,
                  reasons: s.reasons + [dinner_location_reason(anchor, food)],
                }
              } else {
                s
              }
            }),
          })
          chosen = Some({ ..change.plan, days, })
          break
        }
        Err(_) => ()
      }
    }
    match chosen {
      None =>
        return Err([
          "第 \{day} 天没有满足预算、饮食、不重复与衔接条件的晚餐；原路书保留。可放宽预算 / 时间或补充餐厅资料。",
        ])
      Some(plan) => {
        result = plan
        selected = []
        for d in plan.days {
          for s in d.stops {
            selected.push({ id: s.place.id, day: d.day, start: s.start, })
          }
        }
      }
    }
  }
  Ok({
    id: "",
    name: "晚餐",
    district: "",
    cost: 0,
    duration: 0,
    request,
    plan: result,
    routing,
    cost_delta: result.total_cost - original.total_cost,
    reasons: ["保留原有地点、日期与时刻，补充邻近晚餐"],
  })
}

///|
/// A lower bound on remaining meal expenses; no invented fares or restaurant
/// availability. Reservation is used only when the requested meals can initially
/// fit the budget and enough distinct candidates exist.
fn meal_reserve(
  places : Array[Place],
  r : Request,
  meals : Meals,
  count : Int32,
  used : Map[String, Bool],
  restaurants : Array[Place],
) -> Int32? {
  if count <= 0 {
    return Some(0)
  }
  let foods = places.filter(p => {
    p.kind == "food" &&
    !used.contains(p.id) &&
    exclusion_reason(p, r) is None &&
    !restaurants.any(old => {
      restaurants_similar(p.city, p.name, old.city, old.name)
    }) &&
    meal_window(p, r.start, r, meals, false, false) is Some(_)
  })
  foods.sort_by((a, b) => a.cost - b.cost)
  let chosen : Array[Place] = []
  let mut cost = 0
  for food in foods {
    if chosen.any(old => {
        restaurants_similar(food.city, food.name, old.city, old.name)
      }) {
      continue
    }
    chosen.push(food)
    cost += food.cost
    if chosen.length() == count {
      return Some(cost)
    }
  }
  None
}
