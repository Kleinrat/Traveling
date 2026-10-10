///| Hard eligibility rules are kept separate from soft preference scores.
pub fn exclusion_reason(p : Place, r : Request) -> String? {
  if p.city != r.city { return Some("不在目标城市") }
  if r.rain && !p.indoor { return Some("雨天只安排室内景点") }
  if r.family && !p.family { return Some("未标注为亲子适合") }
  if r.relaxed && p.duration > 120 { return Some("慢节奏模式单次游览不超过 120 分钟") }
  None
}

///| Duplicate interests do not increase the score.
pub fn score(p : Place, r : Request) -> (Int, Array[String]) {
  let reasons : Array[String] = []
  let seen : Map[String, Bool] = Map([])
  let mut value = 10
  for tag in r.interests {
    if !seen.contains(tag) && p.tags.contains(tag) {
      value += 30
      reasons.push("匹配兴趣：\{tag}（+30）")
    }
    seen[tag] = true
  }
  if p.cost == 0 {
    value += 12
    reasons.push("免费活动（+12）")
  } else if p.cost <= 50 {
    value += 6
    reasons.push("门票费用不超过 50 元（+6）")
  }
  if r.family && p.family {
    value += 15
    reasons.push("符合亲子条件（+15）")
  }
  if r.rain && p.indoor {
    value += 15
    reasons.push("符合雨天室内条件（+15）")
  }
  reasons.push("基础分 10；开放时间和预算另作硬约束校验")
  (value, reasons)
}

///| Estimates, not map routing. Zero for the first stop of each day.
pub fn transfer(previous : Place?, next : Place) -> (Int, Int) {
  match previous {
    None => (0, 0)
    Some(p) => if p.district == next.district { (15, 8) } else { (35, 15) }
  }
}
