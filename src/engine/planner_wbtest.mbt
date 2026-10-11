///|
fn fixture_request() -> Request {
  {
    city: "测试城",
    days: 2,
    budget: 100,
    start: 540,
    end: 1020,
    interests: ["文化"],
    family: false,
    rain: false,
    relaxed: false,
    must_visit: [],
    avoid: [],
    priority: "balanced",
    include_food: false,
    diet: "不限",
    max_visits: 4,
  }
}

///|
fn fixture_place(id : String, cost : Int, duration : Int) -> Place {
  {
    id,
    name: id,
    city: "测试城",
    district: "中心",
    tags: ["文化"],
    cost,
    duration,
    open: 540,
    close: 1020,
    indoor: true,
    family: true,
    source: "原创测试数据",
    url: "",
    kind: "sight",
    windows: None,
  }
}

///|
fn checked(input : Input) -> Plan {
  match plan(input) {
    Ok(result) => result
    Err(_) => abort("unexpected invalid fixture")
  }
}

///|
test "invalid ranges are rejected" {
  let r = fixture_request()
  for budget in [-1, 100001] {
    assert_true(
      !validate({ request: { ..r, budget, }, places: [], }).is_empty(),
    )
  }
  for days in [0, 8] {
    assert_true(!validate({ request: { ..r, days, }, places: [], }).is_empty())
  }
  for (start, end) in [(-1, 1020), (540, 1441), (600, 600), (800, 600)] {
    assert_true(
      !validate({ request: { ..r, start, end, }, places: [], }).is_empty(),
    )
  }
}

///|
test "duplicate IDs and malformed catalogue fail before scheduling" {
  let p = fixture_place("a", 0, 90)
  let r = fixture_request()
  assert_true(!validate({ request: r, places: [p, p], }).is_empty())
  for
    bad in [
      { ..p, cost: -1, },
      { ..p, duration: 0, },
      { ..p, open: 1020, close: 540, },
      { ..p, source: "", },
    ] {
    assert_true(!validate({ request: r, places: [bad], }).is_empty())
  }
}

///|
test "budget includes local transfer fare" {
  let p = checked({
    request: { ..fixture_request(), budget: 20, },
    places: [fixture_place("a", 10, 60), fixture_place("b", 10, 60)],
  })
  assert_eq(p.total_cost, 20)
  assert_eq(p.days[0].stops.length(), 1)
  assert_eq(p.days[1].stops.length(), 1)
}

///|
test "same day transfer cannot exceed the budget" {
  let p = checked({
    request: { ..fixture_request(), days: 1, budget: 20, },
    places: [fixture_place("a", 10, 60), fixture_place("b", 10, 60)],
  })
  assert_eq(p.total_cost, 10)
  assert_eq(p.exclusions.length(), 1)
}

///|
test "rain and family are hard filters" {
  let a = fixture_place("a", 0, 60)
  let p = checked({
    request: { ..fixture_request(), rain: true, family: true, },
    places: [
      a,
      { ..a, id: "b", indoor: false, },
      { ..a, id: "c", family: false, },
    ],
  })
  assert_eq(p.exclusions.length(), 2)
  assert_eq(p.days[0].stops[0].place.id, "a")
}

///|
test "relaxed mode rejects long activities" {
  let p = checked({
    request: {
      ..fixture_request(),
      relaxed: true,
      must_visit: [],
      avoid: [],
      priority: "balanced",
      include_food: false,
      diet: "不限",
      max_visits: 4,
    },
    places: [fixture_place("a", 0, 180)],
  })
  assert_eq(p.days[0].stops.length(), 0)
  assert_eq(p.exclusions.length(), 1)
}

///|
test "wait for opening and respect exact closing boundary" {
  let a = fixture_place("a", 0, 90)
  let p = checked({
    request: fixture_request(),
    places: [{ ..a, open: 900, close: 990, }],
  })
  assert_eq(p.days[0].stops[0].start, 900)
  assert_eq(p.days[0].stops[0].end, 990)
}

