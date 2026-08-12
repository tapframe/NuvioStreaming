import Foundation

struct AddonManifest: Codable, Hashable {
    let id: String
    let name: String
    let description: String?
    let version: String?
    let resources: [ManifestResource]
    let catalogs: [AddonCatalog]
    let types: [String]
    let idPrefixes: [String]
    let logoURL: String?

    private enum CodingKeys: String, CodingKey {
        case id, name, description, version, resources, catalogs, types, idPrefixes
        case logoURL = "logo"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeRequiredFlexibleString(forKey: .id)
        name = try container.decodeRequiredFlexibleString(forKey: .name)
        description = container.decodeFlexibleString(forKey: .description)
        version = container.decodeFlexibleString(forKey: .version)
        resources = container.decodeLossyArray(ManifestResource.self, forKey: .resources)
        catalogs = container.decodeLossyArray(AddonCatalog.self, forKey: .catalogs)
        types = (try? container.decode([String].self, forKey: .types)) ?? []
        idPrefixes = (try? container.decode([String].self, forKey: .idPrefixes)) ?? []
        logoURL = container.decodeFlexibleString(forKey: .logoURL)
    }

    var providesStreams: Bool {
        resources.contains { $0.name == "stream" }
    }
}

struct ManifestResource: Codable, Hashable {
    let name: String
    let types: [String]
    let idPrefixes: [String]

    private enum CodingKeys: String, CodingKey { case name, types, idPrefixes }

    init(from decoder: Decoder) throws {
        if let value = try? decoder.singleValueContainer().decode(String.self) {
            name = value
            types = []
            idPrefixes = []
            return
        }
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = container.decodeFlexibleString(forKey: .name) ?? "unknown"
        types = (try? container.decode([String].self, forKey: .types)) ?? []
        idPrefixes = (try? container.decode([String].self, forKey: .idPrefixes)) ?? []
    }
}

struct AddonCatalog: Codable, Hashable {
    let type: String
    let id: String
    let name: String
    let extra: [AddonExtra]

    private enum CodingKeys: String, CodingKey { case type, id, name, extra }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decodeRequiredFlexibleString(forKey: .type)
        id = try container.decodeRequiredFlexibleString(forKey: .id)
        name = try container.decodeRequiredFlexibleString(forKey: .name)
        extra = container.decodeLossyArray(AddonExtra.self, forKey: .extra)
    }
}

struct AddonExtra: Codable, Hashable {
    let name: String
    let isRequired: Bool
    let options: [String]

    private enum CodingKeys: String, CodingKey { case name, isRequired, options }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = container.decodeFlexibleString(forKey: .name) ?? ""
        isRequired = (try? container.decode(Bool.self, forKey: .isRequired)) ?? false
        options = (try? container.decode([String].self, forKey: .options)) ?? []
    }
}
