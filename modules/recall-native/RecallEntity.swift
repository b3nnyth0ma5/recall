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
struct OpenRecallIntent: OpenIntent {
    static var title: LocalizedStringResource = "Open Recall"
    static var description = IntentDescription("Opens a specific recall in the Recall app.")
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = true

    static var parameterSummary: some ParameterSummary {
        Summary("Open \(\.$target) in Recall")
    }

    @Parameter(title: "Recall")
    var target: RecallEntity

    init() {}

    init(target: RecallEntity) {
        self.target = target
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        let encoded = target.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? target.id
        if let url = URL(string: "recall://note/\(encoded)") {
            print("[OpenRecallIntent] Opening recall in app: \(target.id)")
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}
