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

    AsyncFunction("verifyContainer") { (groupID: String) -> [String: Any]? in
      var result: [String: Any] = [
        "containerPath": "",
        "containerExists": false,
        "tokenFileExists": false,
        "tokenFileSize": 0,
        "tokenFileModifiedTimestamp": 0.0,
      ]

      guard let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: groupID
      ) else {
        return result
      }

      let containerPath = containerURL.path
      result["containerPath"] = containerPath
      result["containerExists"] = FileManager.default.fileExists(atPath: containerPath)

      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      let tokenPath = tokenURL.path
      let tokenExists = FileManager.default.fileExists(atPath: tokenPath)
      result["tokenFileExists"] = tokenExists

      if tokenExists {
        do {
          let attrs = try FileManager.default.attributesOfItem(atPath: tokenPath)
          let size = (attrs[.size] as? Int) ?? 0
          let modDate = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0.0
          result["tokenFileSize"] = size
          result["tokenFileModifiedTimestamp"] = modDate
        } catch {
          // leave defaults (0) if attributes can't be read
        }
      }

      return result
    }
  }
}
