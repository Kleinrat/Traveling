///|
/// Greedy feasible scheduler. This is deterministic, not globally optimal.
pub fn plan(input : Input) -> Result[Plan, Array[String]] {
  plan_with_preferences(input, default_preferences())
}

///|
pub fn plan_with_preferences(
  input : Input,
  preferences : Preferences,
) -> Result[Plan, Array[String]] {
  plan_trip(input, preferences, default_routing(), default_meals(input.request))
}

///|
pub fn plan_trip(
  input : Input,
  preferences : Preferences,
  routing : Routing,
  meals : Meals,
) -> Result[Plan, Array[String]] {
  let errors = validate(input)
  errors.append(validate_preferences(preferences))
  errors.append(validate_routing(routing))
  if !errors.is_empty() {
    return Err(errors)
  }
  let r = input.request
  let used : Map[String, Bool] = Map([])
  let used_restaurants : Array[Place] = []
  let days : Array[Day] = []
  let mut total = 0
  for day_number in 1..<(r.days + 1) {
    let stops : Array[Stop] = []
    let mut cursor = r.start
    let mut previous : Place? = None
    let mut day_cost = 0
    let mut visits = 0
    let mut lunch_used = false
    let mut dinner_used = false
    let mut distance_total = 0
    let mut transfer_total = 0
    while true {
      let mut best : Place? = None
      let mut best_score = -1000000
      let mut best_start = 0
      let mut best_transfer = (0, 0)
      let mut best_reasons : Array[String] = []
      let mut best_meal = ""
      let mut best_distance = 0
      let mut best_source = ""
      for p in input.places {
        if used.contains(p.id) || exclusion_reason(p, r) is Some(_) {
          continue
        }
        if p.kind == "sight" && visits >= r.max_visits {
          continue
        }
        if p.kind == "food" &&
          used_restaurants.any(old => {
            restaurants_similar(p.city, p.name, old.city, old.name)
          }) {
          continue
        }
        let mut next_required : String? = None
        for id in r.must_visit {
          if !used.contains(id) {
            next_required = Some(id)
            break
          }
        }
        if r.must_visit.contains(p.id) && next_required != Some(p.id) {
          continue
        }
        let route = match route_transfer(previous, p, routing) {
          Some(route) => route
          None => continue
        }
        let minutes = route.minutes
        let fare = route.cost
        if !allowed_leg(
            route, preferences, routing, transfer_total, distance_total,
          ) {
          continue
        }
        let rest = if previous is Some(_) {
          rest_minutes(r, preferences)
        } else {
          0
        }
        let arrival = cursor + minutes + rest
        let (meal, begin) = if p.kind == "food" {
          match meal_window(p, arrival, r, meals, lunch_used, dinner_used) {
            Some(value) => value
            None => continue
          }
        } else {
          (
            "",
            match available_begin(p, arrival, r.end) {
              Some(begin) => begin
              None => continue
            },
          )
        }
        if begin + p.duration > r.end || begin + p.duration > p.close {
          continue
        }
        if total + p.cost + fare > r.budget {
          continue
        }
        // Avoid consuming the last feasible meal window with an optional sight.
        if p.kind == "sight" && !r.must_visit.contains(p.id) {
          let mut blocks_meal = false
          for
            (label, enabled, used_meal) in [
              ("午餐", meals.lunch, lunch_used),
              ("晚餐", meals.dinner, dinner_used),
            ] {
            if enabled &&
              !used_meal &&
              r.include_food &&
              has_meal_candidate(
                input.places,
                r,
                preferences,
                routing,
                label,
                previous,
                cursor,
                total,
                used,
                used_restaurants,
                transfer_total,
                distance_total,
              ) &&
              !has_meal_candidate(
                input.places,
                r,
                preferences,
                routing,
                label,
                Some(p),
                begin + p.duration,
                total + p.cost + fare,
                used,
                used_restaurants,
                transfer_total + minutes,
                distance_total + route.distance,
              ) {
              blocks_meal = true
            }
          }
          if blocks_meal {
            continue
          }
        }
        let (base, reasons) = score(p, r)
        let (preference_bonus, preference_reasons) = preference_score(
          p, previous, preferences,
        )
        reasons.append(preference_reasons)
        let nearby = match previous {
          Some(prev) => prev.district == p.district
          None => false
        }
        let chosen = r.must_visit.contains(p.id)
        let meal_due = p.kind == "food" && begin - arrival <= 60
        let value = base +
          preference_bonus +
          (if nearby { 8 } else { 0 }) +
          (if chosen { 10000 } else { 0 }) +
          (if meal_due { 300 } else { 0 }) -
          (if p.kind == "food" { (begin - arrival) / 2 } else { 0 })
        if chosen {
          reasons.push("用户选定地点，优先安排")
        }
        if meal_due {
          reasons.push("已接近\{meal}时段，优先安排用餐")
        }
        if nearby {
          reasons.push("与上一站同片区（+8）")
        }
        let wins = value > best_score ||
          (
            value == best_score &&
            (match best {
              Some(old) => p.id < old.id
              None => true
            })
          )
        if wins {
          best = Some(p)
          best_score = value
          best_start = begin
          best_transfer = (minutes, fare)
          best_reasons = reasons
          best_meal = meal
          best_distance = route.distance
          best_source = route.source
        }
      }
      match best {
        None => break
        Some(p) => {
          let (minutes, fare) = best_transfer
          stops.push({
            place: p,
            start: best_start,
            end: best_start + p.duration,
            transfer_minutes: minutes,
            transfer_cost: fare,
            score: best_score,
            meal: best_meal,
            transfer_distance: best_distance,
            route_source: best_source,
            reasons: best_reasons,
          })
          cursor = best_start + p.duration
          total += p.cost + fare
          day_cost += p.cost + fare
          transfer_total += minutes
          distance_total += best_distance
          if p.kind == "sight" {
            visits += 1
          } else {
            if best_meal == "午餐" {
              lunch_used = true
            } else {
              dinner_used = true
            }
            used_restaurants.push(p)
          }
          previous = Some(p)
          used[p.id] = true
        }
      }
    }
    days.push({
      day: day_number,
      stops,
      cost: day_cost,
      used_minutes: cursor - r.start,
    })
  }
  let missing = r.must_visit.filter(id => !used.contains(id))
  if !missing.is_empty() {
    return Err([
      "无法安排全部心仪地点：" +
      missing.join(", ") +
      "。请调整预算、时间、地点顺序或筛选条件。",
    ])
  }
  let exclusions : Array[Exclusion] = []
  for p in input.places {
    if !used.contains(p.id) {
      let reason = match exclusion_reason(p, r) {
        Some(reason) => reason
        None =>
          "在当前排序下无法满足预算、开放时间、餐饮时段或路线限制；可调整条件重试"
      }
      exclusions.push({ id: p.id, name: p.name, reason, })
    }
  }
  let warnings = route_warnings(days, r, meals)
  if used.is_empty() {
    warnings.push(
      "没有可行景点，请放宽条件或导入更多有效数据。",
    )
  }
  let mut activity_cost = 0
  let mut food_cost = 0
  let mut transfer_cost = 0
  for day in days {
    for stop in day.stops {
      if stop.place.kind == "food" {
        food_cost += stop.place.cost
      } else {
        activity_cost += stop.place.cost
      }
      transfer_cost += stop.transfer_cost
    }
  }
  Ok({
    days,
    activity_cost,
    food_cost,
    transfer_cost,
    total_cost: total,
    remaining_budget: r.budget - total,
    exclusions,
    warnings,
  })
}

///|
fn has_meal_candidate(
  places : Array[Place],
  r : Request,
  preferences : Preferences,
  routing : Routing,
  label : String,
  previous : Place?,
  cursor : Int32,
  total : Int32,
  used : Map[String, Bool],
  restaurants : Array[Place],
  transfer_total : Int32,
  distance_total : Int32,
) -> Bool {
  let meals = { lunch: label == "午餐", dinner: label == "晚餐", }
  for p in places {
    if p.kind != "food" ||
      used.contains(p.id) ||
      exclusion_reason(p, r) is Some(_) ||
      restaurants.any(old => {
        restaurants_similar(old.city, old.name, p.city, p.name)
      }) {
      continue
    }
    let route = match route_transfer(previous, p, routing) {
      Some(value) => value
      None => continue
    }
    if !allowed_leg(route, preferences, routing, transfer_total, distance_total) ||
      total + route.cost + p.cost > r.budget {
      continue
    }
    let rest = if previous is Some(_) {
      rest_minutes(r, preferences)
    } else {
      0
    }
    if meal_window(p, cursor + route.minutes + rest, r, meals, false, false)
      is Some(_) {
      return true
    }
  }
  false
}
