///|
priv struct TravelInput {
  request : @engine.Request
  places : Array[@engine.Place]
  preferences : @engine.Preferences
} derive(@json.FromJson)

///|
pub fn plan_with_preferences_json(text : String) -> String {
  let input : TravelInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["旅行偏好格式无效"] } : Json).stringify()
  }
  match
    @engine.plan_with_preferences(
      { request: input.request, places: input.places, },
      input.preferences,
    ) {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
pub fn alternatives_with_preferences_json(text : String) -> String {
  let input : TravelInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["旅行偏好格式无效"] } : Json).stringify()
  }
  let alternatives : Array[Json] = []
  for
    (priority, label) in [
      ("balanced", "均衡体验"),
      ("budget", "预算优先"),
      ("interest", "兴趣优先"),
    ] {
    let request = { ..input.request, priority, }
    match
      @engine.plan_with_preferences(
        { request, places: input.places, },
        input.preferences,
      ) {
      Ok(plan) =>
        alternatives.push({
          "label": label,
          "request": @json.to_json(request),
          "plan": @json.to_json(plan),
        })
      Err(errors) =>
        return ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
    }
  }
  ({ "ok": true, "alternatives": @json.to_json(alternatives) } : Json).stringify()
}

///|
priv struct EditInput {
  input : @engine.Input
  preferences : @engine.Preferences
  stops : Array[@engine.ManualStop]
} derive(@json.FromJson)

///|
pub fn edit_plan_json(text : String) -> String {
  let edit : EditInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return (
        { "ok": false, "errors": ["调整日期和时间的格式无效"] } :
        Json).stringify()
  }
  match @engine.edit_plan(edit.input, edit.preferences, edit.stops) {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
priv struct CostInput {
  activity : Int
  food : Int
  transfer : Int
  expenses : @engine.TripExpenses
} derive(@json.FromJson)

///|
pub fn trip_cost_json(text : String) -> String {
  let c : CostInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["旅行费用格式无效"] } : Json).stringify()
  }
  match @engine.trip_cost(c.activity, c.food, c.transfer, c.expenses) {
    Ok(cost) => ({ "ok": true, "cost": cost } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}
