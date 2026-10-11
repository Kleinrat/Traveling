///|
test "activities and roundtrip transport scale with people" {
  let expenses : TripExpenses = {
    people: 4,
    roundtrip: 500,
    trip_budget: 2600,
  }
  match trip_cost(100, 50, 20, expenses) {
    Ok(value) =>
      assert_true(
        value
        is {
          "roundtrip": 2000,
          "total": 2680,
          "per_person_estimate": 670,
          "remaining": -80,
          "over_budget": true,
          ..
        },
      )
    Err(_) => abort("valid costs rejected")
  }
  assert_true(trip_cost(100, 50, 20, { ..expenses, people: 0, }) is Err(_))
  assert_true(trip_cost(2147483647, 2147483647, 0, expenses) is Err(_))
}

///|
test "intense mode fits more visits by shortening rest" {
  let r = { ..fixture_request(), days: 1, start: 540, end: 900, }
  let places = [
    fixture_place("a", 0, 90),
    { ..fixture_place("b", 0, 90), district: "北区", },
    { ..fixture_place("c", 0, 90), district: "南区", },
  ]
  let normal = checked({ request: r, places, })
  let intense = match
    plan_with_preferences({ request: r, places, }, {
      ..default_preferences(),
      mode: "intense",
    }) {
    Ok(plan) => plan
    Err(_) => abort("intense failed")
  }
  assert_eq(normal.days[0].stops.length(), 2)
  assert_eq(intense.days[0].stops.length(), 3)
  assert_eq(rest_minutes(r, { ..default_preferences(), mode: "lazy", }), 45)
}

///|
test "weekend transfer cap and walking friendly prevent cross district legs" {
  let r = { ..fixture_request(), days: 1, }
  let places = [
    fixture_place("a", 0, 60),
    { ..fixture_place("b", 0, 60), district: "郊区", },
  ]
  for
    preferences in [
      { ..default_preferences(), mode: "weekend", transfer_limit: 15, },
      { ..default_preferences(), walking: true, },
    ] {
    match plan_with_preferences({ request: r, places, }, preferences) {
      Ok(plan) => assert_eq(plan.days[0].stops.length(), 1)
      Err(_) => abort("valid cap rejected")
    }
  }
}

///|
test "manual date edit recalculates transfers while invalid overlap fails" {
  let r = fixture_request()
  let a = fixture_place("a", 10, 60)
  let b = { ..fixture_place("b", 10, 60), district: "另一片区", }
  let input = { request: r, places: [a, b], }
  assert_true(
    edit_plan(input, default_preferences(), [
      { id: "a", day: 1, start: 540, },
      { id: "b", day: 1, start: 620, },
    ])
    is Err(_),
  )
  match
    edit_plan(input, default_preferences(), [
      { id: "a", day: 1, start: 540, },
      { id: "b", day: 2, start: 600, },
    ]) {
    Ok(plan) => {
      assert_eq(plan.total_cost, 20)
      assert_eq(plan.transfer_cost, 0)
      assert_eq(plan.days[1].stops[0].start, 600)
    }
    Err(_) => abort("valid date change failed")
  }
  assert_true(
    edit_plan(input, default_preferences(), [{ id: "a", day: 3, start: 540, }])
    is Err(_),
  )
  assert_true(
    edit_plan(
      { ..input, request: { ..r, budget: 10, }, },
      default_preferences(),
      [{ id: "a", day: 1, start: 540, }, { id: "b", day: 2, start: 540, }],
    )
    is Err(_),
  )
}

///|
test "manual edits respect opening times and restaurant diversity" {
  let r = { ..fixture_request(), include_food: true, }
  let a = {
    ..fixture_place("a", 10, 60),
    kind: "food",
    name: "老天津天津菜",
    open: 660,
  }
  let b = { ..a, id: "b", name: "老津门天津菜", }
  let input = { request: r, places: [a, b], }
  assert_true(
    edit_plan(input, default_preferences(), [{ id: "a", day: 1, start: 600, }])
    is Err(_),
  )
  assert_true(
    edit_plan(input, default_preferences(), [
      { id: "a", day: 1, start: 660, },
      { id: "b", day: 2, start: 660, },
    ])
    is Err(_),
  )
}
