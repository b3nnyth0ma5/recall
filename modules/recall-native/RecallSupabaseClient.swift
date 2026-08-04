import Foundation

enum RecallSupabaseClient {

    private static var supabaseURL: String {
        Bundle.main.infoDictionary?["SupabaseURL"] as? String ?? ""
    }
    private static var anonKey: String {
        Bundle.main.infoDictionary?["SupabaseAnonKey"] as? String ?? ""
    }

    // MARK: - Auth token helpers

    static func readAccessToken() -> String? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.b3nny1nc.recall"
        ) else {
            print("[RecallSupabaseClient] readAccessToken — containerURL is nil (App Group entitlement missing?)")
            return nil
        }
        print("[RecallSupabaseClient] readAccessToken — containerURL resolved: \(containerURL.path)")

        let tokenURL = containerURL.appendingPathComponent("auth-token.json")
        let tokenPath = tokenURL.path
        let fileExists = FileManager.default.fileExists(atPath: tokenPath)
        print("[RecallSupabaseClient] readAccessToken — auth-token.json exists: \(fileExists) at \(tokenPath)")

        guard fileExists else {
            print("[RecallSupabaseClient] readAccessToken — file not found")
            return nil
        }

        var fileSize = 0
        if let attrs = try? FileManager.default.attributesOfItem(atPath: tokenPath) {
            fileSize = (attrs[.size] as? Int) ?? 0
        }
        print("[RecallSupabaseClient] readAccessToken — file size: \(fileSize) bytes")

        guard let data = try? Data(contentsOf: tokenURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[RecallSupabaseClient] readAccessToken — failed to read/parse JSON")
            return nil
        }

        let rawExpiresAt = json["expires_at"]
        print("[RecallSupabaseClient] readAccessToken — raw expires_at value: \(String(describing: rawExpiresAt))")

        guard let token = json["access_token"] as? String else {
            print("[RecallSupabaseClient] readAccessToken — access_token field missing or wrong type")
            return nil
        }
        print("[RecallSupabaseClient] readAccessToken — successfully read access token")
        return token
    }

    /// Reads all four fields from auth-token.json. Returns nil if file is missing or any required field is absent.
    static func readFullTokenData() -> (accessToken: String, refreshToken: String, userId: String, expiresAt: Double)? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.b3nny1nc.recall"
        ) else {
            print("[RecallSupabaseClient] readFullTokenData — containerURL is nil")
            return nil
        }

        let tokenURL = containerURL.appendingPathComponent("auth-token.json")
        guard FileManager.default.fileExists(atPath: tokenURL.path) else {
            print("[RecallSupabaseClient] readFullTokenData — auth-token.json not found")
            return nil
        }

        guard let data = try? Data(contentsOf: tokenURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            print("[RecallSupabaseClient] readFullTokenData — failed to read/parse JSON")
            return nil
        }

        guard let accessToken = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String,
              let userId = json["user_id"] as? String else {
            print("[RecallSupabaseClient] readFullTokenData — required fields missing (access_token/refresh_token/user_id)")
            return nil
        }

        let expiresAt = (json["expires_at"] as? Double) ?? 0
        print("[RecallSupabaseClient] readFullTokenData — read OK, userId=\(userId), expiresAt=\(expiresAt)")
        return (accessToken: accessToken, refreshToken: refreshToken, userId: userId, expiresAt: expiresAt)
    }

    /// Returns true if auth-token.json exists in the App Group container.
    static func hasTokenFile() -> Bool {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.b3nny1nc.recall"
        ) else { return false }
        return FileManager.default.fileExists(atPath: containerURL.appendingPathComponent("auth-token.json").path)
    }

    /// POSTs to Supabase token refresh endpoint, writes the updated token back to the App Group,
    /// and returns the new access token. Returns nil on any failure.
    static func refreshAccessToken(refreshToken: String) async -> String? {
        print("[RecallSupabaseClient] refreshAccessToken — starting refresh")

        let urlString = "\(supabaseURL)/auth/v1/token?grant_type=refresh_token"
        guard let url = URL(string: urlString) else {
            print("[RecallSupabaseClient] refreshAccessToken — invalid URL: \(urlString)")
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.timeoutInterval = 15

        let body = ["refresh_token": refreshToken]
        guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
            print("[RecallSupabaseClient] refreshAccessToken — failed to serialize request body")
            return nil
        }
        request.httpBody = httpBody

        print("[RecallSupabaseClient] refreshAccessToken — POST \(urlString)")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            print("[RecallSupabaseClient] refreshAccessToken — network error: \(error.localizedDescription)")
            return nil
        }

        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
        print("[RecallSupabaseClient] refreshAccessToken — HTTP \(statusCode)")

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let newAccessToken = json["access_token"] as? String else {
            let bodySnippet = String(data: data, encoding: .utf8).map { String($0.prefix(300)) } ?? "<non-utf8>"
            print("[RecallSupabaseClient] refreshAccessToken — failed to parse response. body: \(bodySnippet)")
            return nil
        }

        let newExpiresAt = (json["expires_at"] as? Double) ?? 0
        let newRefreshToken = (json["refresh_token"] as? String) ?? refreshToken
        print("[RecallSupabaseClient] refreshAccessToken — new token received, expiresAt=\(newExpiresAt)")

        // Read the original userId (not in the refresh response) so we can write it back
        guard let originalData = readFullTokenData() else {
            print("[RecallSupabaseClient] refreshAccessToken — could not read original token data to get userId; aborting write-back")
            return nil
        }
        let userId = originalData.userId

        // Write updated token back to App Group using NSFileCoordinator
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.b3nny1nc.recall"
        ) else {
            print("[RecallSupabaseClient] refreshAccessToken — containerURL nil, cannot write back")
            return newAccessToken  // still return the token even if we can't persist
        }

        let tokenURL = containerURL.appendingPathComponent("auth-token.json")
        let updatedPayload: [String: Any] = [
            "access_token": newAccessToken,
            "refresh_token": newRefreshToken,
            "user_id": userId,
            "expires_at": newExpiresAt,
        ]

        guard let updatedData = try? JSONSerialization.data(withJSONObject: updatedPayload) else {
            print("[RecallSupabaseClient] refreshAccessToken — failed to serialize updated payload")
            return newAccessToken
        }

        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(writingItemAt: tokenURL, options: .forReplacing, error: &coordinatorError) { coordURL in
            do {
                try updatedData.write(to: coordURL, options: .atomic)
                print("[RecallSupabaseClient] refreshAccessToken — token written back to App Group for userId=\(userId)")
            } catch {
                print("[RecallSupabaseClient] refreshAccessToken — write failed: \(error.localizedDescription)")
            }
        }
        if let err = coordinatorError {
            print("[RecallSupabaseClient] refreshAccessToken — NSFileCoordinator error: \(err.localizedDescription)")
        }

        return newAccessToken
    }

    /// Main entry point: reads the stored token, refreshes if expired or near-expiry (< 5 min),
    /// and returns a valid access token. Returns nil only if no token file exists and refresh fails.
    static func readAndRefreshTokenIfNeeded() async -> String? {
        guard let tokenData = readFullTokenData() else {
            print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — no token file found, user not signed in")
            return nil
        }

        let timeRemaining = tokenData.expiresAt - Date().timeIntervalSince1970
        print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — timeRemaining=\(Int(timeRemaining))s")

        if timeRemaining > 300 {
            print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — token still valid (\(Int(timeRemaining))s remaining), using stored token")
            return tokenData.accessToken
        }

        print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — token expired or near-expiry (\(Int(timeRemaining))s), refreshing...")
        if let freshToken = await refreshAccessToken(refreshToken: tokenData.refreshToken) {
            print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — refresh succeeded")
            return freshToken
        }

        print("[RecallSupabaseClient] readAndRefreshTokenIfNeeded — refresh failed, attempting to use stored token as fallback")
        return tokenData.accessToken
    }

    // MARK: - Search recalls

    @available(iOS 17.2, *)
    static func searchRecalls(query: String, token: String, limit: Int = 5) async throws -> [RecallEntity] {
        print("[RecallSupabaseClient] Searching recalls for query: \(query), limit: \(limit)")

        let pattern = "*\(query)*"
        guard let encodedPattern = pattern.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            print("[RecallSupabaseClient] Failed to encode search pattern")
            return []
        }

        let urlString = "\(supabaseURL)/rest/v1/recalls?select=id,text,created_at,location,location_primary_type,recall_images(id)&text=ilike.\(encodedPattern)&order=created_at.desc&limit=\(limit)"
        guard let url = URL(string: urlString) else {
            print("[RecallSupabaseClient] Failed to construct search URL")
            return []
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 10

        print("[RecallSupabaseClient] Making network request to Supabase REST API")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            print("[RecallSupabaseClient] Invalid response type")
            return []
        }

        print("[RecallSupabaseClient] Search response status: \(httpResponse.statusCode)")

        guard httpResponse.statusCode == 200 else {
            print("[RecallSupabaseClient] Non-200 status code: \(httpResponse.statusCode)")
            return []
        }

        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            print("[RecallSupabaseClient] Failed to parse JSON response")
            return []
        }

        let entities = rows.compactMap { row -> RecallEntity? in
            guard let id = row["id"] as? String,
                  let text = row["text"] as? String else { return nil }
            let createdAt = row["created_at"] as? String ?? ""
            let location = row["location"] as? String

            var imageCount = 0
            if let imagesArr = row["recall_images"] as? [[String: Any]] {
                imageCount = imagesArr.count
            }

            return RecallEntity(
                id: id,
                text: text,
                createdAt: createdAt,
                locationName: location,
                imageCount: imageCount
            )
        }

        print("[RecallSupabaseClient] Search returned \(entities.count) results")
        return entities
    }

    // MARK: - Fetch single recall by ID

    @available(iOS 17.2, *)
    static func fetchRecall(id: String, token: String) async throws -> RecallEntity? {
        print("[RecallSupabaseClient] Fetching recall by ID: \(id)")

        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        let urlString = "\(supabaseURL)/rest/v1/recalls?select=id,text,created_at,location,recall_images(id)&id=eq.\(encodedId)&limit=1"
        guard let url = URL(string: urlString) else {
            print("[RecallSupabaseClient] Failed to construct fetch URL for ID: \(id)")
            return nil
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 10

        print("[RecallSupabaseClient] Making network request to fetch recall \(id)")
        let (data, response) = try await URLSession.shared.data(for: request)

        if let httpResponse = response as? HTTPURLResponse {
            print("[RecallSupabaseClient] Fetch recall response status: \(httpResponse.statusCode)")
        }

        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let row = rows.first,
              let rowId = row["id"] as? String,
              let text = row["text"] as? String else {
            print("[RecallSupabaseClient] Failed to parse recall data for ID: \(id)")
            return nil
        }

        var imageCount = 0
        if let imagesArr = row["recall_images"] as? [[String: Any]] {
            imageCount = imagesArr.count
        }

        print("[RecallSupabaseClient] Successfully fetched recall: \(rowId)")
        return RecallEntity(
            id: rowId,
            text: text,
            createdAt: row["created_at"] as? String ?? "",
            locationName: row["location"] as? String,
            imageCount: imageCount
        )
    }
}
