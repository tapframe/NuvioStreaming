import SwiftUI

extension Color {
  init(hex: String) {
    var cString: String = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()

    if cString.hasPrefix("#") {
      cString.remove(at: cString.startIndex)
    }

    if (cString.count) != 6, (cString.count) != 8 {
      self.init(.white)
      return
    }

    var rgbValue: UInt64 = 0
    Scanner(string: cString).scanHexInt64(&rgbValue)

    if (cString.count) == 8 {
      self.init(
        .sRGB,
        red: Double((rgbValue >> 24) & 0xFF) / 255,
        green: Double((rgbValue >> 16) & 0xFF) / 255,
        blue: Double((rgbValue >> 08) & 0xFF) / 255,
        opacity: Double((rgbValue >> 00) & 0xFF) / 255
      )
    } else {
      self.init(
        .sRGB,
        red: Double((rgbValue >> 16) & 0xFF) / 255,
        green: Double((rgbValue >> 08) & 0xFF) / 255,
        blue: Double((rgbValue >> 00) & 0xFF) / 255,
        opacity: 1
      )
    }
  }
}
