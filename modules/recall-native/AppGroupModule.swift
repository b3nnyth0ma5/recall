import ExpoModulesCore
import Foundation
import Security

public class AppGroupModule: Module {

  // Prevent double-registration of the Darwin observer across hot reloads
  private static var darwinObserverRegistered = false

  // MARK: - Keychain helpers

  private static let keychainService = "com.b3nny1nc.recall.auth"
  private static let keychainAccount = "supabase-session"
  private static let keychainAccessGroup = "9PWN6F3TK8.com.b3nny1nc.recall"

  private static func writeTokenToKeychain(_ jsonPayload: String) {
    guard let data = jsonPayload.data(using: .utf8) else {
      print("[AppGroupModule] writeTokenToKeychain — failed to encode payload")
      return
    }
    // Delete any existing item first
    let deleteQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecAttrAccessGroup as String: keychainAccessGroup,
    ]
    SecItemDelete(deleteQuery as CFDictionary)

    // Add new item
    let addQuery: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecAttrAccessGroup as String: keychainAccessGroup,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
      kSecValueData as String: data,
    ]
    let status = SecItemAdd(addQuery as CFDictionary, nil)
    if status == errSecSuccess {
      print("[AppGroupModule] writeTokenToKeychain — wrote \(data.count) bytes to Keychain")
    } else {
      print("[AppGroupModule] writeTokenToKeychain — SecItemAdd failed: \(status)")
    }
  }

  private static func deleteTokenFromKeychain() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: keychainService,
      kSecAttrAccount as String: keychainAccount,
      kSecAttrAccessGroup as String: keychainAccessGroup,
    ]
    let status = SecItemDelete(query as CFDictionary)
    print("[AppGroupModule] deleteTokenFromKeychain — status: \(status)")
  }

  public func definition() -> ModuleDefinition {
    Name("AppGroupModule")

    Events("onShareCompleted")

    OnCreate {
      if #available(iOS 17.2, *) {
        // After prebuild the intent files compile into the main "Recall" target,
        // so the ObjC runtime name is "Recall.RecallShortcutsHelper".
        // Try both the qualified and unqualified names for robustness.
        let classNames = ["Recall.RecallShortcutsHelper", "RecallShortcutsHelper"]
        let sel = NSSelectorFromString("updateShortcutParameters")
        for name in classNames {
          if let helperClass = NSClassFromString(name) as? NSObject.Type,
             helperClass.responds(to: sel) {
            _ = helperClass.perform(sel)
            break
          }
        }
      }

      // Register Darwin notification observer for share-completed events
      guard !AppGroupModule.darwinObserverRegistered else { return }
      AppGroupModule.darwinObserverRegistered = true

      CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        Unmanaged.passUnretained(self).toOpaque(),
        { _, observer, _, _, _ in
          guard let observer = observer else { return }
          let module = Unmanaged<AppGroupModule>.fromOpaque(observer).takeUnretainedValue()
          DispatchQueue.main.async {
            module.sendEvent("onShareCompleted", ["timestamp": Date().timeIntervalSince1970])
          }
        },
        "com.b3nny1nc.recall.shareCompleted" as CFString,
        nil,
        .deliverImmediately
      )
      print("[AppGroupModule] Darwin observer registered for com.b3nny1nc.recall.shareCompleted")
    }

    OnDestroy {
      CFNotificationCenterRemoveObserver(
        CFNotificationCenterGetDarwinNotifyCenter(),
        Unmanaged.passUnretained(self).toOpaque(),
        CFNotificationName("com.b3nny1nc.recall.shareCompleted" as CFString),
        nil
      )
      AppGroupModule.darwinObserverRegistered = false
      print("[AppGroupModule] Darwin observer removed")
    }

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
        // Still write to Keychain even if App Group is unavailable
        AppGroupModule.writeTokenToKeychain(jsonPayload)
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
      // Also write to Keychain as a fallback for share extension / Siri
      AppGroupModule.writeTokenToKeychain(jsonPayload)
    }

    AsyncFunction("deleteTokenFile") { (groupId: String, promise: Promise) in
      guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
        print("[AppGroupModule] deleteTokenFile — containerURL is nil for groupId=\(groupId)")
        AppGroupModule.deleteTokenFromKeychain()
        promise.resolve(false)
        return
      }
      let tokenURL = containerURL.appendingPathComponent("auth-token.json")
      guard FileManager.default.fileExists(atPath: tokenURL.path) else {
        print("[AppGroupModule] deleteTokenFile — file does not exist, nothing to delete")
        AppGroupModule.deleteTokenFromKeychain()
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
      AppGroupModule.deleteTokenFromKeychain()
    }

    AsyncFunction("verifyKeychainItem") { (promise: Promise) in
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.b3nny1nc.recall.auth",
        kSecAttrAccount as String: "supabase-session",
        kSecAttrAccessGroup as String: "9PWN6F3TK8.com.b3nny1nc.recall",
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
      ]
      var result: AnyObject?
      let status = SecItemCopyMatching(query as CFDictionary, &result)
      let present = status == errSecSuccess
      let dataSize = (result as? Data)?.count ?? 0
      print("[AppGroupModule] verifyKeychainItem — present=\(present) dataSize=\(dataSize) status=\(status)")
      promise.resolve(["present": present, "dataSize": dataSize] as [String: Any])
    }
  }
}
