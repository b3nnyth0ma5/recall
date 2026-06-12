import ExpoModulesCore
import Foundation
import CoreSpotlight
import UniformTypeIdentifiers

public class SiriShortcutsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SiriShortcutsModule")

    AsyncFunction("donateSearch") { (query: String, promise: Promise) in
      let activityType = "com.b3nny1nc.recall.search"
      let activity = NSUserActivity(activityType: activityType)
      activity.title = "Search for \"\(query)\""
      activity.isEligibleForSearch = true
      activity.isEligibleForPrediction = true
      activity.persistentIdentifier = NSUserActivityPersistentIdentifier("search-\(query)")
      let attributes = CSSearchableItemAttributeSet(contentType: UTType.text)
      attributes.contentDescription = "Search Recall for \"\(query)\""
      activity.contentAttributeSet = attributes
      activity.becomeCurrent()
      promise.resolve(nil)
    }
  }
}
