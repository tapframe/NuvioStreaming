import SwiftUI

private let cachedScheme: String? = {
  guard
    let urlTypes = Bundle.main.infoDictionary?["CFBundleURLTypes"] as? [[String: Any]],
    let schemes = urlTypes.first?["CFBundleURLSchemes"] as? [String],
    let firstScheme = schemes.first
  else {
    return nil
  }

  return firstScheme
}()

extension View {
  @ViewBuilder
  func applyWidgetURL(from urlString: String?) -> some View {
    applyIfPresent(urlString) { view, string in
      applyIfPresent(cachedScheme) { view, scheme in
        view.widgetURL(URL(string: scheme + "://" + string))
      }
    }
  }
}
