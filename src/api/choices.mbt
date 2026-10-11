///|
priv struct ChoiceInput {
  input : @engine.Input
  preferences : @engine.Preferences
  routing : @engine.Routing
  meals : @engine.Meals
  choices : Array[@engine.PlaceChoice]
  locks : @engine.TripLocks
} derive(@json.FromJson)

///|
pub fn choose_plan_json(text : String) -> String {
  let c : ChoiceInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["地点选择格式无效"] } : Json).stringify()
  }
  match
    @engine.choose_trip(
      c.input,
      c.preferences,
      c.routing,
      c.meals,
      c.choices,
      c.locks,
    ) {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
priv struct ArrangeInput {
  input : @engine.Input
  preferences : @engine.Preferences
  routing : @engine.Routing
  meals : @engine.Meals
  stops : Array[@engine.ManualStop]
  locks : @engine.TripLocks
  options : Array[@engine.Route]?
  exact : Bool?
} derive(@json.FromJson)

///|
pub fn arrange_plan_json(text : String) -> String {
  let c : ArrangeInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["自主调整格式无效"] } : Json).stringify()
  }
  let result = if c.exact.unwrap_or(false) {
    let errors = @engine.validate_locks(c.stops, c.routing, c.locks)
    if !errors.is_empty() {
      Err(errors)
    } else {
      @engine.edit_trip(c.input, c.preferences, c.routing, c.meals, c.stops)
    }
  } else {
    @engine.arrange_trip(
      c.input,
      c.preferences,
      c.routing,
      c.meals,
      c.stops,
      c.locks,
    )
  }
  match result {
    Ok(plan) => ({ "ok": true, "plan": @json.to_json(plan) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
pub fn suggestions_json(text : String) -> String {
  let c : ArrangeInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["优化建议格式无效"] } : Json).stringify()
  }
  match
    @engine.suggest_trip(
      c.input,
      c.preferences,
      c.routing,
      c.meals,
      c.stops,
      c.locks,
      c.options.unwrap_or([]),
    ) {
    Ok(suggestions) =>
      ({ "ok": true, "suggestions": @json.to_json(suggestions) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
priv struct ReplacementInput {
  input : @engine.Input
  preferences : @engine.Preferences
  routing : @engine.Routing
  meals : @engine.Meals
  stops : Array[@engine.ManualStop]
  locks : @engine.TripLocks
  target_id : String
} derive(@json.FromJson)

///|
pub fn replacements_json(text : String) -> String {
  let c : ReplacementInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["替换地点格式无效"] } : Json).stringify()
  }
  match
    @engine.replacements(
      c.input,
      c.preferences,
      c.routing,
      c.meals,
      c.stops,
      c.locks,
      c.target_id,
    ) {
    Ok(options) =>
      ({ "ok": true, "options": @json.to_json(options) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}

///|
priv struct PlaceChangeInput {
  input : @engine.Input
  preferences : @engine.Preferences
  routing : @engine.Routing
  meals : @engine.Meals
  stops : Array[@engine.ManualStop]
  locks : @engine.TripLocks
  place_id : String
  action : String
  day : Int
  target_id : String
  after_id : String?
  meal : String
} derive(@json.FromJson)

///|
pub fn change_place_json(text : String) -> String {
  let c : PlaceChangeInput = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["地点调整格式无效"] } : Json).stringify()
  }
  match
    @engine.change_place(
      c.input,
      c.preferences,
      c.routing,
      c.meals,
      c.stops,
      c.locks,
      c.place_id,
      c.action,
      c.day,
      c.target_id,
      c.after_id,
      c.meal,
    ) {
    Ok(change) =>
      ({ "ok": true, "change": @json.to_json(change) } : Json).stringify()
    Err(errors) =>
      ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
}
