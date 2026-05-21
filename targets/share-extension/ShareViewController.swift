import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private let appGroupID = "group.com.b3nny1nc.recall"

    // MARK: - Colors
    private let colorBackground   = UIColor(hex: "#1A1A1A")
    private let colorCard         = UIColor(hex: "#2A2A2A")
    private let colorBorder       = UIColor(hex: "#3A3A3A")
    private let colorPrimary      = UIColor(hex: "#FF6B7A")
    private let colorTextPrimary  = UIColor(hex: "#FFFFFF")
    private let colorTextSecondary = UIColor(hex: "#B0B0B0")
    private let colorTextTertiary = UIColor(hex: "#808080")

    // MARK: - Parsed data
    private var parsedTexts: [String] = []
    private var parsedURLs: [String] = []
    private var parsedImagePaths: [String] = []
    private var firstImageData: Data?

    // MARK: - UI
    private var sheetView: UIView!
    private var blurView: UIVisualEffectView!
    private var previewCard: UIView!
    private var previewIconView: UIImageView!
    private var previewDomainLabel: UILabel!
    private var previewURLLabel: UILabel!
    private var previewImageView: UIImageView!
    private var previewFilenameLabel: UILabel!
    private var previewTextLabel: UILabel!
    private var noteTextView: UITextView!
    private var notePlaceholderLabel: UILabel!
    private var saveButton: UIButton!
    private var saveSpinner: UIActivityIndicatorView!
    private var cancelButton: UIButton!
    private var sheetBottomConstraint: NSLayoutConstraint!
    private var noteHeightConstraint: NSLayoutConstraint!

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.clear
        setupSheetUI()
        setupKeyboardObservers()
        processSharedItems()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        animateSheetIn()
    }

    // MARK: - Sheet UI

    private func setupSheetUI() {
        // Dimmed background tap to cancel
        let tapDismiss = UITapGestureRecognizer(target: self, action: #selector(handleCancel))
        view.addGestureRecognizer(tapDismiss)

        // Sheet container
        sheetView = UIView()
        sheetView.translatesAutoresizingMaskIntoConstraints = false
        sheetView.layer.cornerRadius = 20
        sheetView.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        sheetView.clipsToBounds = true
        view.addSubview(sheetView)

        // Blur background
        blurView = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
        blurView.translatesAutoresizingMaskIntoConstraints = false
        sheetView.addSubview(blurView)

        // Solid overlay on top of blur for the dark card feel
        let overlayView = UIView()
        overlayView.translatesAutoresizingMaskIntoConstraints = false
        overlayView.backgroundColor = colorBackground.withAlphaComponent(0.85)
        sheetView.addSubview(overlayView)

        // Content container (sits above blur + overlay)
        let contentView = UIView()
        contentView.translatesAutoresizingMaskIntoConstraints = false
        contentView.backgroundColor = .clear
        sheetView.addSubview(contentView)

        sheetBottomConstraint = sheetView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: 500)
        NSLayoutConstraint.activate([
            sheetView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            sheetView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            sheetBottomConstraint,

            blurView.topAnchor.constraint(equalTo: sheetView.topAnchor),
            blurView.leadingAnchor.constraint(equalTo: sheetView.leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: sheetView.trailingAnchor),
            blurView.bottomAnchor.constraint(equalTo: sheetView.bottomAnchor),

            overlayView.topAnchor.constraint(equalTo: sheetView.topAnchor),
            overlayView.leadingAnchor.constraint(equalTo: sheetView.leadingAnchor),
            overlayView.trailingAnchor.constraint(equalTo: sheetView.trailingAnchor),
            overlayView.bottomAnchor.constraint(equalTo: sheetView.bottomAnchor),

            contentView.topAnchor.constraint(equalTo: sheetView.topAnchor),
            contentView.leadingAnchor.constraint(equalTo: sheetView.leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: sheetView.trailingAnchor),
            contentView.bottomAnchor.constraint(equalTo: sheetView.bottomAnchor),
        ])

        buildContentLayout(in: contentView)
    }

    private func buildContentLayout(in container: UIView) {
        // Drag handle
        let handle = UIView()
        handle.translatesAutoresizingMaskIntoConstraints = false
        handle.backgroundColor = colorBorder
        handle.layer.cornerRadius = 2
        container.addSubview(handle)

        // Header row
        let headerRow = UIView()
        headerRow.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(headerRow)

        // App icon
        let iconConfig = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        let iconImage = UIImage(systemName: "bookmark.fill", withConfiguration: iconConfig)
        let iconView = UIImageView(image: iconImage)
        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.tintColor = colorPrimary
        iconView.contentMode = .scaleAspectFit
        headerRow.addSubview(iconView)

        // Title
        let titleLabel = UILabel()
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Save to Recall"
        titleLabel.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        titleLabel.textColor = colorTextPrimary
        headerRow.addSubview(titleLabel)

        // Close button
        let closeButton = UIButton(type: .custom)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        let closeConfig = UIImage.SymbolConfiguration(pointSize: 13, weight: .medium)
        let closeImage = UIImage(systemName: "xmark", withConfiguration: closeConfig)
        closeButton.setImage(closeImage, for: .normal)
        closeButton.tintColor = colorTextPrimary
        closeButton.backgroundColor = colorCard
        closeButton.layer.cornerRadius = 15
        closeButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)
        headerRow.addSubview(closeButton)

        // Preview card
        previewCard = makeCard()
        container.addSubview(previewCard)
        buildPreviewCardContent()

        // Note label
        let noteLabel = UILabel()
        noteLabel.translatesAutoresizingMaskIntoConstraints = false
        noteLabel.text = "NOTE"
        noteLabel.font = UIFont.systemFont(ofSize: 12, weight: .medium)
        noteLabel.textColor = colorTextTertiary
        noteLabel.letterSpacing(0.8)
        container.addSubview(noteLabel)

        // Note card
        let noteCard = makeCard()
        container.addSubview(noteCard)

        noteTextView = UITextView()
        noteTextView.translatesAutoresizingMaskIntoConstraints = false
        noteTextView.backgroundColor = .clear
        noteTextView.font = UIFont.systemFont(ofSize: 15)
        noteTextView.textColor = colorTextPrimary
        noteTextView.tintColor = colorPrimary
        noteTextView.delegate = self
        noteTextView.textContainerInset = UIEdgeInsets(top: 12, left: 10, bottom: 12, right: 10)
        noteCard.addSubview(noteTextView)

        notePlaceholderLabel = UILabel()
        notePlaceholderLabel.translatesAutoresizingMaskIntoConstraints = false
        notePlaceholderLabel.text = "Add a note (optional)"
        notePlaceholderLabel.font = UIFont.systemFont(ofSize: 15)
        notePlaceholderLabel.textColor = colorTextTertiary
        noteCard.addSubview(notePlaceholderLabel)

        // Save button
        saveButton = UIButton(type: .custom)
        saveButton.translatesAutoresizingMaskIntoConstraints = false
        saveButton.setTitle("Save to Recall", for: .normal)
        saveButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        saveButton.setTitleColor(colorTextPrimary, for: .normal)
        saveButton.backgroundColor = colorPrimary
        saveButton.layer.cornerRadius = 14
        saveButton.addTarget(self, action: #selector(handleSave), for: .touchUpInside)
        container.addSubview(saveButton)

        saveSpinner = UIActivityIndicatorView(style: .medium)
        saveSpinner.translatesAutoresizingMaskIntoConstraints = false
        saveSpinner.color = .white
        saveSpinner.hidesWhenStopped = true
        saveButton.addSubview(saveSpinner)

        // Cancel button
        cancelButton = UIButton(type: .custom)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 15)
        cancelButton.setTitleColor(colorTextSecondary, for: .normal)
        cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)
        container.addSubview(cancelButton)

        // Note height constraint (dynamic)
        noteHeightConstraint = noteTextView.heightAnchor.constraint(equalToConstant: 80)
        noteHeightConstraint.priority = .defaultHigh

        NSLayoutConstraint.activate([
            // Drag handle
            handle.topAnchor.constraint(equalTo: container.topAnchor, constant: 10),
            handle.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            handle.widthAnchor.constraint(equalToConstant: 40),
            handle.heightAnchor.constraint(equalToConstant: 4),

            // Header row
            headerRow.topAnchor.constraint(equalTo: handle.bottomAnchor, constant: 14),
            headerRow.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            headerRow.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),
            headerRow.heightAnchor.constraint(equalToConstant: 36),

            iconView.leadingAnchor.constraint(equalTo: headerRow.leadingAnchor),
            iconView.centerYAnchor.constraint(equalTo: headerRow.centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 20),
            iconView.heightAnchor.constraint(equalToConstant: 20),

            titleLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 8),
            titleLabel.centerYAnchor.constraint(equalTo: headerRow.centerYAnchor),

            closeButton.trailingAnchor.constraint(equalTo: headerRow.trailingAnchor),
            closeButton.centerYAnchor.constraint(equalTo: headerRow.centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 30),
            closeButton.heightAnchor.constraint(equalToConstant: 30),

            // Preview card
            previewCard.topAnchor.constraint(equalTo: headerRow.bottomAnchor, constant: 16),
            previewCard.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            previewCard.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),

            // Note label
            noteLabel.topAnchor.constraint(equalTo: previewCard.bottomAnchor, constant: 16),
            noteLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),

            // Note card
            noteCard.topAnchor.constraint(equalTo: noteLabel.bottomAnchor, constant: 6),
            noteCard.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            noteCard.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),

            // Note text view inside card
            noteTextView.topAnchor.constraint(equalTo: noteCard.topAnchor),
            noteTextView.leadingAnchor.constraint(equalTo: noteCard.leadingAnchor),
            noteTextView.trailingAnchor.constraint(equalTo: noteCard.trailingAnchor),
            noteTextView.bottomAnchor.constraint(equalTo: noteCard.bottomAnchor),
            noteHeightConstraint,

            // Placeholder
            notePlaceholderLabel.topAnchor.constraint(equalTo: noteCard.topAnchor, constant: 12),
            notePlaceholderLabel.leadingAnchor.constraint(equalTo: noteCard.leadingAnchor, constant: 14),

            // Save button
            saveButton.topAnchor.constraint(equalTo: noteCard.bottomAnchor, constant: 20),
            saveButton.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 20),
            saveButton.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -20),
            saveButton.heightAnchor.constraint(equalToConstant: 52),

            saveSpinner.centerXAnchor.constraint(equalTo: saveButton.centerXAnchor),
            saveSpinner.centerYAnchor.constraint(equalTo: saveButton.centerYAnchor),

            // Cancel button
            cancelButton.topAnchor.constraint(equalTo: saveButton.bottomAnchor, constant: 8),
            cancelButton.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            cancelButton.heightAnchor.constraint(equalToConstant: 44),
            cancelButton.bottomAnchor.constraint(lessThanOrEqualTo: container.safeAreaLayoutGuide.bottomAnchor, constant: -8),
        ])
    }

    private func buildPreviewCardContent() {
        // URL row
        let urlRow = UIView()
        urlRow.translatesAutoresizingMaskIntoConstraints = false
        previewCard.addSubview(urlRow)

        previewIconView = UIImageView()
        previewIconView.translatesAutoresizingMaskIntoConstraints = false
        previewIconView.contentMode = .scaleAspectFit
        previewIconView.tintColor = colorTextTertiary
        urlRow.addSubview(previewIconView)

        previewDomainLabel = UILabel()
        previewDomainLabel.translatesAutoresizingMaskIntoConstraints = false
        previewDomainLabel.font = UIFont.systemFont(ofSize: 13)
        previewDomainLabel.textColor = colorTextSecondary
        urlRow.addSubview(previewDomainLabel)

        previewURLLabel = UILabel()
        previewURLLabel.translatesAutoresizingMaskIntoConstraints = false
        previewURLLabel.font = UIFont.systemFont(ofSize: 13)
        previewURLLabel.textColor = colorTextTertiary
        previewURLLabel.numberOfLines = 2
        previewCard.addSubview(previewURLLabel)

        // Image row (hidden by default)
        previewImageView = UIImageView()
        previewImageView.translatesAutoresizingMaskIntoConstraints = false
        previewImageView.contentMode = .scaleAspectFill
        previewImageView.clipsToBounds = true
        previewImageView.layer.cornerRadius = 8
        previewImageView.isHidden = true
        previewCard.addSubview(previewImageView)

        previewFilenameLabel = UILabel()
        previewFilenameLabel.translatesAutoresizingMaskIntoConstraints = false
        previewFilenameLabel.font = UIFont.systemFont(ofSize: 13)
        previewFilenameLabel.textColor = colorTextSecondary
        previewFilenameLabel.numberOfLines = 2
        previewFilenameLabel.isHidden = true
        previewCard.addSubview(previewFilenameLabel)

        // Text preview (hidden by default)
        previewTextLabel = UILabel()
        previewTextLabel.translatesAutoresizingMaskIntoConstraints = false
        previewTextLabel.font = UIFont.systemFont(ofSize: 13)
        previewTextLabel.textColor = colorTextTertiary
        previewTextLabel.numberOfLines = 3
        previewTextLabel.isHidden = true
        previewCard.addSubview(previewTextLabel)

        NSLayoutConstraint.activate([
            urlRow.topAnchor.constraint(equalTo: previewCard.topAnchor, constant: 12),
            urlRow.leadingAnchor.constraint(equalTo: previewCard.leadingAnchor, constant: 12),
            urlRow.trailingAnchor.constraint(equalTo: previewCard.trailingAnchor, constant: -12),
            urlRow.heightAnchor.constraint(equalToConstant: 20),

            previewIconView.leadingAnchor.constraint(equalTo: urlRow.leadingAnchor),
            previewIconView.centerYAnchor.constraint(equalTo: urlRow.centerYAnchor),
            previewIconView.widthAnchor.constraint(equalToConstant: 16),
            previewIconView.heightAnchor.constraint(equalToConstant: 16),

            previewDomainLabel.leadingAnchor.constraint(equalTo: previewIconView.trailingAnchor, constant: 6),
            previewDomainLabel.centerYAnchor.constraint(equalTo: urlRow.centerYAnchor),
            previewDomainLabel.trailingAnchor.constraint(equalTo: urlRow.trailingAnchor),

            previewURLLabel.topAnchor.constraint(equalTo: urlRow.bottomAnchor, constant: 6),
            previewURLLabel.leadingAnchor.constraint(equalTo: previewCard.leadingAnchor, constant: 12),
            previewURLLabel.trailingAnchor.constraint(equalTo: previewCard.trailingAnchor, constant: -12),
            previewURLLabel.bottomAnchor.constraint(equalTo: previewCard.bottomAnchor, constant: -12),

            // Image layout
            previewImageView.topAnchor.constraint(equalTo: previewCard.topAnchor, constant: 12),
            previewImageView.leadingAnchor.constraint(equalTo: previewCard.leadingAnchor, constant: 12),
            previewImageView.widthAnchor.constraint(equalToConstant: 60),
            previewImageView.heightAnchor.constraint(equalToConstant: 60),
            previewImageView.bottomAnchor.constraint(lessThanOrEqualTo: previewCard.bottomAnchor, constant: -12),

            previewFilenameLabel.leadingAnchor.constraint(equalTo: previewImageView.trailingAnchor, constant: 12),
            previewFilenameLabel.centerYAnchor.constraint(equalTo: previewImageView.centerYAnchor),
            previewFilenameLabel.trailingAnchor.constraint(equalTo: previewCard.trailingAnchor, constant: -12),

            // Text preview layout
            previewTextLabel.topAnchor.constraint(equalTo: previewCard.topAnchor, constant: 12),
            previewTextLabel.leadingAnchor.constraint(equalTo: previewCard.leadingAnchor, constant: 12),
            previewTextLabel.trailingAnchor.constraint(equalTo: previewCard.trailingAnchor, constant: -12),
            previewTextLabel.bottomAnchor.constraint(equalTo: previewCard.bottomAnchor, constant: -12),
        ])
    }

    private func makeCard() -> UIView {
        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = colorCard
        card.layer.cornerRadius = 12
        card.layer.borderWidth = 1
        card.layer.borderColor = colorBorder.cgColor
        return card
    }

    // MARK: - Populate preview after parsing

    private func populatePreview() {
        if !parsedImagePaths.isEmpty, let imgData = firstImageData {
            // Image share mode
            showImagePreview(imageData: imgData)
        } else if !parsedURLs.isEmpty {
            // URL mode
            showURLPreview(urlString: parsedURLs[0])
        } else if !parsedTexts.isEmpty {
            // Text-only mode
            showTextPreview(text: parsedTexts[0])
        } else {
            // Fallback
            showTextPreview(text: "Shared content")
        }
    }

    private func showURLPreview(urlString: String) {
        let iconConfig = UIImage.SymbolConfiguration(pointSize: 14, weight: .regular)
        previewIconView.image = UIImage(systemName: "link", withConfiguration: iconConfig)

        if let url = URL(string: urlString), let host = url.host {
            let domain = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
            previewDomainLabel.text = domain
        } else {
            previewDomainLabel.text = urlString
        }
        previewURLLabel.text = urlString

        // Ensure URL mode views visible, others hidden
        previewIconView.isHidden = false
        previewDomainLabel.isHidden = false
        previewURLLabel.isHidden = false
        previewImageView.isHidden = true
        previewFilenameLabel.isHidden = true
        previewTextLabel.isHidden = true
    }

    private func showImagePreview(imageData: Data) {
        previewImageView.image = UIImage(data: imageData)
        previewFilenameLabel.text = "Shared image"

        previewImageView.isHidden = false
        previewFilenameLabel.isHidden = false
        previewIconView.isHidden = true
        previewDomainLabel.isHidden = true
        previewURLLabel.isHidden = true
        previewTextLabel.isHidden = true
    }

    private func showTextPreview(text: String) {
        let iconConfig = UIImage.SymbolConfiguration(pointSize: 14, weight: .regular)
        previewIconView.image = UIImage(systemName: "text.quote", withConfiguration: iconConfig)
        previewDomainLabel.text = "Text"
        let truncated = text.count > 80 ? String(text.prefix(80)) + "…" : text
        previewURLLabel.text = truncated

        previewIconView.isHidden = false
        previewDomainLabel.isHidden = false
        previewURLLabel.isHidden = false
        previewImageView.isHidden = true
        previewFilenameLabel.isHidden = true
        previewTextLabel.isHidden = true
    }

    // MARK: - Animation

    private func animateSheetIn() {
        sheetBottomConstraint.constant = 0
        UIView.animate(withDuration: 0.4, delay: 0, usingSpringWithDamping: 0.85, initialSpringVelocity: 0.5, options: .curveEaseOut) {
            self.view.layoutIfNeeded()
        }
    }

    private func animateSheetOut(completion: @escaping () -> Void) {
        sheetBottomConstraint.constant = 500
        UIView.animate(withDuration: 0.3, delay: 0, options: .curveEaseIn, animations: {
            self.view.layoutIfNeeded()
        }, completion: { _ in completion() })
    }

    // MARK: - Keyboard

    private func setupKeyboardObservers() {
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillShow(_:)), name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(keyboardWillHide(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)
    }

    @objc private func keyboardWillShow(_ notification: Notification) {
        guard let info = notification.userInfo,
              let keyboardFrame = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
              let duration = info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else { return }
        let keyboardHeight = keyboardFrame.height
        sheetBottomConstraint.constant = -keyboardHeight
        UIView.animate(withDuration: duration) { self.view.layoutIfNeeded() }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        guard let info = notification.userInfo,
              let duration = info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else { return }
        sheetBottomConstraint.constant = 0
        UIView.animate(withDuration: duration) { self.view.layoutIfNeeded() }
    }

    // MARK: - Actions

    @objc private func handleSave() {
        print("[ShareViewController] Save button tapped")
        noteTextView.resignFirstResponder()

        saveButton.isEnabled = false
        saveButton.alpha = 0.5
        saveButton.setTitle("", for: .normal)
        saveSpinner.startAnimating()

        let noteText = noteTextView.text ?? ""
        let sharedText = parsedTexts.joined(separator: "\n\n")
        let combinedText: String
        if noteText.isEmpty {
            combinedText = sharedText
        } else if sharedText.isEmpty {
            combinedText = noteText
        } else {
            combinedText = noteText + "\n\n" + sharedText
        }

        let sharedData: [String: Any] = [
            "text": combinedText,
            "urls": parsedURLs,
            "images": parsedImagePaths,
            "timestamp": Date().timeIntervalSince1970
        ]

        print("[ShareViewController] Saving shared data — urls: \(parsedURLs.count), images: \(parsedImagePaths.count), hasNote: \(!noteText.isEmpty)")
        saveSharedData(sharedData)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            print("[ShareViewController] Completing extension request after save")
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    @objc private func handleCancel() {
        print("[ShareViewController] Cancel tapped — dismissing extension")
        noteTextView?.resignFirstResponder()
        animateSheetOut { [weak self] in
            self?.extensionContext?.cancelRequest(withError: NSError(domain: "UserCancelled", code: 0))
        }
    }

    // MARK: - Parse shared items

    private func processSharedItems() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }

        var texts: [String] = []
        var urls: [String] = []
        var imagePaths: [String] = []
        var capturedImageData: Data?

        let outerGroup = DispatchGroup()

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
                // Check ALL types independently — do NOT use else if
                // A single provider can conform to multiple types simultaneously

                // Handle images
                if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    outerGroup.enter()
                    provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) { [weak self] item, error in
                        defer { outerGroup.leave() }
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
                            if capturedImageData == nil {
                                capturedImageData = data
                            }
                        }
                    }
                }

                // Handle typed URLs (UTType.url)
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    outerGroup.enter()
                    provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
                        defer { outerGroup.leave() }
                        guard error == nil else { return }
                        if let url = item as? URL {
                            let urlString = url.absoluteString
                            // Only add if not already captured and not a file:// URL (those are images/files, not web links)
                            if !urls.contains(urlString) && !urlString.hasPrefix("file://") {
                                urls.append(urlString)
                            }
                        }
                    }
                }

                // Handle plain text
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    outerGroup.enter()
                    provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, error in
                        defer { outerGroup.leave() }
                        guard error == nil else { return }
                        if let text = item as? String, !text.isEmpty {
                            texts.append(text)
                        }
                    }
                }

                // Handle public.url (Safari, Chrome, Instagram link shares)
                if provider.hasItemConformingToTypeIdentifier("public.url") &&
                   !provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    // Only load as public.url if UTType.url wasn't already handled above
                    // to avoid duplicate entries
                    outerGroup.enter()
                    provider.loadItem(forTypeIdentifier: "public.url", options: nil) { item, error in
                        defer { outerGroup.leave() }
                        guard error == nil else { return }
                        if let url = item as? URL {
                            let urlString = url.absoluteString
                            if !urls.contains(urlString) && !urlString.hasPrefix("file://") {
                                urls.append(urlString)
                            }
                        }
                    }
                }
            }
        }

        outerGroup.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            self.parsedTexts = texts
            self.parsedURLs = urls
            self.parsedImagePaths = imagePaths
            self.firstImageData = capturedImageData
            print("[ShareViewController] Parsed — urls: \(urls.count), images: \(imagePaths.count), texts: \(texts.count)")
            self.populatePreview()
        }
    }

    // MARK: - Save to App Group

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
}

