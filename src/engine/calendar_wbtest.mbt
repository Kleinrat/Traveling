///|
test "weekly closures wrap across weeks and require calendar context" {
  let p = { ..fixture_place("museum", 0, 60), closed_weekdays: Some([1]), }
  let r = { ..fixture_request(), start_weekday: Some(7), }
  assert_true(available_on(p, r, 1))
  assert_false(available_on(p, r, 2))
  assert_true(available_on(p, r, 3))
  assert_false(available_on(p, fixture_request(), 1))
  assert_true(available_on(fixture_place("park", 0, 60), fixture_request(), 1))
}

///|
test "automatic planning moves Monday closed museum to Tuesday" {
  let p = { ..fixture_place("museum", 0, 60), closed_weekdays: Some([1]), }
  let plan = checked({
    request: { ..fixture_request(), start_weekday: Some(1), },
    places: [p],
  })
  assert_eq(plan.days[0].stops.length(), 0)
  assert_eq(plan.days[1].stops.length(), 1)
  assert_eq(plan.days[1].stops[0].place.id, "museum")
}

///|
test "manual edits arrangement and reflow cannot bypass closure" {
  let p = { ..fixture_place("museum", 0, 60), closed_weekdays: Some([1]), }
  let input = {
    request: { ..fixture_request(), start_weekday: Some(1), },
    places: [p],
  }
  let edits = [{ id: "museum", day: 1, start: 540, }]
  assert_true(edit_plan(input, default_preferences(), edits) is Err(_))
  assert_true(
    arrange_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
    )
    is Err(_),
  )
  assert_true(
    reflow_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
    )
    is Err(_),
  )
  assert_true(
    edit_plan(input, default_preferences(), [
      { id: "museum", day: 2, start: 540, },
    ])
    is Ok(_),
  )
}

///|
test "invalid calendar values are rejected" {
  for day in [0, 8] {
    assert_true(
      !validate({
        request: { ..fixture_request(), start_weekday: Some(day), },
        places: [],
      }).is_empty(),
    )
    assert_true(
      !validate({
        request: fixture_request(),
        places: [
          { ..fixture_place("bad", 0, 60), closed_weekdays: Some([day]), },
        ],
      }).is_empty(),
    )
  }
}

///|
test "unknown weekday yields an explanatory exclusion" {
  let p = { ..fixture_place("museum", 0, 60), closed_weekdays: Some([1]), }
  let plan = checked({ request: fixture_request(), places: [p], })
  assert_true(plan.days.all(d => d.stops.is_empty()))
  assert_true(plan.exclusions[0].reason.contains("未提供出发日期"))
}
