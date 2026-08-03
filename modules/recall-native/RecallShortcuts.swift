import AppIntents

@available(iOS 17.2, *)
struct RecallShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .purple

    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SearchRecallIntent(),
            phrases: [
                "Search \(.applicationName) for \(\.$query)",
                "Find \(\.$query) in \(.applicationName)",
                "Look up \(\.$query) in \(.applicationName)",
                "Ask \(.applicationName) about \(\.$query)",
                "Search for \(\.$query) in \(.applicationName)",
                "Search my \(.applicationName) for \(\.$query)",
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