// MARK: - UITextViewDelegate

extension ShareViewController: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        notePlaceholderLabel.isHidden = !textView.text.isEmpty
        let fittingHeight = min(max(textView.contentSize.height, 80), 160)
        if noteHeightConstraint.constant != fittingHeight {
            noteHeightConstraint.constant = fittingHeight
            UIView.animate(withDuration: 0.2) { self.view.layoutIfNeeded() }
        }
    }

    func textViewDidBeginEditing(_ textView: UITextView) {
        notePlaceholderLabel.isHidden = true
    }

    func textViewDidEndEditing(_ textView: UITextView) {
        notePlaceholderLabel.isHidden = !textView.text.isEmpty
    }
}

// MARK: - UIColor hex init

private extension UIColor {
    convenience init(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.hasPrefix("#") ? String(hexSanitized.dropFirst()) : hexSanitized
        var rgb: UInt64 = 0
        Scanner(string: hexSanitized).scanHexInt64(&rgb)
        let r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
        let g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
        let b = CGFloat(rgb & 0x0000FF) / 255.0
        self.init(red: r, green: g, blue: b, alpha: 1.0)
    }
}

// MARK: - UILabel letter spacing helper

private extension UILabel {
    func letterSpacing(_ spacing: CGFloat) {
        guard let text = self.text else { return }
        let attributed = NSAttributedString(string: text, attributes: [
            .kern: spacing,
            .font: self.font as Any,
            .foregroundColor: self.textColor as Any
        ])
        self.attributedText = attributed
    }
}
