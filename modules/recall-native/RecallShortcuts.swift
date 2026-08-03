import AppIntents

@available(iOS 17.2, *)
struct RecallShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .purple

    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SearchRecallIntent(),
            phrases: [
                "Search \(.applicationName)",
                "Search my \(.applicationName)",
                "Search my memories in \(.applicationName)",
                "Find something in \(.applicationName)",
                "Look something up in \(.applicationName)",
                "Ask \(.applicationName) something",
            ],
            shortTitle: "Search Recall",
            systemImageName: "magnifyingglass"
        )
        AppShortcut(
            intent: CreateRecallIntent(),
            phrases: [
                "Create a \(.applicationName)",
                "Add a \(.applicationName)",
                "New \(.applicationName)",
                "Create a new \(.applicationName)",
                "Add a new \(.applicationName)",
            ],
            shortTitle: "Create Recall",
            systemImageName: "plus.circle"
        )
    }
}
