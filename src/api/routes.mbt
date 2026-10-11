///|
priv struct Point {
  id : String
  longitude : Double
  latitude : Double
} derive(ToJson, @json.FromJson)

///|
priv struct RouteQuery {
  city : String
  mode : String
  origin : Point
  destination : Point
} derive(ToJson, @json.FromJson)

///|
pub fn route_query_json(text : String) -> String {
  let q : RouteQuery = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["路线查询格式无效"] } : Json).stringify()
  }
  if !["walking", "transit"].contains(q.mode) ||
    !seed_cities().any(c => c.city == q.city) ||
    q.origin.id == "" ||
    q.destination.id == "" {
    return ({ "ok": false, "errors": ["城市或交通方式无效"] } : Json).stringify()
  }
  for p in [q.origin, q.destination] {
    if !(p.longitude >= 73.0 &&
      p.longitude <= 136.0 &&
      p.latitude >= 3.0 &&
      p.latitude <= 54.0) {
      return (
        { "ok": false, "errors": ["地点缺少有效 GCJ-02 坐标"] } : Json).stringify()
    }
  }
  ({ "ok": true, "query": @json.to_json(q) } : Json).stringify()
}

///|
priv struct ProviderRoute {
  from_id : String
  to_id : String
  mode : String
  seconds : Int
  distance : Int
  cost : Int
  fetched_at : String
} derive(@json.FromJson)

///|
pub fn route_result_json(text : String) -> String {
  let raw : ProviderRoute = @json.from_json(@json.parse(text)) catch {
    _ =>
      return (
        { "ok": false, "errors": ["高德路线返回资料无效"] } : Json).stringify()
  }
  if raw.seconds < 0 || raw.seconds > 86400 {
    return ({ "ok": false, "errors": ["路线时间超出范围"] } : Json).stringify()
  }
  let route : @engine.Route = {
    from_id: raw.from_id,
    to_id: raw.to_id,
    mode: raw.mode,
    minutes: (raw.seconds + 59) / 60,
    distance: raw.distance,
    cost: raw.cost,
    fetched_at: raw.fetched_at,
    source: "高德路线规划",
  }
  let errors = @engine.validate_routing({
    ..@engine.default_routing(),
    routes: [route],
  })
  if !errors.is_empty() {
    return ({ "ok": false, "errors": @json.to_json(errors) } : Json).stringify()
  }
  ({ "ok": true, "route": @json.to_json(route) } : Json).stringify()
}

///|
priv struct RouteOption {
  id : String
  route : @engine.Route
  walking_distance : Int?
  transfers : Int?
  summary : String
} derive(ToJson, @json.FromJson)

///|
pub fn route_options_json(text : String) -> String {
  let options : Array[RouteOption] = @json.from_json(@json.parse(text)) catch {
    _ =>
      return ({ "ok": false, "errors": ["交通候选格式无效"] } : Json).stringify()
  }
  if options.is_empty() || options.length() > 6 {
    return ({ "ok": false, "errors": ["交通候选数量无效"] } : Json).stringify()
  }
  let seen : Map[String, Bool] = Map([])
  for o in options {
    let errors = @engine.validate_routing({
      ..@engine.default_routing(),
      routes: [o.route],
    })
    if !errors.is_empty() ||
      o.id == "" ||
      o.id.length() > 100 ||
      seen.contains(o.id) ||
      o.summary.length() > 300 ||
      (o.walking_distance is Some(n) && (n < 0 || n > 1000000)) ||
      (o.transfers is Some(n) && (n < 0 || n > 50)) ||
      (o.route.mode == "walking" && o.transfers != Some(0)) {
      return (
        { "ok": false, "errors": ["交通候选资料无效或重复"] } : Json).stringify()
    }
    seen[o.id] = true
  }
  (
    {
      "ok": true,
      "route": @json.to_json(options[0].route),
      "options": @json.to_json(options),
    } : Json).stringify()
}
