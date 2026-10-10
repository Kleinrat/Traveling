///|
test "reject malformed provider output" {
  assert_true(@json.parse(validate_proposal("not json")) is { "ok": false, .. })
}

///|
test "reject out of range extracted fields" {
  let request : @engine.Request = {
    city: "杭州",
    days: 99,
    budget: 100,
    start: 540,
    end: 1020,
    interests: [],
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
  assert_true(
    @json.parse(validate_proposal(@json.to_json(request).stringify()))
    is { "ok": false, .. },
  )
}

///|
test "accept complete valid extraction" {
  let request : @engine.Request = {
    city: "杭州",
    days: 2,
    budget: 100,
    start: 540,
    end: 1020,
    interests: ["文化"],
    family: true,
    rain: true,
    relaxed: true,
    must_visit: [],
    avoid: [],
    priority: "balanced",
    include_food: false,
    diet: "不限",
    max_visits: 4,
  }
  assert_true(
    @json.parse(validate_proposal(@json.to_json(request).stringify()))
    is { "ok": true, .. },
  )
}

///|
test "assistant cannot change chosen places" {
  let original : @engine.Request = {
    city: "杭州",
    days: 2,
    budget: 100,
    start: 540,
    end: 1020,
    interests: ["文化"],
    family: false,
    rain: false,
    relaxed: false,
    must_visit: ["a"],
    avoid: [],
    priority: "balanced",
    include_food: true,
    diet: "不限",
    max_visits: 3,
  }
  let changed = { ..original, must_visit: ["b"], }
  assert_true(
    @json.parse(
      validate_for_current(
        @json.to_json(changed).stringify(),
        @json.to_json(original).stringify(),
      ),
    )
    is { "ok": false, .. },
  )
  assert_true(
    @json.parse(
      validate_for_current(
        @json.to_json(original).stringify(),
        @json.to_json(original).stringify(),
      ),
    )
    is { "ok": true, .. },
  )
}
