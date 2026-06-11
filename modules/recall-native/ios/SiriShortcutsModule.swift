import ExpoModulesCore
import Foundation
import Intents

public class SiriShortcutsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SiriShortcutsModule")

    AsyncFunction("donateSearch") { (query: String) in
      let activity = NSUserActivity(activityType: "com.recall.app.search")
      activity.title = "Search Recall for \(query)"
      activity.userInfo = ["query": query]
      activity.isEligibleForSearch = true
      activity.isEligibleForPrediction = true
      activity.becomeCurrent()
    }
  }
}
