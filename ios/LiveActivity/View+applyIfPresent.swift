import SwiftUI

extension View {
  @ViewBuilder
  func applyIfPresent<T>(_ value: T?, transform: (Self, T) -> some View) -> some View {
    if let value {
      transform(self, value)
    } else {
      self
    }
  }
}
