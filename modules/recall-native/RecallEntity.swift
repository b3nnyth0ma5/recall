import AppIntents
import Foundation
import UIKit

// MARK: - RecallEntity

@available(iOS 17.2, *)
struct RecallEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Recall"
    static var defaultQuery = RecallEntityQuery()

    var id: String
    var text: String
    var createdAt: String       // ISO 8601 string
    var locationName: String?
    var imageCount: Int

    var displayRepresentation: DisplayRepresentation {
        let truncated = String(text.prefix(80))
        let subtitle = locationName ?? ""
        return DisplayRepresentation(
            title: "\(truncated)",
            subtitle: "\(subtitle)"
        )
    }
}

// MARK: - RecallEntityQuery

@available(iOS 17.2, *)
struct RecallEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [RecallEntity] {
        guard let token = RecallSupabaseClient.readAccessToken() else { return [] }
        var results: [RecallEntity] = []
        for id in identifiers {
            if let entity = try? await RecallSupabaseClient.fetchRecall(id: id, token: token) {
                results.append(entity)
            }
        }
        return results
    }
}

// MARK: - OpenRecallIntent

@available(iOS 17.2, *)
struct OpenRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Create Recall"
    static var description = IntentDescription("Opens Recall to create a new memory.")
    static var isDiscoverable: Bool = true
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let url = URL(string: "recall://?openCreate=true") {
            print("[OpenRecallIntent] Opening Recall home screen to create new recall")
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}
