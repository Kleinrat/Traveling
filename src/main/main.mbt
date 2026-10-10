fn main {
  match @engine.plan(@demo.sample()) {
    Ok(plan) => println(@json.to_json(plan).stringify())
    Err(errors) => println(@json.to_json(errors).stringify())
  }
}
