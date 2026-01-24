import SwiftUI

extension Date {
  static func toTimerInterval(miliseconds: Double) -> ClosedRange<Self> {
    now ... max(now, Date(timeIntervalSince1970: miliseconds / 1000))
  }
}
