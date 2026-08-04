import AppIntents
import SwiftUI

@available(iOS 17.2, *)
struct SearchRecallIntent: AppIntent {
    static var title: LocalizedStringResource = "Search Recall"
    static var description = IntentDescription("Search your Recall memories and see matching results.")

    // Run in background — do NOT open the app just to search
    static var openAppWhenRun: Bool = false
    static var isDiscoverable: Bool = true

    static var parameterSummary: some ParameterSummary {
        Summary("Search Recall for \(\.$query)")
    }

    @Parameter(
        title: "Search query",
        description: "What would you like to search for in your memories?",
        requestValueDialog: IntentDialog("What would you like to search for in Recall?")
    )
    var query: String

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let term = query.trimmingCharacters(in: .whitespaces)

        print("[SearchRecallIntent] perform() called with query: '\(term)'")

        // Attempt to get a valid (possibly refreshed) token
        guard let token = await RecallSupabaseClient.readAndRefreshTokenIfNeeded() else {
            print("[SearchRecallIntent] No auth token available — user not signed in or refresh failed")

            // Distinguish between "never signed in" and "refresh failed"
            let dialog: IntentDialog
            if RecallSupabaseClient.hasTokenFile() {
                print("[SearchRecallIntent] Token file exists but refresh failed — prompting reconnect")
                dialog = IntentDialog("Couldn't refresh your sign-in. Open Recall to reconnect.")
            } else {
                print("[SearchRecallIntent] No token file found — user has never signed in")
                dialog = IntentDialog("Open Recall and sign in to enable search.")
            }
            let snippet = RecallSnippetView(query: term, results: [], totalCount: 0)
            return .result(dialog: dialog, view: snippet)
        }

        guard !term.isEmpty else {
            print("[SearchRecallIntent] Empty query provided")
            let dialog = IntentDialog("Please provide a search term.")
            let snippet = RecallSnippetView(query: "", results: [], totalCount: 0)
            return .result(dialog: dialog, view: snippet)
        }

        // Fetch from Supabase
        print("[SearchRecallIntent] Fetching results from Supabase for: '\(term)'")
        let results = (try? await RecallSupabaseClient.searchRecalls(query: term, token: token, limit: 5)) ?? []
        print("[SearchRecallIntent] Got \(results.count) results for query: '\(term)'")

        // Build dialog (spoken by Siri)
        let dialog: IntentDialog
        if results.isEmpty {
            dialog = IntentDialog("I couldn't find any recalls about \(term).")
        } else if results.count == 1 {
            dialog = IntentDialog(
                full: "I found 1 recall about \(term). Tap to open it in Recall.",
                supporting: "Here's what I found."
            )
        } else {
            dialog = IntentDialog(
                full: "I found \(results.count) recalls about \(term). Tap any result to open it in Recall.",
                supporting: "Here are your top results."
            )
        }

        // Build snippet view shown in Siri's UI
        let snippet = RecallSnippetView(query: term, results: results, totalCount: results.count)

        return .result(dialog: dialog, view: snippet)
    }
}
