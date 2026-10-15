///|
/// ISO weekday: Monday=1, Sunday=7. Holidays never override weekly closure.
pub fn available_on(p : Place, r : Request, day : Int32) -> Bool {
  let closed = p.closed_weekdays.unwrap_or([])
  if closed.is_empty() {
    return true
  }
  match r.start_weekday {
    Some(start) => !closed.contains((start + day - 2) % 7 + 1)
    None => false
  }
}

///|
fn available_during_trip(p : Place, r : Request) -> Bool {
  for day in 1..<(r.days + 1) {
    if available_on(p, r, day) {
      return true
    }
  }
  false
}
