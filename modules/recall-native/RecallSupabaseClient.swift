import Foundation

@available(iOS 17.2, *)
enum RecallSupabaseClient {

    private static let supabaseURL = "https://cesmsdnblkdjkskmiqib.supabase.co"
    private static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlc21zZG5ibGtkamtza21pcWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MDc1NzcsImV4cCI6MjA3ODA4MzU3N30.AlULDdolfFFcqfrjXY4XBC_fzD_Gz-bx2FCyqjx4nA4"

    // MARK: - Auth token

    static func readAccessToken() -> String? {
        guard let containerURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.b3nny1nc.recall"
        ) else {
            print("[RecallSupabaseClient] Failed to get App Group container URL")
            return nil
        }

        let tokenURL = containerURL.appendingPathComponent("auth-token.json")
        guard let data = try? Data(contentsOf: tokenURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let token = json["access_token"] as? String else {
            print("[RecallSupabaseClient] Failed to read access token from auth-token.json")
            return nil
        }
        print("[RecallSupabaseClient] Successfully read access token")
        return token
    }

    // MARK: - Search recalls

    static func searchRecalls(query: String, token: String, limit: Int = 5) async throws -> [RecallEntity] {
        print("[RecallSupabaseClient] Searching recalls for query: \(query), limit: \(limit)")

        let pattern = "*\(query)*"
        guard let encodedPattern = pattern.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            print("[RecallSupabaseClient] Failed to encode search pattern")
            return []
        }

        let urlString = "\(supabaseURL)/rest/v1/recalls?select=id,text,created_at,location,location_primary_type&text=ilike.\(encodedPattern)&order=created_at.desc&limit=\(limit)"
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
            return RecallEntity(
                id: id,
                text: text,
                createdAt: createdAt,
                locationName: location,
                imageCount: 0
            )
        }

        print("[RecallSupabaseClient] Search returned \(entities.count) results")
        return entities
    }

    // MARK: - Fetch single recall by ID

    static func fetchRecall(id: String, token: String) async throws -> RecallEntity? {
        print("[RecallSupabaseClient] Fetching recall by ID: \(id)")

        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? id
        let urlString = "\(supabaseURL)/rest/v1/recalls?select=id,text,created_at,location&id=eq.\(encodedId)&limit=1"
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

        print("[RecallSupabaseClient] Successfully fetched recall: \(rowId)")
        return RecallEntity(
            id: rowId,
            text: text,
            createdAt: row["created_at"] as? String ?? "",
            locationName: row["location"] as? String,
            imageCount: 0
        )
    }
}
