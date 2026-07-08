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
      // containerURL being non-nil already proves the entitlement is provisioned;
      // check that the directory is actually reachable as a sanity guard
      var isDir: ObjCBool = false
      let containerExists = FileManager.default.fileExists(atPath: containerPath, isDirectory: &isDir) && isDir.boolValue

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

    AsyncFunction("writeTokenFile") { (groupId: String, jsonPayload: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] writeTokenFile — containerURL is nil for groupId=\(groupId)")
        promise.resolve(false)
        return
      }
      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      guard let data = jsonPayload.data(using: .utf8) else {
        print("[AppGroupModule] writeTokenFile — failed to encode payload as UTF-8")
        promise.resolve(false)
        return
      }
      var coordinatorError: NSError?
      var writeSuccess = false
      let coordinator = NSFileCoordinator()
      coordinator.coordinate(writingItemAt: tokenURL, options: .forReplacing, error: &coordinatorError) { url in
        do {
          try data.write(to: url, options: .atomic)
          writeSuccess = true
          print("[AppGroupModule] writeTokenFile — wrote \(data.count) bytes to \(url.path)")
        } catch {
          print("[AppGroupModule] writeTokenFile — write failed: \(error.localizedDescription)")
        }
      }
      if let err = coordinatorError {
        print("[AppGroupModule] writeTokenFile — coordinator error: \(err.localizedDescription)")
        promise.resolve(false)
        return
      }
      promise.resolve(writeSuccess)
    }

    AsyncFunction("deleteTokenFile") { (groupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] deleteTokenFile — containerURL is nil for groupId=\(groupId)")
        promise.resolve(false)
        return
      }
      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      guard FileManager.default.fileExists(atPath: tokenURL.path) else {
        print("[AppGroupModule] deleteTokenFile — file does not exist, nothing to delete")
        promise.resolve(false)
        return
      }
      var coordinatorError: NSError?
      var deleteSuccess = false
      let coordinator = NSFileCoordinator()
      coordinator.coordinate(writingItemAt: tokenURL, options: .forDeleting, error: &coordinatorError) { url in
        do {
          try FileManager.default.removeItem(at: url)
          deleteSuccess = true
          print("[AppGroupModule] deleteTokenFile — deleted \(url.path)")
        } catch {
          print("[AppGroupModule] deleteTokenFile — delete failed: \(error.localizedDescription)")
        }
      }
      if let err = coordinatorError {
        print("[AppGroupModule] deleteTokenFile — coordinator error: \(err.localizedDescription)")
        promise.resolve(false)
        return
      }
      promise.resolve(deleteSuccess)
    }
  }
}
