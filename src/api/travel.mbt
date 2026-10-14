///|
priv struct TravelInput {
  request : @engine.Request
  places : Array[@engine.Place]
  preferences : @engine.Preferences
  routing : @engine.Routing?
  meals : @engine.Meals?
} derive(@json.FromJson)

///|
pub fn plan_with_preferences_json(text : String) -> String {
  let input : TravelInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["旅行偏好格式无效"] } : Json).stringify()
  }
  match
    @engine.plan_trip(
      { request: input.request, places: input.places, },
      input.preferences,
      input.routing.unwrap_or(@engine.default_routing()),
      input.meals.unwrap_or(@engine.default_meals(input.request)),
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
      @engine.plan_trip(
        { request, places: input.places, },
        input.preferences,
        input.routing.unwrap_or(@engine.default_routing()),
        input.meals.unwrap_or(@engine.default_meals(input.request)),
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
  routing : @engine.Routing?
  meals : @engine.Meals?
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
  match
    @engine.edit_trip(
      edit.input,
      edit.preferences,
      edit.routing.unwrap_or(@engine.default_routing()),
      edit.meals.unwrap_or(@engine.default_meals(edit.input.request)),
      edit.stops,
    ) {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
priv struct CostInput {
  activity : Int32
  food : Int32
  transfer : Int32
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

///|
pub fn reflow_plan_json(text : String) -> String {
  let edit : EditInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["路线重排格式无效"] } : Json).stringify()
  }
  match
    @engine.reflow_trip(
      edit.input,
      edit.preferences,
      edit.routing.unwrap_or(@engine.default_routing()),
      edit.meals.unwrap_or(@engine.default_meals(edit.input.request)),
      edit.stops,
    ) {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}
