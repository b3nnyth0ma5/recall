import AppIntents
import UIKit

@available(iOS 17.2, *)
struct CreateRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Create Recall"
    static var description = IntentDescription("Open Recall ready to create a new memory.")
    static var supportedModes: IntentModes = .foregroundApplication
    static var isDiscoverable: Bool = true

    static var parameterSummary: some ParameterSummary {
        Summary("Create a new Recall memory")
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "recall://create-recall") else {
            return .result()
        }
        await UIApplication.shared.open(url)
        return .result()
    }
}
