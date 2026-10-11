///|
test "mixed transport respects each chosen directional leg" {
  let a = fixture_place("a", 10, 60)
  let b = fixture_place("b", 20, 60)
  let c = fixture_place("c", 30, 60)
  let routing = {
    ..default_routing(),
    mode: "mixed",
    strict: true,
    routes: [
      route_fixture("a", "b", "walking", 10, 700, 0),
      route_fixture("b", "c", "transit", 20, 4000, 3),
    ],
  }
  let input = { request: { ..fixture_request(), days: 1, }, places: [a, b, c], }
  match
    arrange_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      [
        { id: "a", day: 1, start: 540, },
        { id: "b", day: 1, start: 650, },
        { id: "c", day: 1, start: 750, },
      ],
      empty_locks(),
    ) {
    Ok(p) => {
      assert_eq(p.transfer_cost, 3)
      assert_eq(p.days[0].stops[1].transfer_minutes, 10)
      assert_eq(p.days[0].stops[2].transfer_minutes, 20)
    }
    Err(_) => abort("mixed routes failed")
  }
  assert_true(
    !validate_routing({
      ..routing,
      routes: routing.routes + [route_fixture("a", "b", "transit", 2, 700, 2)],
    }).is_empty(),
  )
}

///|
test "array order is respected without swapping meal identity" {
  let input = {
    request: { ..fixture_request(), days: 1, },
    places: [fixture_place("a", 0, 60), fixture_place("b", 0, 60)],
  }
  match
    arrange_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      [{ id: "b", day: 1, start: 700, }, { id: "a", day: 1, start: 540, }],
      empty_locks(),
    ) {
    Ok(p) => {
      assert_eq(p.days[0].stops[0].place.id, "b")
      assert_eq(p.days[0].stops[1].place.id, "a")
    }
    Err(_) => abort("ordered edits failed")
  }
}

///|
test "time locks preserve exact starts and unreachable locks fail" {
  let input = {
    request: { ..fixture_request(), days: 1, },
    places: [fixture_place("a", 0, 60), fixture_place("b", 0, 60)],
  }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 1, start: 700, },
  ]
  let locks = { ..empty_locks(), times: [edits[1]], }
  match
    arrange_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      locks,
    ) {
    Ok(p) => assert_eq(p.days[0].stops[1].start, 700)
    Err(_) => abort("time lock moved")
  }
  let slow = {
    ..default_routing(),
    routes: [route_fixture("a", "b", "transit", 180, 30000, 2)],
  }
  assert_true(
    arrange_trip(
      input,
      default_preferences(),
      slow,
      default_meals(input.request),
      edits,
      locks,
    )
    is Err(_),
  )
  assert_true(
    arrange_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      [{ id: "a", day: 1, start: 540, }, { id: "b", day: 1, start: 710, }],
      locks,
    )
    is Err(_),
  )
}

///|
test "place locks reject removal or a different day" {
  let locked = { id: "a", day: 1, start: 540, }
  let locks = { ..empty_locks(), places: [locked], }
  assert_true(!validate_locks([], default_routing(), locks).is_empty())
  assert_true(
    !validate_locks([{ ..locked, day: 2, }], default_routing(), locks).is_empty(),
  )
  assert_true(
    validate_locks([{ ..locked, start: 700, }], default_routing(), locks).is_empty(),
  )
}

///|
test "transport locks reject changed mode and broken adjacency" {
  let route = route_fixture("a", "b", "transit", 10, 1500, 3)
  let routing = { ..default_routing(), mode: "mixed", routes: [route], }
  let locks = { ..empty_locks(), legs: [route], }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 1, start: 650, },
  ]
  assert_true(validate_locks(edits, routing, locks).is_empty())
  assert_true(
    !validate_locks(
      edits,
      { ..routing, routes: [{ ..route, mode: "walking", cost: 0, }], },
      locks,
    ).is_empty(),
  )
  assert_true(
    !validate_locks(
      [edits[0], { id: "c", day: 1, start: 620, }, edits[1]],
      routing,
      locks,
    ).is_empty(),
  )
}

///|
test "day selection and avoid apply before publishing a plan" {
  let input = {
    request: fixture_request(),
    places: [fixture_place("a", 0, 60), fixture_place("b", 0, 60)],
  }
  match
    choose_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      [
        { id: "a", state: "must", day: 2, },
        { id: "b", state: "avoid", day: 0, },
      ],
      empty_locks(),
    ) {
    Ok(p) => {
      assert_eq(p.days[0].stops.length(), 0)
      assert_eq(p.days[1].stops[0].place.id, "a")
    }
    Err(_) => abort("day choice failed")
  }
  assert_true(
    choose_trip(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      [{ id: "a", state: "must", day: 3, }],
      empty_locks(),
    )
    is Err(_),
  )
}

