import AppIntents

@available(iOS 16.0, *)
struct RecallShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .purple

    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SearchRecallIntent(),
            phrases: [
                "Search \(.applicationName) for \(\.$criteria)",
                "Find \(\.$criteria) in \(.applicationName)",
                "Look up \(\.$criteria) in \(.applicationName)",
                "Ask \(.applicationName) about \(\.$criteria)",
                "Search for \(\.$criteria) in \(.applicationName)",
                "Search my \(.applicationName) for \(\.$criteria)",
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
