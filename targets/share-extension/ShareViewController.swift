import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupID = "group.com.b3nny1nc.recall"
    private let appURLScheme = "recall://share-intent"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.01)
        processSharedItems()
    }

    private func processSharedItems() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completeRequest()
            return
        }

        var texts: [String] = []
        var urls: [String] = []
        var imagePaths: [String] = []

        let group = DispatchGroup()

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }

            // Collect caption/subject text from the item
            if let title = item.attributedTitle?.string, !title.isEmpty {
                texts.append(title)
            }
            if let body = item.attributedContentText?.string, !body.isEmpty {
                texts.append(body)
            }

            for provider in attachments {
                // Handle images
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] item, error in
                        defer { group.leave() }
                        guard let self = self, error == nil else { return }

                        var imageData: Data?

                        if let url = item as? URL {
                            imageData = try? Data(contentsOf: url)
                        } else if let image = item as? UIImage {
                            imageData = image.jpegData(compressionQuality: 0.85)
                        } else if let data = item as? Data {
                            imageData = data
                        }

                        if let data = imageData,
                           let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupID) {
                            let fileName = "shared-image-\(UUID().uuidString).jpg"
                            let fileURL = containerURL.appendingPathComponent(fileName)
                            try? data.write(to: fileURL)
                            imagePaths.append(fileURL.path)
                        }
                    }
                }
                // Handle URLs
                else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
                        defer { group.leave() }
                        guard error == nil else { return }
                        if let url = item as? URL {
                            urls.append(url.absoluteString)
                        }
                    }
                }
                // Handle plain text
                else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, error in
                        defer { group.leave() }
                        guard error == nil else { return }
                        if let text = item as? String, !text.isEmpty {
                            texts.append(text)
                        }
                    }
                }
                // Handle web URLs (from Safari, Instagram link copy, etc.)
                else if provider.hasItemConformingToTypeIdentifier("public.url") {
                    group.enter()
                    provider.loadItem(forTypeIdentifier: "public.url", options: nil) { item, error in
                        defer { group.leave() }
                        guard error == nil else { return }
                        if let url = item as? URL {
                            let urlString = url.absoluteString
                            if !urls.contains(urlString) {
                                urls.append(urlString)
                            }
                        }
                    }
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }

            let sharedData: [String: Any] = [
                "text": texts.joined(separator: "\n\n"),
                "urls": urls,
                "images": imagePaths,
                "timestamp": Date().timeIntervalSince1970
            ]

            self.saveSharedData(sharedData)
            self.openMainApp()
            self.completeRequest()
        }
    }

    private func saveSharedData(_ data: [String: Any]) {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            print("[ShareViewController] Failed to get App Group container URL")
            return
        }

        let fileURL = containerURL.appendingPathComponent("shared-data.json")

        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
            try jsonData.write(to: fileURL)
            print("[ShareViewController] Saved shared data to: \(fileURL.path)")
        } catch {
            print("[ShareViewController] Error saving shared data: \(error)")
        }
    }

    private func openMainApp() {
        guard let url = URL(string: appURLScheme) else { return }

        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = responder?.next
        }

        // Fallback for newer iOS versions
        let selector = NSSelectorFromString("openURL:")
        UIApplication.shared.perform(selector, with: url)
    }

    private func completeRequest() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
