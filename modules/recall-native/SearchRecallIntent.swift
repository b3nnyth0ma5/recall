import AppIntents
import UIKit

@available(iOS 17.2, *)
struct SearchRecallIntent: ShowInAppSearchResultsIntent {
    static var title: LocalizedStringResource = "Search Recall"
    static var description = IntentDescription("Search your Recall memories by voice or text.")
    static let searchScopes: [StringSearchScope] = [.general]
    static var openAppWhenRun: Bool = true

    @Parameter(
        title: "Search query",
        description: "What would you like to search for in your memories?",
        requestValueDialog: IntentDialog("What would you like to search for in Recall?")
    )
    var criteria: StringSearchCriteria

    @MainActor
    func perform() async throws -> some IntentResult {
        let term = criteria.term
        guard !term.trimmingCharacters(in: .whitespaces).isEmpty else {
            return .result()
        }
        let encoded = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
        guard let url = URL(string: "recall://search?q=\(encoded)") else {
            return .result()
        }
        await UIApplication.shared.open(url)
        return .result()
    }
}
