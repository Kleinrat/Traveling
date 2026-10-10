///|
/// Host boundary: parse, validate and return structured failures without throwing.
pub fn plan_json(text : String) -> String {
  let input : @engine.Input = @json.from_json(@json.parse(text)) catch {
    _ =>
      return (
        {
          "ok": false,
          "errors": [
            "输入不是有效的行程 JSON，或字段类型不正确",
          ],
        } : Json).stringify()
  }
  let response : Json = match @engine.plan(input) {
    Ok(plan) => { "ok": true, "plan": @json.to_json(plan) }
    Err(errors) => { "ok": false, "errors": @json.to_json(errors) }
  }
  response.stringify()
}

///|
pub fn catalogue_json() -> String {
  @json.to_json(@demo.catalogue()).stringify()
}

///|
pub fn assistant_system() -> String {
  @assistant.system_prompt()
}

///|
pub fn assistant_context(current : String, message : String) -> String {
  @assistant.user_context(current, message)
}

///|
pub fn validate_proposal(text : String) -> String {
  @assistant.validate_proposal(text)
}
