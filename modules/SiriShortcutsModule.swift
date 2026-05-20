import ExpoModulesCore
import Foundation

public class SiriShortcutsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SiriShortcutsModule")

    AsyncFunction("donateSearch") { (query: String) in
      await MainActor.run {
        let activity = NSUserActivity(activityType: "com.b3nny1nc.recall.search")
        activity.title = "Search Recall: \(query)"
        activity.userInfo = ["query": query]
        activity.isEligibleForSearch = true
        activity.isEligibleForPrediction = true
        activity.persistentIdentifier = NSUserActivityPersistentIdentifier("com.b3nny1nc.recall.search.\(query)")
        activity.suggestedInvocationPhrase = "Search my memories"
        activity.becomeCurrent()
      }
    }
  }
}
