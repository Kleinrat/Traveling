test "malformed JSON returns error envelope" {
  let value = @json.parse(plan_json("oops"))
  assert_true(value is { "ok": false, .. })
}
test "wrong field type returns error envelope" {
  let value = @json.parse(plan_json("{\"request\":42,\"places\":[]}"))
  assert_true(value is { "ok": false, .. })
}
test "demo input passes JSON round trip" {
  let value = @json.parse(plan_json(@json.to_json(@demo.sample()).stringify()))
  assert_true(value is { "ok": true, .. })
}
