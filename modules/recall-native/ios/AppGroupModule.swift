import ExpoModulesCore
import Foundation

public class AppGroupModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    AsyncFunction("getContainerPath") { (appGroupId: String, promise: Promise) in
      if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
        promise.resolve(url.path)
      } else {
        promise.reject("ERR_APP_GROUP", "Could not resolve container URL for app group: \(appGroupId)")
      }
    }

    AsyncFunction("verifyContainer") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.reject("ERR_APP_GROUP", "Could not resolve container URL for app group: \(appGroupId)")
        return
      }
      let containerPath = containerURL.path
      let containerExists = FileManager.default.fileExists(atPath: containerPath)
      let tokenFileURL = containerURL.appendingPathComponent("auth-token.json")
      let tokenFileExists = FileManager.default.fileExists(atPath: tokenFileURL.path)
      var tokenFileSize: Int = 0
      var tokenFileModifiedTimestamp: Double = 0
      if tokenFileExists {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: tokenFileURL.path) {
          tokenFileSize = (attrs[.size] as? Int) ?? 0
          if let modDate = attrs[.modificationDate] as? Date {
            tokenFileModifiedTimestamp = modDate.timeIntervalSince1970 * 1000
          }
        }
      }
      promise.resolve([
        "containerPath": containerPath,
        "containerExists": containerExists,
        "tokenFileExists": tokenFileExists,
        "tokenFileSize": tokenFileSize,
        "tokenFileModifiedTimestamp": tokenFileModifiedTimestamp
      ])
    }

    AsyncFunction("readLastShareExtensionError") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.resolve(nil)
        return
      }
      let errorFileURL = containerURL.appendingPathComponent("last-share-error.json")
      guard FileManager.default.fileExists(atPath: errorFileURL.path),
            let data = try? Data(contentsOf: errorFileURL),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        promise.resolve(nil)
        return
      }
      promise.resolve(json)
    }

    AsyncFunction("clearLastShareExtensionError") { (appGroupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
        promise.resolve(false)
        return
      }
      let errorFileURL = containerURL.appendingPathComponent("last-share-error.json")
      guard FileManager.default.fileExists(atPath: errorFileURL.path) else {
        promise.resolve(false)
        return
      }
      do {
        try FileManager.default.removeItem(at: errorFileURL)
        promise.resolve(true)
      } catch {
        promise.resolve(false)
      }
    }
  }
}
