import Foundation

struct AddonTransport {
    static func resourceURL(
        baseURL: String,
        resource: String,
        type: String,
        id: String,
        extra: [String] = []
    ) throws -> URL {
        guard var components = URLComponents(string: baseURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = components.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              components.host != nil else {
            throw StremioServiceError.invalidURL
        }
        let query = components.percentEncodedQuery
        components.percentEncodedQuery = nil
        components.fragment = nil
        var path = components.percentEncodedPath
        if path.hasSuffix("/manifest.json") {
            path.removeLast("/manifest.json".count)
        }
        while path.count > 1 && path.hasSuffix("/") { path.removeLast() }
        let segments = [resource, type, id].map(encodePathSegment)
        path += "/" + segments.joined(separator: "/")
        if !extra.isEmpty { path += "/" + extra.joined(separator: "&") }
        path += ".json"
        components.percentEncodedPath = path
        components.percentEncodedQuery = query
        guard let result = components.url else { throw StremioServiceError.invalidURL }
        return result
    }

    static func catalogURL(
        baseURL: String,
        type: String,
        id: String,
        genre: String? = nil,
        search: String? = nil,
        skip: Int? = nil
    ) throws -> URL {
        var extra: [String] = []
        if let search = search?.trimmedNonEmpty {
            extra.append("search=\(encodePathSegment(search))")
        }
        if let genre = genre?.trimmedNonEmpty {
            extra.append("genre=\(encodePathSegment(genre))")
        }
        if let skip, skip > 0 { extra.append("skip=\(skip)") }
        return try resourceURL(baseURL: baseURL, resource: "catalog", type: type, id: id, extra: extra)
    }

    static func encodePathSegment(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.formUnion(CharacterSet(charactersIn: "-._~"))
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}

extension String {
    var trimmedNonEmpty: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
