///|
test "adding a chosen place preserves prefix and other days including manual gaps" {
  let input = {
    request: { ..fixture_request(), avoid: ["new"], },
    places: [
      fixture_place("a", 10, 40),
      fixture_place("b", 10, 40),
      fixture_place("new", 20, 40),
    ],
  }
  let edits = [
    { id: "a", day: 1, start: 600, },
    { id: "b", day: 2, start: 720, },
  ]
  match
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "new",
      "add",
      1,
      "",
      Some("a"),
      "",
    ) {
    Ok(change) => {
      assert_eq(change.plan.days[0].stops.length(), 2)
      assert_eq(change.plan.days[0].stops[0].start, 600)
      assert_eq(change.plan.days[0].stops[1].place.id, "new")
      assert_eq(change.plan.days[1].stops[0].place.id, "b")
      assert_eq(change.plan.days[1].stops[0].start, 720)
      assert_eq(change.cost_delta, 28)
      assert_true(change.request.must_visit.contains("new"))
      assert_true(!change.request.avoid.contains("new"))
      assert_eq(edits.length(), 2)
      assert_eq(input.request.avoid.length(), 1)
    }
    Err(_) => abort("explicit addition failed")
  }
}

///|
test "automatic insertion finds an open window while fixed insertion explains failure" {
  let early = { ..fixture_place("early", 10, 40), close: 600, }
  let input = {
    request: fixture_request(),
    places: [fixture_place("a", 10, 40), early],
  }
  let edits = [{ id: "a", day: 1, start: 600, }]
  match
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "early",
      "add",
      1,
      "",
      None,
      "",
    ) {
    Ok(change) => assert_eq(change.plan.days[0].stops[0].place.id, "early")
    Err(_) => abort("automatic insertion failed")
  }
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "early",
      "add",
      1,
      "",
      Some("a"),
      "",
    )
    is Err(_),
  )
}

///|
test "exact chosen replacement retains meal and other day time" {
  let food = {
    ..fixture_place("lunch", 10, 40),
    kind: "food",
    open: 600,
    close: 1320,
    name: "青禾饭馆",
  }
  let next = { ..food, id: "next", name: "巷口食堂", cost: 20, }
  let input = {
    request: {
      ..fixture_request(),
      include_food: true,
      end: 1320,
      must_visit: ["lunch"],
    },
    places: [
      food,
      next,
      fixture_place("a", 10, 40),
      fixture_place("unused-sight", 10, 40),
    ],
  }
  let edits = [
    { id: "lunch", day: 1, start: 660, },
    { id: "a", day: 2, start: 780, },
  ]
  match
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "next",
      "replace",
      7,
      "lunch",
      None,
      "",
    ) {
    Ok(change) => {
      assert_eq(change.plan.days[0].stops[0].place.id, "next")
      assert_eq(change.plan.days[0].stops[0].meal, "午餐")
      assert_eq(change.plan.days[1].stops[0].start, 780)
      assert_eq(change.request.must_visit, ["next"])
      assert_eq(change.cost_delta, 10)
    }
    Err(_) => abort("chosen restaurant replacement failed")
  }
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "unused-sight",
      "replace",
      1,
      "lunch",
      None,
      "",
    )
    is Err(_),
  )
}

