import SwiftUI
import AppIntents

// MARK: - Colour palette (matches Recall app)
// Background: #111111 (near-black)
// Card bg:    #1C1C1E (system grouped background dark)
// Accent:     #7C3AED (purple-600)
// Text:       .white / .secondary

@available(iOS 17.2, *)
struct RecallSnippetView: View {
    let query: String
    let results: [RecallEntity]
    let totalCount: Int

    private let accentColor = Color(red: 0.486, green: 0.227, blue: 0.929) // #7C3AED

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(accentColor)
                Text("Recall")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(accentColor)
                Spacer()
                if totalCount > 0 {
                    let resultLabel = totalCount == 1 ? "result" : "results"
                    Text("\(totalCount) \(resultLabel)")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 10)

            if results.isEmpty {
                // Empty state
                VStack(spacing: 6) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)
                    Text("No recalls found for \u{201C}\(query)\u{201D}")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            } else {
                // Result cards
                let displayResults = Array(results.prefix(3))
                VStack(spacing: 1) {
                    ForEach(Array(displayResults.enumerated()), id: \.offset) { index, entity in
                        RecallCardRow(entity: entity, accentColor: accentColor)
                        if index < displayResults.count - 1 {
                            Divider()
                                .background(Color.white.opacity(0.08))
                                .padding(.leading, 16)
                        }
                    }
                }
            }

            // Footer — "Open in Recall" hint
            if !results.isEmpty {
                HStack {
                    Spacer()
                    Text("Tap a result to open in Recall")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.vertical, 10)
            }
        }
        .background(Color(UIColor.systemBackground).opacity(0.0))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

@available(iOS 17.2, *)
struct RecallCardRow: View {
    let entity: RecallEntity
    let accentColor: Color

    private var formattedDate: String {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: entity.createdAt) {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }
        // Fallback: try without fractional seconds
        let iso2 = ISO8601DateFormatter()
        if let date = iso2.date(from: entity.createdAt) {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .none
            return formatter.string(from: date)
        }
        return ""
    }

    var body: some View {
        let truncatedText = String(entity.text.prefix(120))
        let dateString = formattedDate
        let locationString = entity.locationName ?? ""
        let hasDate = !dateString.isEmpty
        let hasLocation = !locationString.isEmpty

        VStack(alignment: .leading, spacing: 4) {
            Text(truncatedText)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(.primary)
                .lineLimit(3)
                .multilineTextAlignment(.leading)

            HStack(spacing: 8) {
                if hasDate {
                    Label(dateString, systemImage: "calendar")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                if hasLocation {
                    Label(locationString, systemImage: "mappin.and.ellipse")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }
}
