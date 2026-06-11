import ExpoModulesCore
import Foundation

public class AppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    AsyncFunction("getContainerPath") { (groupId: String) -> String? in
      return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)?.path
    }

    AsyncFunction("verifyContainer") { (groupId: String) -> [String: Any] in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        return [
          "containerPath": "",
          "containerExists": false,
          "tokenFileExists": false,
          "tokenFileSize": 0,
          "tokenFileModifiedTimestamp": 0.0
        ]
      }

      let containerPath = containerURL.path
      let containerExists = FileManager.default.fileExists(atPath: containerPath)

      let tokenFileURL = containerURL.appendingPathComponent("auth-token.json")
      let tokenFilePath = tokenFileURL.path
      let tokenFileExists = FileManager.default.fileExists(atPath: tokenFilePath)

      var tokenFileSize = 0
      var tokenFileModifiedTimestamp = 0.0

      if tokenFileExists {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: tokenFilePath) {
          tokenFileSize = (attrs[.size] as? Int) ?? 0
          if let modDate = attrs[.modificationDate] as? Date {
            tokenFileModifiedTimestamp = modDate.timeIntervalSince1970
          }
        }
      }

      return [
        "containerPath": containerPath,
        "containerExists": containerExists,
        "tokenFileExists": tokenFileExists,
        "tokenFileSize": tokenFileSize,
        "tokenFileModifiedTimestamp": tokenFileModifiedTimestamp
      ]
    }

    AsyncFunction("readLastShareExtensionError") { (groupId: String) -> [String: Any]? in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        return nil
      }

      let errorFileURL = containerURL.appendingPathComponent("share-ext-last-error.json")

      guard FileManager.default.fileExists(atPath: errorFileURL.path),
            let data = try? Data(contentsOf: errorFileURL),
            let json = try? JSONSerialization.jsonObject(with: data, options: .allowFragments) as? [String: Any] else {
        return nil
      }

      return json
    }

    AsyncFunction("clearLastShareExtensionError") { (groupId: String) -> Bool in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        return false
      }

      let errorFileURL = containerURL.appendingPathComponent("share-ext-last-error.json")

      guard FileManager.default.fileExists(atPath: errorFileURL.path) else {
        return false
      }

      do {
        try FileManager.default.removeItem(at: errorFileURL)
        return true
      } catch {
        return false
      }
    }
  }
}
