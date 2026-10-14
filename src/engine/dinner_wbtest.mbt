///|
fn dinner_fixture() -> Input {
  let sight = {
    ..fixture_place("sight", 10, 60),
    location: Some("120.15,30.25"),
    close: 1020,
  }
  let lunch = {
    ..fixture_place("lunch", 10, 40),
    kind: "food",
    name: "青禾饭馆(湖滨店)",
    open: 600,
    close: 840,
    location: Some("120.15,30.25"),
  }
  let near = {
    ..fixture_place("near", 20, 60),
    kind: "food",
    name: "巷口食堂",
    open: 1020,
    close: 1260,
    location: Some("120.151,30.25"),
  }
  let far = {
    ..near,
    id: "far",
    name: "山海餐厅",
    cost: 10,
    location: Some("120.20,30.25"),
    tags: ["自然", "文化", "历史", "美食"],
  }
  {
    request: {
      ..fixture_request(),
      days: 1,
      end: 1200,
      include_food: true,
      interests: ["文化", "历史", "美食"],
    },
    places: [sight, lunch, far, near],
  }
}

///|
test "dinner ranks coordinates near last sight above same-district interest score" {
  let input = dinner_fixture()
  match
    plan_trip(input, default_preferences(), default_routing(), {
      lunch: true,
      dinner: true,
    }) {
    Ok(plan) => {
      let dinners = plan.days[0].stops.filter(s => s.meal == "晚餐")
      assert_eq(dinners.length(), 1)
      assert_eq(dinners[0].place.id, "near")
      assert_true(dinners[0].start >= 1020)
      assert_true(dinners[0].reasons.any(s => s.contains("坐标距离")))
    }
    Err(_) => abort("dinner planning failed")
  }
}

///|
test "completing dinner extends time preserves manual gaps and keeps locks" {
  let input = {
    ..dinner_fixture(),
    request: { ..dinner_fixture().request, end: 1020, },
  }
  let stops = [
    { id: "lunch", day: 1, start: 660, },
    { id: "sight", day: 1, start: 900, },
  ]
  match
    complete_dinners(
      input,
      default_preferences(),
      default_routing(),
      { lunch: true, dinner: true, },
      stops,
      { ..empty_locks(), times: stops, },
    ) {
    Ok(change) => {
      assert_eq(change.request.end, 1200)
      let day = change.plan.days[0]
      assert_eq(day.stops.length(), 3)
      assert_eq(day.stops[0].start, 660)
      assert_eq(day.stops[1].start, 900)
      assert_eq(day.stops[2].place.id, "near")
      assert_eq(day.stops[2].meal, "晚餐")
      assert_true(day.stops[2].start >= 1020)
      assert_eq(change.cost_delta, 28)
      assert_eq(stops.length(), 2)
    }
    Err(_) => abort("completion failed")
  }
}

///|
test "dinner completion skips avoided duplicate branches and unaffordable nearby food" {
  let original = dinner_fixture()
  let stops = [
    { id: "lunch", day: 1, start: 660, },
    { id: "sight", day: 1, start: 900, },
  ]
  for
    input in [
      { ..original, request: { ..original.request, avoid: ["near"], }, },
      {
        ..original,
        places: original.places.map(p => {
          if p.id == "near" {
            { ..p, cost: 200, }
          } else {
            p
          }
        }),
      },
      {
        ..original,
        places: original.places.map(p => {
          if p.id == "near" {
            { ..p, name: "青禾饭馆(城北店)", }
          } else {
            p
          }
        }),
      },
    ] {
    match
      complete_dinners(
        input,
        default_preferences(),
        default_routing(),
        { lunch: true, dinner: false, },
        stops,
        empty_locks(),
      ) {
      Ok(change) => assert_eq(change.plan.days[0].stops[2].place.id, "far")
      Err(_) => abort("feasible alternative failed")
    }
  }
}

