import Foundation

extension NuvioAccountService {
    func saveLibraryItem(
        _ item: MetaSummary,
        accessToken: String,
        profileID: Int
    ) async throws {
        try await requestVoid(
            path: "/rest/v1/rpc/sync_push_library_items",
            jsonBody: [
                "p_profile_id": profileID,
                "p_items": [item.libraryJSONObject],
                "p_origin_client_id": TVSyncClientIdentity.current(),
            ],
            accessToken: accessToken
        )
    }

    func deleteLibraryItem(
        _ item: MetaSummary,
        accessToken: String,
        profileID: Int
    ) async throws {
        try await requestVoid(
            path: "/rest/v1/rpc/sync_delete_library_items",
            jsonBody: [
                "p_profile_id": profileID,
                "p_keys": [["content_id": item.id, "content_type": item.type]],
                "p_origin_client_id": TVSyncClientIdentity.current(),
            ],
            accessToken: accessToken
        )
    }
}
