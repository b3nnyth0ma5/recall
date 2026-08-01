import AppIntents
import UIKit

@available(iOS 16.0, *)
struct CreateRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Create Recall"
    static var description = IntentDescription("Open Recall ready to create a new memory.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "recall://create-recall") else {
            return .result()
        }
        UIApplication.shared.open(url)
        return .result()
    }
}