///|
test "chosen addition rejects full or disabled meals and repeat restaurant branches" {
  let food = {
    ..fixture_place("lunch", 10, 40),
    kind: "food",
    open: 600,
    close: 1320,
    name: "青禾饭馆(湖滨店)",
  }
  let branch = { ..food, id: "branch", name: "青禾饭馆(城北店)", }
  let next = { ..food, id: "next", name: "巷口食堂", }
  let input = {
    request: { ..fixture_request(), include_food: true, end: 1320, },
    places: [food, branch, next],
  }
  let edits = [{ id: "lunch", day: 1, start: 660, }]
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "next",
      "add",
      1,
      "",
      None,
      "lunch",
    )
    is Err(_),
  )
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: false, },
      edits,
      empty_locks(),
      "next",
      "add",
      1,
      "",
      None,
      "dinner",
    )
    is Err(_),
  )
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "branch",
      "add",
      2,
      "",
      None,
      "lunch",
    )
    is Err(_),
  )
  match
    change_place(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "next",
      "add",
      1,
      "",
      None,
      "dinner",
    ) {
    Ok(change) => {
      assert_eq(change.plan.days[0].stops.length(), 2)
      assert_eq(change.plan.days[0].stops[0].meal, "午餐")
      assert_eq(change.plan.days[0].stops[1].meal, "晚餐")
    }
    Err(_) => abort("free dinner slot failed")
  }
}

///|
test "chosen place changes reject duplicates wrong city invalid position and hard limits" {
  let a = fixture_place("a", 10, 40)
  let b = fixture_place("b", 20, 40)
  let other = { ..b, id: "other", city: "其他城", }
  let input = { request: fixture_request(), places: [a, b, other], }
  let edits = [{ id: "a", day: 1, start: 540, }]
  for id in ["a", "other", "missing"] {
    assert_true(
      change_place(
        input,
        default_preferences(),
        default_routing(),
        default_meals(input.request),
        edits,
        empty_locks(),
        id,
        "add",
        1,
        "",
        None,
        "",
      )
      is Err(_),
    )
  }
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "b",
      "add",
      0,
      "",
      None,
      "",
    )
    is Err(_),
  )
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "b",
      "add",
      1,
      "",
      Some("missing"),
      "",
    )
    is Err(_),
  )
  for
    request in [
      { ..input.request, budget: 15, },
      { ..input.request, max_visits: 1, },
    ] {
    assert_true(
      change_place(
        { ..input, request, },
        default_preferences(),
        default_routing(),
        default_meals(request),
        edits,
        empty_locks(),
        "b",
        "add",
        1,
        "",
        None,
        "",
      )
      is Err(_),
    )
  }
  let rainy = { ..b, indoor: false, }
  let rain_input = {
    request: { ..input.request, rain: true, },
    places: [a, rainy],
  }
  assert_true(
    change_place(
      rain_input,
      default_preferences(),
      default_routing(),
      default_meals(rain_input.request),
      edits,
      empty_locks(),
      "b",
      "replace",
      1,
      "a",
      None,
      "",
    )
    is Err(_),
  )
}

///|
test "chosen changes respect place time and directional leg locks" {
  let input = {
    request: fixture_request(),
    places: [
      fixture_place("a", 10, 40),
      fixture_place("b", 10, 40),
      fixture_place("new", 10, 120),
    ],
  }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 1, start: 620, },
  ]
  for
    locks in [
      { ..empty_locks(), places: [edits[0]], },
      { ..empty_locks(), times: [edits[0]], },
    ] {
    assert_true(
      change_place(
        input,
        default_preferences(),
        default_routing(),
        default_meals(input.request),
        edits,
        locks,
        "new",
        "replace",
        1,
        "a",
        None,
        "",
      )
      is Err(_),
    )
  }
  let times = { ..empty_locks(), times: [edits[1]], }
  assert_true(
    change_place(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      times,
      "new",
      "add",
      1,
      "",
      Some("a"),
      "",
    )
    is Err(_),
  )
  let route = route_fixture("a", "b", "walking", 10, 700, 0)
  let routing = { ..default_routing(), routes: [route], mode: "mixed", }
  let legs = { ..empty_locks(), legs: [route], }
  assert_true(
    change_place(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      legs,
      "new",
      "add",
      1,
      "",
      Some("a"),
      "",
    )
    is Err(_),
  )
  assert_true(
    change_place(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      legs,
      "new",
      "replace",
      1,
      "b",
      None,
      "",
    )
    is Err(_),
  )
}
