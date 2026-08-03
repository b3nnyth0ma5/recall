import Foundation

// @objc bridge so AppGroupModule (a separate pod) can call
// RecallShortcuts.updateAppShortcutParameters() via NSClassFromString
// without a direct Swift import across pod boundaries.
@available(iOS 17.2, *)
@objc(RecallShortcutsHelper)
public class RecallShortcutsHelper: NSObject {
    @objc public static func updateShortcutParameters() {
        RecallShortcuts.updateAppShortcutParameters()
    }
}