///|
test "suggestions validate savings and cannot override locked transport" {
  let input = {
    request: { ..fixture_request(), days: 1, },
    places: [fixture_place("a", 0, 60), fixture_place("b", 0, 60)],
  }
  let route = route_fixture("a", "b", "transit", 40, 3000, 4)
  let routing = { ..default_routing(), mode: "mixed", routes: [route], }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 1, start: 680, },
  ]
  let options = [route_fixture("a", "b", "walking", 15, 800, 0), route]
  match
    suggest_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      empty_locks(),
      options,
    ) {
    Ok(items) => {
      assert_true(!items.is_empty())
      assert_eq(items[0].cost_delta, -4)
      assert_eq(items[0].transfer_delta, -25)
    }
    Err(_) => abort("suggestions failed")
  }
  match
    suggest_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      { ..empty_locks(), legs: [route], },
      options,
    ) {
    Ok(items) => assert_eq(items.length(), 0)
    Err(_) => abort("lock suggestion check failed")
  }
  assert_true(
    suggest_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      empty_locks(),
      [{ ..route, cost: -1, }],
    )
    is Err(_),
  )
}

///|
test "order suggestions require complete directional evidence and preserve costs" {
  let input = {
    request: { ..fixture_request(), days: 1, },
    places: [fixture_place("a", 10, 40), fixture_place("b", 20, 40)],
  }
  let routing = {
    ..default_routing(),
    mode: "mixed",
    routes: [route_fixture("a", "b", "transit", 35, 3000, 3)],
  }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 1, start: 650, },
  ]
  let options = [route_fixture("b", "a", "transit", 10, 1000, 2)]
  match
    suggest_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      empty_locks(),
      options,
    ) {
    Ok(items) => {
      assert_eq(items.length(), 1)
      assert_eq(items[0].label, "调换相邻景点")
      assert_eq(items[0].transfer_delta, -25)
      assert_eq(items[0].plan.days[0].stops[0].place.id, "b")
    }
    Err(_) => abort("directional reorder suggestion failed")
  }
  match
    suggest_trip(
      input,
      default_preferences(),
      routing,
      default_meals(input.request),
      edits,
      empty_locks(),
      [],
    ) {
    Ok(items) => assert_eq(items.length(), 0)
    Err(_) => abort("missing evidence failed")
  }
}

///|
test "replacement offers at most three feasible places and keeps other days" {
  let input = {
    request: fixture_request(),
    places: [
      fixture_place("a", 10, 40),
      fixture_place("b", 10, 40),
      fixture_place("c", 10, 40),
      fixture_place("d", 10, 40),
      fixture_place("e", 10, 40),
      fixture_place("f", 10, 40),
    ],
  }
  let edits = [
    { id: "a", day: 1, start: 540, },
    { id: "b", day: 2, start: 540, },
  ]
  match
    replacements(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "a",
    ) {
    Ok(items) => {
      assert_eq(items.length(), 3)
      for item in items {
        assert_true(item.id != "a" && item.id != "b")
        assert_eq(item.plan.days[1].stops[0].place.id, "b")
        assert_true(item.request.must_visit.contains(item.id))
        assert_eq(item.cost_delta, 0)
      }
    }
    Err(_) => abort("replacement failed")
  }
}

///|
test "replacement respects budget diet and existing locks" {
  let input = {
    request: { ..fixture_request(), days: 1, budget: 20, },
    places: [fixture_place("a", 10, 40), fixture_place("expensive", 30, 40)],
  }
  let edits = [{ id: "a", day: 1, start: 540, }]
  match
    replacements(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "a",
    ) {
    Ok(items) => assert_eq(items.length(), 0)
    Err(_) => abort("budget substitution failed")
  }
  assert_true(
    replacements(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      { ..empty_locks(), times: edits, },
      "a",
    )
    is Err(_),
  )
  assert_true(
    replacements(
      input,
      default_preferences(),
      default_routing(),
      default_meals(input.request),
      edits,
      empty_locks(),
      "missing",
    )
    is Err(_),
  )
}

///|
test "food replacement rejects a branch already present in the roadbook" {
  let food = {
    ..fixture_place("lunch", 10, 40),
    kind: "food",
    name: "青禾饭馆(湖滨店)",
    open: 600,
    close: 1320,
  }
  let dinner = { ..food, id: "dinner", name: "松月餐厅", }
  let branch = { ..food, id: "branch", name: "青禾饭馆(城北店)", }
  let alternative = { ..food, id: "alternative", name: "巷口食堂", }
  let input = {
    request: {
      ..fixture_request(),
      days: 1,
      include_food: true,
      end: 1320,
      budget: 100,
    },
    places: [food, dinner, branch, alternative],
  }
  let edits = [
    { id: "lunch", day: 1, start: 660, },
    { id: "dinner", day: 1, start: 1020, },
  ]
  match
    replacements(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      edits,
      empty_locks(),
      "dinner",
    ) {
    Ok(items) => {
      assert_eq(items.length(), 1)
      assert_eq(items[0].id, "alternative")
      assert_eq(items[0].plan.days[0].stops[1].meal, "晚餐")
    }
    Err(_) => abort("food replacement failed")
  }
}
