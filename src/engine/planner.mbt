///|
/// Greedy feasible scheduler. This is deterministic, not globally optimal.
pub fn plan(input : Input) -> Result[Plan, Array[String]] {
  let errors = validate(input)
  if !errors.is_empty() {
    return Err(errors)
  }
  let r = input.request
  let used : Map[String, Bool] = Map([])
  let used_restaurants : Map[String, Bool] = Map([])
  let days : Array[Day] = []
  let mut total = 0
  for day_number in 1..<(r.days + 1) {
    let stops : Array[Stop] = []
    let mut cursor = r.start
    let mut previous : Place? = None
    let mut day_cost = 0
    let mut visits = 0
    let mut meals = 0
    while true {
      let mut best : Place? = None
      let mut best_score = -1
      let mut best_start = 0
      let mut best_transfer = (0, 0)
      let mut best_reasons : Array[String] = []
      for p in input.places {
        if used.contains(p.id) || exclusion_reason(p, r) is Some(_) {
          continue
        }
        if p.kind == "sight" && visits >= r.max_visits {
          continue
        }
        if p.kind == "food" && meals >= 1 {
          continue
        }
        if p.kind == "food" &&
          used_restaurants.contains(restaurant_identity(p.city, p.name)) {
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
        let (minutes, fare) = transfer(previous, p)
        let rest = if previous is Some(_) {
          if r.relaxed {
            45
          } else {
            20
          }
        } else {
          0
        }
        let arrival = cursor + minutes + rest
        let begin = if arrival > p.open { arrival } else { p.open }
        if begin + p.duration > r.end || begin + p.duration > p.close {
          continue
        }
        if total + p.cost + fare > r.budget {
          continue
        }
        let (base, reasons) = score(p, r)
        let nearby = match previous {
          Some(prev) => prev.district == p.district
          None => false
        }
        let chosen = r.must_visit.contains(p.id)
        let meal_due = p.kind == "food" && cursor >= 630
        let value = base +
          (if nearby { 8 } else { 0 }) +
          (if chosen { 10000 } else { 0 }) +
          (if meal_due { 200 } else { 0 })
        if chosen {
          reasons.push("用户选定地点，优先安排")
        }
        if meal_due {
          reasons.push("已接近午餐时段，优先安排用餐")
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
            reasons: best_reasons,
          })
          cursor = best_start + p.duration
          total += p.cost + fare
          day_cost += p.cost + fare
          if p.kind == "sight" {
            visits += 1
          } else {
            meals += 1
            used_restaurants[restaurant_identity(p.city, p.name)] = true
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
          "在当前排序下无法同时满足剩余预算、每日时间和开放时间；可调整条件重试"
      }
      exclusions.push({ id: p.id, name: p.name, reason, })
    }
  }
  let warnings = [
    "示例数据与交通估算不代表实时信息，出行前请核实费用和开放时间。",
    "预算含已安排的活动、餐饮人均估算和市内接驳，不含酒店与往返大交通。",
    "每天第一站不计接驳；同片区 15 分钟/8 元，跨片区 35 分钟/15 元。",
    "算法使用可解释的贪心策略，不保证全局最优；每日餐饮时间需自行预留。",
  ]
  if r.include_food &&
    days.any(day => !day.stops.any(stop => stop.place.kind == "food")) {
    warnings.push(
      "部分日期没有可行餐厅；请导入符合城市、时间、预算和饮食条件的餐厅。",
    )
  }
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
