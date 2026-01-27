import SwiftUI
import UIKit

extension Image {
  static func dynamic(assetNameOrPath: String) -> Self {
    if let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.expoLiveActivity.sharedData"
    ) {
      let contentsOfFile = container.appendingPathComponent(assetNameOrPath).path

      if let uiImage = UIImage(contentsOfFile: contentsOfFile) {
        return Image(uiImage: uiImage)
      }
    }

    return Image(assetNameOrPath)
  }
}

extension UIImage {
  /// Attempts to load a UIImage either from the shared app group container or the main bundle.
  static func dynamic(assetNameOrPath: String) -> UIImage? {
    if let container = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: "group.expoLiveActivity.sharedData"
    ) {
      let contentsOfFile = container.appendingPathComponent(assetNameOrPath).path
      if let uiImage = UIImage(contentsOfFile: contentsOfFile) {
        return uiImage
      }
    }
    return UIImage(named: assetNameOrPath)
  }
}
