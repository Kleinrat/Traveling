fn fixture_request() -> Request {
  { city: "测试城", days: 2, budget: 100, start: 540, end: 1020,
    interests: ["文化"], family: false, rain: false, relaxed: false }
}
fn fixture_place(id : String, cost : Int, duration : Int) -> Place {
  { id, name: id, city: "测试城", district: "中心", tags: ["文化"], cost,
    duration, open: 540, close: 1020, indoor: true, family: true, source: "原创测试数据" }
}
fn checked(input : Input) -> Plan {
  match plan(input) {
    Ok(result) => result
    Err(_) => abort("unexpected invalid fixture")
  }
}
test "invalid ranges are rejected" {
  let r = fixture_request()
  for budget in [-1, 100001] {
    assert_true(!validate({ request: { ..r, budget }, places: [] }).is_empty())
  }
  for days in [0, 8] {
    assert_true(!validate({ request: { ..r, days }, places: [] }).is_empty())
  }
  for (start, end) in [(-1, 1020), (540, 1441), (600, 600), (800, 600)] {
    assert_true(!validate({ request: { ..r, start, end }, places: [] }).is_empty())
  }
}
test "duplicate IDs and malformed catalogue fail before scheduling" {
  let p = fixture_place("a", 0, 90)
  let r = fixture_request()
  assert_true(!validate({ request: r, places: [p, p] }).is_empty())
  for bad in [{ ..p, cost: -1 }, { ..p, duration: 0 }, { ..p, open: 1020, close: 540 }, { ..p, source: "" }] {
    assert_true(!validate({ request: r, places: [bad] }).is_empty())
  }
}
test "budget includes local transfer fare" {
  let p = checked({ request: { ..fixture_request(), budget: 20 },
    places: [fixture_place("a", 10, 60), fixture_place("b", 10, 60)] })
  assert_eq(p.total_cost, 20)
  assert_eq(p.days[0].stops.length(), 1)
  assert_eq(p.days[1].stops.length(), 1)
}
test "same day transfer cannot exceed the budget" {
  let p = checked({ request: { ..fixture_request(), days: 1, budget: 20 },
    places: [fixture_place("a", 10, 60), fixture_place("b", 10, 60)] })
  assert_eq(p.total_cost, 10)
  assert_eq(p.exclusions.length(), 1)
}
test "rain and family are hard filters" {
  let a = fixture_place("a", 0, 60)
  let p = checked({ request: { ..fixture_request(), rain: true, family: true },
    places: [a, { ..a, id: "b", indoor: false }, { ..a, id: "c", family: false }] })
  assert_eq(p.exclusions.length(), 2)
  assert_eq(p.days[0].stops[0].place.id, "a")
}
test "relaxed mode rejects long activities" {
  let p = checked({ request: { ..fixture_request(), relaxed: true }, places: [fixture_place("a", 0, 180)] })
  assert_eq(p.days[0].stops.length(), 0)
  assert_eq(p.exclusions.length(), 1)
}
test "wait for opening and respect exact closing boundary" {
  let a = fixture_place("a", 0, 90)
  let p = checked({ request: fixture_request(), places: [{ ..a, open: 900, close: 990 }] })
  assert_eq(p.days[0].stops[0].start, 900)
  assert_eq(p.days[0].stops[0].end, 990)
}
test "short opening window cannot fit a visit" {
  let a = fixture_place("a", 0, 90)
  let p = checked({ request: fixture_request(), places: [{ ..a, close: 600 }] })
  assert_eq(p.days[0].stops.length(), 0)
}
test "ties are stable across catalogue ordering" {
  let a = fixture_place("a", 0, 60)
  let b = fixture_place("b", 0, 60)
  let r = fixture_request()
  assert_eq(checked({ request: r, places: [b, a] }).days[0].stops[0].place.id, "a")
  assert_eq(checked({ request: r, places: [a, b] }).days[0].stops[0].place.id, "a")
}
test "duplicate interests cannot inflate preference scores" {
  let p = fixture_place("a", 0, 60)
  let (one, _) = score(p, fixture_request())
  let (two, _) = score(p, { ..fixture_request(), interests: ["文化", "文化"] })
  assert_eq(one, two)
}
test "zero budget selects free activities only" {
  let p = checked({ request: { ..fixture_request(), days: 1, budget: 0 },
    places: [fixture_place("a", 0, 60), fixture_place("b", 0, 60), fixture_place("c", 10, 60)] })
  assert_eq(p.total_cost, 0)
  assert_eq(p.days[0].stops.length(), 1)
}
test "unknown city gives empty plan with exclusions" {
  let p = checked({ request: { ..fixture_request(), city: "其他城" }, places: [fixture_place("a", 0, 60)] })
  assert_eq(p.days[0].stops.length(), 0)
  assert_eq(p.exclusions[0].reason, "不在目标城市")
}
test "invariants over 168 combinations of budgets days and durations" {
  for budget in [0, 8, 20, 50, 100, 300, 1000] {
    for days in [1, 2, 3, 7] {
      for duration in [1, 60, 90, 120, 180, 480] {
        let r = { ..fixture_request(), budget, days }
        let places = [fixture_place("a", 0, duration), fixture_place("b", 20, duration),
          { ..fixture_place("c", 10, duration), district: "城西", open: 700 }]
        let p = checked({ request: r, places })
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
