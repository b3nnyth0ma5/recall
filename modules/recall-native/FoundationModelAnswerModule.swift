import ExpoModulesCore
import Foundation

#if compiler(>=6.0)
import FoundationModels
#endif

public class FoundationModelAnswerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FoundationModelAnswerModule")

    AsyncFunction("checkAvailability") { (promise: Promise) in
      #if compiler(>=6.0)
      if #available(iOS 26.1, *) {
        let availability = SystemLanguageModel.default.availability
        switch availability {
        case .available:
          promise.resolve("available")
        case .unavailable(.appleIntelligenceNotEnabled):
          promise.resolve("apple_intelligence_disabled")
        case .unavailable(.deviceNotEligible):
          promise.resolve("device_not_eligible")
        case .unavailable(.modelNotReady):
          promise.resolve("model_not_ready")
        case .unavailable:
          promise.resolve("unavailable")
        }
      } else {
        promise.resolve("unavailable")
      }
      #else
      promise.resolve("unavailable")
      #endif
    }

    AsyncFunction("generateAnswer") { (contextString: String, query: String, uploadedImagesContext: String, promise: Promise) async in
      #if compiler(>=6.0)
      if #available(iOS 26.1, *) {
        guard case .available = SystemLanguageModel.default.availability else {
          promise.reject("ERR_UNAVAILABLE", "Foundation Models not available on this device")
          return
        }

        // Condensed system prompt — kept under 800 chars to stay within instruction token budget
        let systemPrompt = """
You are a search assistant. Answer questions using only the provided recalls.

Rules:
- Prioritise recalls with highest match percentages
- Use bullet points for multiple items
- No URLs in answers
- Include a confidence score (0-100)
- Cite sources inline as SOURCE_1, SOURCE_2 etc immediately after relevant text
- Same source may appear multiple times
- [LOCATION], [PEOPLE], [KEYWORD] tags indicate match type
- Linked pages and documents are supplementary to recall text
- Uploaded images context helps identify what the user is searching for

Respond in JSON only (no markdown):
{"answer": "text with SOURCE_X inline", "confidence": 85, "sources": ["SOURCE_1"]}

If insufficient information: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}
"""

        let maxContextChars = 10_000
        let truncatedContext = contextString.count > maxContextChars
          ? String(contextString.prefix(maxContextChars)) + "\n\n[Context truncated to fit on-device model limits]"
          : contextString

        let fullMessage = "Question: \(query)\(uploadedImagesContext)\n\nAvailable Recalls (sorted by highest match percentage first):\n\(truncatedContext)"

        // Re-check availability immediately before creating the session — model can become unavailable between the initial check and here
        guard case .available = SystemLanguageModel.default.availability else {
          promise.reject("ERR_UNAVAILABLE", "Foundation Models became unavailable")
          return
        }
        // Create session — LanguageModelSession.init does not throw; kept short to avoid instruction token budget trap
        let session = LanguageModelSession(instructions: Instructions(systemPrompt))

        let startTime = Date()
        do {
          let response = try await session.respond(to: fullMessage)
          let responseText = response.content
          let durationMs = Int(Date().timeIntervalSince(startTime) * 1000)

          guard let data = responseText.data(using: .utf8),
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            promise.reject("ERR_GENERATION", "Failed to parse JSON response from model")
            return
          }

          let answer = json["answer"] as? String ?? ""
          let confidence = json["confidence"] as? Int ?? 0
          let sources = json["sources"] as? [String] ?? []

          promise.resolve([
            "answer": answer,
            "confidence": confidence,
            "sources": sources,
            "durationMs": durationMs,
          ] as [String: Any])
        } catch let genError as LanguageModelSession.GenerationError {
          switch genError {
          case .exceededContextWindowSize:
            promise.reject("ERR_CONTEXT_TOO_LARGE", "Input exceeded the on-device model context window — falling back to cloud")
          default:
            promise.reject("ERR_GENERATION", "Foundation Models generation error: \(genError.localizedDescription)")
          }
        } catch {
          promise.reject("ERR_GENERATION", "Foundation Models failed: \(error.localizedDescription)")
        }
      } else {
        promise.reject("ERR_UNAVAILABLE", "Foundation Models requires iOS 26.1 or later")
      }
      #else
      promise.reject("ERR_UNAVAILABLE", "Foundation Models not available (requires Swift 6.0+ compiler)")
      #endif
    }
  }
}
