import AppIntents
import UIKit

@available(iOS 17.2, *)
struct SearchRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Search Recall"
    static var description = IntentDescription("Open Recall to search your memories.")
    static var openAppWhenRun: Bool = true
    static var isDiscoverable: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        if let url = URL(string: "recall://search") {
            print("[SearchRecallIntent] Opening Recall search screen")
            await UIApplication.shared.open(url)
        }
        return .result()
    }
}
