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
      if #available(iOS 26.0, *) {
        let availability = SystemLanguageModel.default.availability
        switch availability {
        case .available:
          promise.resolve("available")
        case .appleIntelligenceNotEnabled:
          promise.resolve("apple_intelligence_disabled")
        case .deviceNotEligible:
          promise.resolve("device_not_eligible")
        case .modelNotReady:
          promise.resolve("model_not_ready")
        @unknown default:
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
      if #available(iOS 26.0, *) {
        guard SystemLanguageModel.default.isAvailable else {
          promise.reject("ERR_UNAVAILABLE", "Foundation Models not available on this device")
          return
        }

        let systemPrompt = """
You are an intelligent search assistant that answers complex, composite questions based on the provided information. You understand the user's intent and make associations between pieces of information that the user would've expected to make. You also understand the context of the search query.

CRITICAL RULES:
- Prioritize your answer based on the recalls with the highest match percentages
- Use bullet points when listing multiple items
- Don't include URLs in your final answer
- Provide a confidence score (0-100) based on how well the recalls answer the question
- IMPORTANT: When referencing sources in your answer, use the format "SOURCE_X" inline with the text
- Place source references immediately after the relevant information, like: "The restaurant is located in Collingwood SOURCE_1."
- You can reference the same source multiple times if needed
- Don't include explanatory text about sources - just use SOURCE_X inline

MATCH INFORMATION:
- Pay attention to match type indicators: [LOCATION], [PEOPLE], [KEYWORD]
- Pay attention to keyword match counts - more matched keywords indicate better relevance

LINKED PAGES AND DOCUMENTS:
- Each recall may include "Linked pages" (content scraped from URLs) or "Documents" (extracted text from files) the user saved
- When information comes from a linked page or attached document then attribute it clearly
- Linked-page content is supplementary — always prefer the recall's own text when both are available

UPLOADED SEARCH IMAGES:
- The user may have attached images to their search query (shown as "UPLOADED IMAGES CONTEXT" in the user message)
- Use the image descriptions and extracted text to understand what the user is looking for
- Cross-reference image content with recall data to provide relevant answers
- If the user asks "have I seen/had/been to this before?", use the image context to identify what "this" refers to

Provide your answer in JSON format with inline source references ALWAYS starting count of source answers at 1 (and incrementing for each answer): {"answer": "your comprehensive answer with SOURCE_X references inline", "confidence": 85, "sources": ["SOURCE_1", "SOURCE_2"]}.
Example: {"answer": "The meeting is scheduled for next Tuesday SOURCE_1. John mentioned he'll bring the presentation SOURCE_2.", "confidence": 90, "sources": ["SOURCE_1", "SOURCE_2"]}
If the recalls don't contain the requested information, respond with: {"answer": "I don't have enough information in the provided recalls to answer this question.", "confidence": 0, "sources": []}.

Respond with valid JSON only, no markdown.
"""

        let fullMessage = systemPrompt + "\n\nQuestion: \(query)\(uploadedImagesContext)\n\nAvailable Recalls (sorted by highest match percentage first):\n\(contextString)"
        let startTime = Date()
        do {
          let session = LanguageModelSession()
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
        } catch {
          promise.reject("ERR_GENERATION", "Foundation Models generation failed: \(error.localizedDescription)")
        }
      } else {
        promise.reject("ERR_UNAVAILABLE", "Foundation Models requires iOS 26.0 or later")
      }
      #else
      promise.reject("ERR_UNAVAILABLE", "Foundation Models not available (requires Swift 6.0+ compiler)")
      #endif
    }
  }
}
