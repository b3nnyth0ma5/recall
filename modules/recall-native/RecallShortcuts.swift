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
                "Search my recalls for \(\.$criteria)",
            ],
            shortTitle: "Search Recall",
            systemImageName: "magnifyingglass"
        )
    }
}
