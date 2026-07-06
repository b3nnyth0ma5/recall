import ExpoModulesCore
import Foundation

public class AppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    AsyncFunction("getContainerPath") { (groupId: String, promise: Promise) in
      let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)
      let result = containerURL?.path
      print("[AppGroupModule] getContainerPath groupId=\(groupId) result=\(result ?? "nil")")
      promise.resolve(result)
    }

    AsyncFunction("verifyContainer") { (groupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] verifyContainer groupId=\(groupId) — containerURL is nil")
        promise.resolve([
          "containerPath": "",
          "containerExists": false,
          "tokenFileExists": false,
          "tokenFileSize": 0,
          "tokenFileModifiedTimestamp": 0.0,
        ] as [String: Any])
        return
      }

      let containerPath = containerURL.path
      let containerExists = FileManager.default.fileExists(atPath: containerPath)

      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      let tokenPath = tokenURL.path
      let tokenFileExists = FileManager.default.fileExists(atPath: tokenPath)

      var tokenFileSize = 0
      var tokenFileModifiedTimestamp = 0.0
      if tokenFileExists,
         let attrs = try? FileManager.default.attributesOfItem(atPath: tokenPath) {
        tokenFileSize = (attrs[.size] as? Int) ?? 0
        tokenFileModifiedTimestamp = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0.0
      }

      let result: [String: Any] = [
        "containerPath": containerPath,
        "containerExists": containerExists,
        "tokenFileExists": tokenFileExists,
        "tokenFileSize": tokenFileSize,
        "tokenFileModifiedTimestamp": tokenFileModifiedTimestamp,
      ]
      print("[AppGroupModule] verifyContainer groupId=\(groupId) result=\(result)")
      promise.resolve(result)
    }

    AsyncFunction("readLastShareExtensionError") { (groupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] readLastShareExtensionError groupId=\(groupId) — containerURL is nil")
        promise.resolve(nil)
        return
      }

      let errorURL = containerURL.appendingPathComponent("share-ext-last-error.json")
      guard FileManager.default.fileExists(atPath: errorURL.path),
            let data = try? Data(contentsOf: errorURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        print("[AppGroupModule] readLastShareExtensionError groupId=\(groupId) — file missing or unreadable")
        promise.resolve(nil)
        return
      }

      print("[AppGroupModule] readLastShareExtensionError groupId=\(groupId) result=\(json)")
      promise.resolve(json)
    }

    AsyncFunction("clearLastShareExtensionError") { (groupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] clearLastShareExtensionError groupId=\(groupId) — containerURL is nil")
        promise.resolve(false)
        return
      }

      let errorURL = containerURL.appendingPathComponent("share-ext-last-error.json")
      guard FileManager.default.fileExists(atPath: errorURL.path) else {
        print("[AppGroupModule] clearLastShareExtensionError groupId=\(groupId) — file does not exist")
        promise.resolve(false)
        return
      }

      do {
        try FileManager.default.removeItem(at: errorURL)
        print("[AppGroupModule] clearLastShareExtensionError groupId=\(groupId) — deleted successfully")
        promise.resolve(true)
      } catch {
        print("[AppGroupModule] clearLastShareExtensionError groupId=\(groupId) — delete failed: \(error.localizedDescription)")
        promise.resolve(false)
      }
    }
  }
}