///|
test "short opening window cannot fit a visit" {
  let a = fixture_place("a", 0, 90)
  let p = checked({
    request: fixture_request(),
    places: [{ ..a, close: 600, }],
  })
  assert_eq(p.days[0].stops.length(), 0)
}

///|
test "ties are stable across catalogue ordering" {
  let a = fixture_place("a", 0, 60)
  let b = fixture_place("b", 0, 60)
  let r = fixture_request()
  assert_eq(
    checked({ request: r, places: [b, a], }).days[0].stops[0].place.id,
    "a",
  )
  assert_eq(
    checked({ request: r, places: [a, b], }).days[0].stops[0].place.id,
    "a",
  )
}

///|
test "duplicate interests cannot inflate preference scores" {
  let p = fixture_place("a", 0, 60)
  let (one, _) = score(p, fixture_request())
  let (two, _) = score(p, {
    ..fixture_request(),
    interests: ["文化", "文化"],
  })
  assert_eq(one, two)
}

///|
test "zero budget selects free activities only" {
  let p = checked({
    request: { ..fixture_request(), days: 1, budget: 0, },
    places: [
      fixture_place("a", 0, 60),
      fixture_place("b", 0, 60),
      fixture_place("c", 10, 60),
    ],
  })
  assert_eq(p.total_cost, 0)
  assert_eq(p.days[0].stops.length(), 1)
}

///|
test "unknown city gives empty plan with exclusions" {
  let p = checked({
    request: { ..fixture_request(), city: "其他城", },
    places: [fixture_place("a", 0, 60)],
  })
  assert_eq(p.days[0].stops.length(), 0)
  assert_eq(p.exclusions[0].reason, "不在目标城市")
}

///|
test "invariants over 168 combinations of budgets days and durations" {
  for budget in [0, 8, 20, 50, 100, 300, 1000] {
    for days in [1, 2, 3, 7] {
      for duration in [1, 60, 90, 120, 180, 480] {
        let r = { ..fixture_request(), budget, days, }
        let places = [
          fixture_place("a", 0, duration),
          fixture_place("b", 20, duration),
          { ..fixture_place("c", 10, duration), district: "城西", open: 700, },
        ]
        let p = checked({ request: r, places, })
        assert_true(p.total_cost <= budget)
        let ids : Map[String, Bool] = Map([])
        let mut sum = 0
        for day in p.days {
          let mut last_end = r.start
          let mut previous : Place? = None
          for stop in day.stops {
            assert_true(!ids.contains(stop.place.id))
            ids[stop.place.id] = true
            let (minutes, fare) = transfer(previous, stop.place)
            let rest = if previous is Some(_) { 20 } else { 0 }
            assert_true(stop.start >= last_end + minutes + rest)
            assert_true(stop.start >= stop.place.open)
            assert_true(stop.end <= stop.place.close && stop.end <= r.end)
            assert_eq(stop.end - stop.start, stop.place.duration)
            assert_eq(stop.transfer_cost, fare)
            sum += stop.place.cost + fare
            last_end = stop.end
            previous = Some(stop.place)
          }
        }
        assert_eq(sum, p.total_cost)
        assert_eq(p.remaining_budget, budget - sum)
      }
    }
  }
}

///|
test "selected sights are mandatory and preserve chosen order" {
  let r = { ..fixture_request(), must_visit: ["b", "a"], }
  let p = checked({
    request: r,
    places: [fixture_place("a", 0, 60), fixture_place("b", 20, 60)],
  })
  assert_eq(p.days[0].stops[0].place.id, "b")
  assert_eq(p.days[0].stops[1].place.id, "a")
}

///|
test "impossible selected sight reports conflict instead of dropping it" {
  let input = {
    request: { ..fixture_request(), budget: 0, must_visit: ["a"], },
    places: [fixture_place("a", 20, 60)],
  }
  assert_true(plan(input) is Err(_))
}

///|
test "selection conflict and missing IDs rejected" {
  let p = fixture_place("a", 0, 60)
  let r = fixture_request()
  assert_true(
    !validate({ request: { ..r, must_visit: ["missing"], }, places: [p], }).is_empty(),
  )
  assert_true(
    !validate({
      request: { ..r, must_visit: ["a"], avoid: ["a"], },
      places: [p],
    }).is_empty(),
  )
}

