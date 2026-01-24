import SwiftUI

func resizableImage(imageName: String) -> some View {
  Image.dynamic(assetNameOrPath: imageName)
    .resizable()
    .scaledToFit()
}

func resizableImage(imageName: String, height: CGFloat?, width: CGFloat?) -> some View {
  resizableImage(imageName: imageName)
    .frame(width: width, height: height)
}

private struct ContainerSizeKey: PreferenceKey {
  static var defaultValue: CGSize?
  static func reduce(value: inout CGSize?, nextValue: () -> CGSize?) {
    value = nextValue() ?? value
  }
}

extension View {
  func captureContainerSize() -> some View {
    background(
      GeometryReader { proxy in
        Color.clear.preference(key: ContainerSizeKey.self, value: proxy.size)
      }
    )
  }

  func onContainerSize(_ perform: @escaping (CGSize?) -> Void) -> some View {
    onPreferenceChange(ContainerSizeKey.self, perform: perform)
  }
}