///|
test "missing dinner data or short opening time does not change the roadbook" {
  let original = dinner_fixture()
  let stops = [
    { id: "lunch", day: 1, start: 660, },
    { id: "sight", day: 1, start: 900, },
  ]
  for
    places in [
      original.places.filter(p => p.id == "lunch" || p.id == "sight"),
      original.places.map(p => {
        if p.id == "near" || p.id == "far" {
          { ..p, close: 1030, }
        } else {
          p
        }
      }),
    ] {
    assert_true(
      complete_dinners(
        { ..original, places, },
        default_preferences(),
        default_routing(),
        { lunch: true, dinner: true, },
        stops,
        empty_locks(),
      )
      is Err(_),
    )
    assert_eq(stops.length(), 2)
  }
}

///|
test "coordinate parsing rejects missing malformed nonfinite and out-of-range values" {
  let place = fixture_place("a", 0, 30)
  for
    location in [
      None,
      Some(""),
      Some("120"),
      Some("NaN,30"),
      Some("200,30"),
      Some("120,99"),
    ] {
    assert_true(coordinates({ ..place, location, }) is None)
  }
  assert_true(
    coordinates({ ..place, location: Some("120.15,30.25"), }) is Some(_),
  )
  let near = { ..place, id: "near", district: "中心", }
  let far = { ..place, id: "far", district: "其他片区", }
  assert_true(
    dinner_distance(Some(place), near, default_routing()) <
    dinner_distance(Some(place), far, default_routing()),
  )
}

///|
test "completion keeps prior days and prevents repeated restaurants across days" {
  let original = dinner_fixture()
  let input = {
    request: { ..original.request, days: 2, budget: 300, },
    places: original.places + [{ ..original.places[0], id: "sight2", }],
  }
  let stops = [
    { id: "sight", day: 1, start: 900, },
    { id: "sight2", day: 2, start: 930, },
  ]
  match
    complete_dinners(
      input,
      default_preferences(),
      default_routing(),
      { lunch: false, dinner: true, },
      stops,
      empty_locks(),
    ) {
    Ok(change) => {
      assert_eq(change.plan.days[0].stops[0].start, 900)
      assert_eq(change.plan.days[1].stops[0].start, 930)
      let d1 = change.plan.days[0].stops[1]
      let d2 = change.plan.days[1].stops[1]
      assert_eq(d1.meal, "晚餐")
      assert_eq(d2.meal, "晚餐")
      assert_true(d1.place.id != d2.place.id)
    }
    Err(_) => abort("two-day dinners failed")
  }
}

///|
test "optional expensive meal does not consume the budget for later days" {
  let names = [
    "巷口食堂", "山海菜馆", "松月餐厅", "青禾饭馆", "溪岸小馆",
  ]
  let foods = names.map(name => {
    ..fixture_place(name, 10, 40),
    name,
    kind: "food",
    open: 600,
    close: 1260,
    location: Some("120.15,30.25"),
  })
  let fancy = {
    ..foods[0],
    id: "fancy",
    name: "长街酒楼",
    cost: 85,
    location: Some("120.15001,30.25"),
  }
  let sights = [
    { ..fixture_place("a", 0, 30), location: Some("120.15,30.25"), },
    { ..fixture_place("b", 0, 30), location: Some("120.15,30.25"), },
  ]
  let input = {
    request: {
      ..fixture_request(),
      days: 2,
      end: 1200,
      budget: 100,
      include_food: true,
      max_visits: 1,
    },
    places: sights + foods + [fancy],
  }
  match
    plan_trip(input, default_preferences(), default_routing(), {
      lunch: true,
      dinner: true,
    }) {
    Ok(plan) => {
      let mut count = 0
      for day in plan.days {
        count += day.stops.filter(s => s.place.kind == "food").length()
      }
      assert_eq(count, 4)
      assert_true(!plan.days.any(d => d.stops.any(s => s.place.id == "fancy")))
      assert_true(plan.total_cost <= 100)
    }
    Err(_) => abort("reserved meal budget failed")
  }
}