///|
test "excluded sights never appear" {
  let p = checked({
    request: { ..fixture_request(), avoid: ["a"], },
    places: [fixture_place("a", 0, 60)],
  })
  assert_eq(p.days[0].stops.length(), 0)
}

///|
test "restaurant obeys diet window and is included in budget" {
  let food = {
    ..fixture_place("food", 40, 60),
    kind: "food",
    tags: ["素食"],
    open: 660,
    close: 840,
  }
  let r = {
    ..fixture_request(),
    include_food: true,
    diet: "素食",
    must_visit: ["food"],
  }
  let p = checked({ request: r, places: [food], })
  assert_eq(p.total_cost, 40)
  assert_eq(p.days[0].stops[0].start, 660)
  assert_true(
    plan({ request: { ..r, diet: "不辣", }, places: [food], }) is Err(_),
  )
}

///|
test "daily visit cap leaves time for a meal" {
  let places = [
    fixture_place("a", 0, 60),
    fixture_place("b", 0, 60),
    { ..fixture_place("food", 30, 60), kind: "food", open: 660, close: 840, },
  ]
  let p = checked({
    request: {
      ..fixture_request(),
      days: 1,
      max_visits: 1,
      include_food: true,
    },
    places,
  })
  assert_eq(p.days[0].stops.length(), 2)
}

///|
test "reject unsafe source URL" {
  let p = { ..fixture_place("a", 0, 60), url: "javascript:alert(1)", }
  assert_true(
    !validate({ request: fixture_request(), places: [p], }).is_empty(),
  )
}

///|
test "different branch IDs cannot repeat a restaurant across days" {
  let r = { ..fixture_request(), include_food: true, days: 3, }
  let a = {
    ..fixture_place("a", 10, 60),
    kind: "food",
    name: "杭帮菜馆(西湖店)",
  }
  let b = { ..a, id: "b", name: "杭帮菜馆（城东店）", }
  let c = { ..a, id: "c", name: "另一家菜馆", }
  let result = checked({ request: r, places: [a, b, c], })
  let mut meals = 0
  for day in result.days {
    meals += day.stops.length()
  }
  assert_eq(meals, 2)
}

///|
test "brand punctuation and cuisine suffix variants share identity" {
  assert_eq(
    restaurant_identity("天津", "老天津·天津菜(鼓楼店)"),
    restaurant_identity("天津", "老天津天津菜（和平店）"),
  )
  assert_eq(
    restaurant_identity("杭州", "外婆家·杭帮菜【西湖店】"),
    restaurant_identity("杭州", "外婆家(城东店)"),
  )
  assert_true(
    restaurant_identity("天津", "老天津·天津菜(鼓楼店)") !=
    restaurant_identity("天津", "老津门天津菜"),
  )
  assert_true(
    restaurant_identity("杭州", "川菜小馆") !=
    restaurant_identity("杭州", "湘菜小馆"),
  )
}

///|
test "similar short brands are alternatives rather than repeated meals" {
  assert_true(
    restaurants_similar(
      "天津", "老天津·天津菜(鼓楼店)", "天津", "老津门天津菜",
    ),
  )
  assert_false(
    restaurants_similar("天津", "老天津", "天津", "老北京"),
  )
  assert_false(
    restaurants_similar("天津", "老天津", "成都", "老天津"),
  )
  let r = { ..fixture_request(), include_food: true, days: 3, }
  let a = {
    ..fixture_place("a", 10, 60),
    kind: "food",
    name: "老天津·天津菜(鼓楼店)",
  }
  let b = { ..a, id: "b", name: "老津门天津菜", }
  let c = { ..a, id: "c", name: "另一家菜馆", }
  let result = checked({ request: r, places: [a, b, c], })
  let mut meals = 0
  for day in result.days {
    meals += day.stops.length()
  }
  assert_eq(meals, 2)
}
