///|
test "malformed JSON returns error envelope" {
  let value = @json.parse(plan_json("oops"))
  assert_true(value is { "ok": false, .. })
}

///|
test "wrong field type returns error envelope" {
  let value = @json.parse(plan_json("{\"request\":42,\"places\":[]}"))
  assert_true(value is { "ok": false, .. })
}

///|
test "demo input passes JSON round trip" {
  let value = @json.parse(plan_json(@json.to_json(@demo.sample()).stringify()))
  assert_true(value is { "ok": true, .. })
}

///|
test "city query rejects unknown cities and categories" {
  assert_true(
    @json.parse(place_query_json("{\"city\":\"杭州\",\"kind\":\"food\"}"))
    is { "ok": true, "code": "330100", "types": "050000", .. },
  )
  assert_true(
    @json.parse(place_query_json("{\"city\":\"不存在\",\"kind\":\"food\"}"))
    is { "ok": false, .. },
  )
  assert_true(
    @json.parse(place_query_json("{\"city\":\"杭州\",\"kind\":\"hotel\"}"))
    is { "ok": false, .. },
  )
}

///|
test "pending data deduplicates without inventing prices or opening times" {
  let p : Json = {
    "id": "amap-test",
    "name": "测试地点",
    "city": "杭州",
    "district": "测试区",
    "address": "测试地址",
    "location": "120,30",
    "kind": "sight",
    "cost_hint": "",
    "open_hint": "",
    "fetched_at": "2026-10-11",
    "url": "https://www.amap.com/place/test",
  }
  let result = @json.parse(pending_places_json(Json::array([p, p]).stringify()))
  assert_true(
    result
    is {
      "ok": true,
      "status": "待核对",
      "items": [{ "cost_hint": "", "open_hint": "", .. }],
      ..
    },
  )
  assert_true(@json.parse(pending_places_json("[{}]")) is { "ok": false, .. })
}
