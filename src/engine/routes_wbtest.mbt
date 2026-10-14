///|
fn route_fixture(
  a : String,
  b : String,
  mode : String,
  minutes : Int32,
  distance : Int32,
  cost : Int32,
) -> Route {
  {
    from_id: a,
    to_id: b,
    mode,
    minutes,
    distance,
    cost,
    source: "高德路线规划",
    fetched_at: "2026-10-11T08:00:00Z",
  }
}

///|
test "map times override districts and manual conflicts include real transfer" {
  let a = fixture_place("a", 0, 60)
  let b = fixture_place("b", 0, 60)
  let input = {
    request: { ..fixture_request(), days: 1, end: 710, budget: 100, },
    places: [a, b],
  }
  let routing = {
    ..default_routing(),
    strict: true,
    routes: [route_fixture("a", "b", "transit", 75, 12000, 3)],
  }
  match
    plan_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
    ) {
    Ok(plan) => assert_eq(plan.days[0].stops.length(), 1)
    Err(_) => abort("valid route failed")
  }
  assert_true(
    edit_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      [{ id: "a", day: 1, start: 540, }, { id: "b", day: 1, start: 640, }],
    )
    is Err(_),
  )
}

///|
test "route is directional and unknown route is explicit" {
  let a = fixture_place("a", 0, 60)
  let b = fixture_place("b", 0, 60)
  let routing = {
    ..default_routing(),
    strict: true,
    routes: [route_fixture("a", "b", "transit", 2, 100, 3)],
  }
  assert_true(route_transfer(Some(b), a, routing) is None)
  assert_true(route_transfer(Some(a), b, routing) is Some({ minutes: 2, .. }))
  assert_true(
    route_transfer(Some(b), a, { ..routing, strict: false, })
    is Some({ source: "片区估算，未查询路线", .. }),
  )
}

///|
test "walking uses meters rather than matching administrative districts" {
  let p = { ..default_preferences(), walking: true, }
  let routing = { ..default_routing(), mode: "walking", distance_limit: 2000, }
  assert_true(
    allowed_leg(
      route_fixture("a", "b", "walking", 10, 800, 0),
      p,
      routing,
      0,
      0,
    ),
  )
  assert_false(
    allowed_leg(
      route_fixture("a", "b", "walking", 10, 1600, 0),
      p,
      routing,
      0,
      0,
    ),
  )
  assert_false(
    allowed_leg(
      route_fixture("a", "b", "walking", 10, 1000, 0),
      p,
      routing,
      0,
      1500,
    ),
  )
  assert_false(
    allowed_leg(
      route_fixture("a", "b", "transit", 10, 500, 3),
      p,
      routing,
      0,
      0,
    ),
  )
}

///|
test "lunch and dinner get separate slots and brands never repeat" {
  let r = {
    ..fixture_request(),
    include_food: true,
    start: 540,
    end: 1320,
    budget: 1000,
  }
  let a = {
    ..fixture_place("a", 30, 60),
    kind: "food",
    name: "青禾饭馆(湖滨店)",
    open: 600,
    close: 1320,
  }
  let b = { ..a, id: "b", name: "青禾饭馆(城北店)", }
  let c = { ..a, id: "c", name: "松月餐厅", }
  let d = { ..a, id: "d", name: "巷口食堂", }
  let e = { ..a, id: "e", name: "江边海鲜", }
  match
    plan_trip(
      { request: r, places: [a, b, c, d, e], },
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
    ) {
    Ok(plan) => {
      assert_eq(plan.days[0].stops.length(), 2)
      assert_eq(plan.days[1].stops.length(), 2)
      assert_eq(plan.days[0].stops[0].meal, "午餐")
      assert_eq(plan.days[0].stops[1].meal, "晚餐")
      assert_eq(plan.food_cost, 120)
      assert_true(plan.days[0].stops[1].start >= 1020)
    }
    Err(_) => abort("meals failed")
  }
}

///|
test "split opening periods reject lunch break and allow dinner" {
  let a = {
    ..fixture_place("a", 30, 60),
    kind: "food",
    open: 600,
    close: 1320,
    windows: Some([{ open: 600, close: 840, }, { open: 1020, close: 1320, }]),
  }
  let input = {
    request: { ..fixture_request(), include_food: true, end: 1320, },
    places: [a],
  }
  assert_true(
    edit_trip(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      [{ id: "a", day: 1, start: 900, }],
    )
    is Err(_),
  )
  match
    edit_trip(
      input,
      default_preferences(),
      default_routing(),
      { lunch: false, dinner: true, },
      [{ id: "a", day: 1, start: 1080, }],
    ) {
    Ok(plan) => assert_eq(plan.days[0].stops[0].meal, "晚餐")
    Err(_) => abort("dinner window rejected")
  }
  assert_eq(available_begin(a, 900, 1440), Some(1020))
}

///|
test "reflow retains date and order recalculates fare and preserves failure" {
  let a = fixture_place("a", 10, 60)
  let b = fixture_place("b", 20, 60)
  let input = { request: fixture_request(), places: [a, b], }
  let routing = {
    ..default_routing(),
    strict: true,
    routes: [route_fixture("a", "b", "transit", 42, 3962, 2)],
  }
  match
    reflow_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      [{ id: "a", day: 2, start: 600, }, { id: "b", day: 2, start: 700, }],
    ) {
    Ok(plan) => {
      assert_eq(plan.days[1].stops[1].start, 662)
      assert_eq(plan.days[1].stops[1].transfer_distance, 3962)
      assert_eq(plan.total_cost, 32)
    }
    Err(_) => abort("reflow failed")
  }
  assert_true(
    reflow_trip(
      { ..input, request: { ..input.request, budget: 30, }, },
      default_preferences(),
      routing,
      default_meals(input.request),
      [{ id: "a", day: 2, start: 600, }, { id: "b", day: 2, start: 700, }],
    )
    is Err(_),
  )
}

///|
test "missing dinner creates explicit warning without inventing cost" {
  let r = { ..fixture_request(), days: 1, include_food: true, end: 1020, }
  match
    plan_trip(
      { request: r, places: [], },
      default_preferences(),
      default_routing(),
      { lunch: false, dinner: true, },
    ) {
    Ok(plan) => {
      assert_eq(plan.food_cost, 0)
      assert_true(
        plan.warnings.any(w => w.contains("晚餐") && w.contains("未包含")),
      )
    }
    Err(_) => abort("empty plan failed")
  }
  assert_true(
    !validate_routing({
      ..default_routing(),
      routes: [route_fixture("a", "b", "walking", 10, 200, 4)],
    }).is_empty(),
  )
}

///|
test "optional sight cannot consume the last feasible dinner window" {
  let r = {
    ..fixture_request(),
    days: 1,
    start: 900,
    end: 1080,
    include_food: true,
    budget: 500,
  }
  let sight = { ..fixture_place("sight", 0, 120), open: 540, close: 1440, }
  let food = {
    ..fixture_place("food", 30, 60),
    kind: "food",
    open: 1020,
    close: 1320,
  }
  match
    plan_trip(
      { request: r, places: [sight, food], },
      default_preferences(),
      default_routing(),
      { lunch: false, dinner: true, },
    ) {
    Ok(plan) => {
      assert_eq(plan.days[0].stops.length(), 1)
      assert_eq(plan.days[0].stops[0].meal, "晚餐")
    }
    Err(_) => abort("dinner reservation failed")
  }
}
