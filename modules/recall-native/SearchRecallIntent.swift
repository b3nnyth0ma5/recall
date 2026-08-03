import AppIntents
import UIKit

@available(iOS 17.2, *)
struct SearchRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Search Recall"
    static var description = IntentDescription("Search your Recall memories by voice or text.")
    static var openAppWhenRun: Bool = true

    @Parameter(
        title: "Search query",
        description: "What would you like to search for in your memories?",
        requestValueDialog: IntentDialog("What would you like to search for in Recall?")
    )
    var query: String

    @MainActor
    func perform() async throws -> some IntentResult {
        let term = query.trimmingCharacters(in: .whitespaces)
        guard !term.isEmpty else {
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
