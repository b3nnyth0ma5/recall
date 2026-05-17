import ExpoModulesCore
import Foundation

public class AppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    AsyncFunction("getContainerPath") { (groupID: String) -> String? in
      return FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: groupID
      )?.path
    }
  }
}
