import UIKit
import Social
import MobileCoreServices
import UniformTypeIdentifiers
import Security

class ShareViewController: UIViewController {

    private let appGroupID = "group.com.b3nny1nc.recall"
    private let keychainService     = "com.b3nny1nc.recall.auth"
    private let keychainAccount     = "supabase-session"
    private let keychainAccessGroup = "9PWN6F3TK8.com.b3nny1nc.recall"

    private var supabaseURL: String {
        return Bundle.main.infoDictionary?["SupabaseURL"] as? String ?? ""
    }
    private var supabaseAnonKey: String {
        return Bundle.main.infoDictionary?["SupabaseAnonKey"] as? String ?? ""
    }

    // MARK: - Colors
    private let colorBackground    = UIColor(hex: "#1A1A1A")
    private let colorCard          = UIColor(hex: "#2A2A2A")
    private let colorBorder        = UIColor(hex: "#3A3A3A")
    private let colorPrimary       = UIColor(hex: "#FF6B7A")
    private let colorTextPrimary   = UIColor(hex: "#FFFFFF")
    private let colorTextSecondary = UIColor(hex: "#B0B0B0")
    private let colorTextTertiary  = UIColor(hex: "#808080")

    // MARK: - Parsed data
    private var parsedTexts: [String] = []
    private var parsedURLs: [String] = []
    private var parsedImagePaths: [String] = []
    private var parsedDocumentPaths: [String] = []
    private var parsedDocumentNames: [String] = []
    private var firstImageData: Data?

    // MARK: - Scraped metadata
    private var scrapedTitle: String?
    private var scrapedDescription: String?
    private var scrapedImageURL: String?
    private var isScraping = false

    // MARK: - UI
    private var noteTextView: UITextView!
    private var notePlaceholderLabel: UILabel!
    private var saveButton: UIButton!
    private var saveSpinner: UIActivityIndicatorView!
    private var statusLabel: UILabel!
    private var errorBannerView: UIView!
    private var errorStageLbl: UILabel!
    private var errorDetailLbl: UILabel!
    private var retryButton: UIButton!
    private var isAuthFailure: Bool = false
    private var sharedContentLabel: UILabel!
    private var attachmentScrollView: UIScrollView!
    private var attachmentStackView: UIStackView!
    private var attachmentStripContainer: UIView!
    private var toolbarView: UIView!
    private var toolbarBottomConstraint: NSLayoutConstraint!
    private var contentScrollView: UIScrollView!

    // Attachment item tracking for removal
    private var attachmentImageViews: [UIImageView] = []
    private var attachmentFileViews: [UIView] = []

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = colorBackground
        buildFullScreenLayout()
        setupKeyboardObservers()
        processSharedItems()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        noteTextView.becomeFirstResponder()
    }

    // MARK: - Full-Screen Layout

    private func buildFullScreenLayout() {
        // ── Top-left header: app icon + "Recall" label ────────────────────────
        let headerContainer = UIView()
        headerContainer.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headerContainer)

        // App icon (32×32, cornerRadius 7) — loaded from RecallAppIcon named image set (UIImage(named:"AppIcon") returns nil on iOS 18+)
        let appIconView: UIView
        if let appIconImage = UIImage(named: "RecallAppIcon") {
            let iconImageView = UIImageView(image: appIconImage)
            iconImageView.translatesAutoresizingMaskIntoConstraints = false
            iconImageView.contentMode = .scaleAspectFill
            iconImageView.clipsToBounds = true
            iconImageView.layer.cornerRadius = 7
            headerContainer.addSubview(iconImageView)
            NSLayoutConstraint.activate([
                iconImageView.leadingAnchor.constraint(equalTo: headerContainer.leadingAnchor),
                iconImageView.centerYAnchor.constraint(equalTo: headerContainer.centerYAnchor),
                iconImageView.widthAnchor.constraint(equalToConstant: 32),
                iconImageView.heightAnchor.constraint(equalToConstant: 32),
            ])
            appIconView = iconImageView
        } else {
            // Fallback: colored view with "R" label
            let fallbackView = UIView()
            fallbackView.translatesAutoresizingMaskIntoConstraints = false
            fallbackView.backgroundColor = colorPrimary
            fallbackView.layer.cornerRadius = 7
            let rLabel = UILabel()
            rLabel.translatesAutoresizingMaskIntoConstraints = false
            rLabel.text = "R"
            rLabel.font = UIFont.systemFont(ofSize: 18, weight: .bold)
            rLabel.textColor = .white
            rLabel.textAlignment = .center
            fallbackView.addSubview(rLabel)
            headerContainer.addSubview(fallbackView)
            NSLayoutConstraint.activate([
                fallbackView.leadingAnchor.constraint(equalTo: headerContainer.leadingAnchor),
                fallbackView.centerYAnchor.constraint(equalTo: headerContainer.centerYAnchor),
                fallbackView.widthAnchor.constraint(equalToConstant: 32),
                fallbackView.heightAnchor.constraint(equalToConstant: 32),
                rLabel.centerXAnchor.constraint(equalTo: fallbackView.centerXAnchor),
                rLabel.centerYAnchor.constraint(equalTo: fallbackView.centerYAnchor),
            ])
            appIconView = fallbackView
        }

        let headerLabel = UILabel()
        headerLabel.translatesAutoresizingMaskIntoConstraints = false
        headerLabel.text = "Recall"
        headerLabel.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        headerLabel.textColor = colorTextPrimary
        headerContainer.addSubview(headerLabel)

        NSLayoutConstraint.activate([
            headerLabel.leadingAnchor.constraint(equalTo: appIconView.trailingAnchor, constant: 10),
            headerLabel.centerYAnchor.constraint(equalTo: headerContainer.centerYAnchor),
            headerLabel.trailingAnchor.constraint(equalTo: headerContainer.trailingAnchor),
        ])

        // ── Close button (top-right) ──────────────────────────────────────────
        let closeButton = UIButton(type: .custom)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        let closeConfig = UIImage.SymbolConfiguration(pointSize: 14, weight: .medium)
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: closeConfig), for: .normal)
        closeButton.tintColor = colorTextPrimary
        closeButton.backgroundColor = colorCard
        closeButton.layer.cornerRadius = 18
        closeButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)
        view.addSubview(closeButton)
        view.bringSubviewToFront(closeButton)

        // ── Bottom toolbar ────────────────────────────────────────────────────
        toolbarView = UIView()
        toolbarView.translatesAutoresizingMaskIntoConstraints = false
        toolbarView.backgroundColor = colorBackground.withAlphaComponent(0.95)
        view.addSubview(toolbarView)

        // Toolbar top border
        let borderLine = UIView()
        borderLine.translatesAutoresizingMaskIntoConstraints = false
        borderLine.backgroundColor = colorBorder
        toolbarView.addSubview(borderLine)

        // Save pill button
        var config = UIButton.Configuration.filled()
        config.title = "Create Recall"
        config.baseForegroundColor = .white
        config.baseBackgroundColor = colorPrimary
        config.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 20, bottom: 10, trailing: 20)
        config.cornerStyle = .capsule
        let saveButton = UIButton(configuration: config)
        saveButton.translatesAutoresizingMaskIntoConstraints = false
        saveButton.addTarget(self, action: #selector(handleSave), for: .touchUpInside)
        self.saveButton = saveButton
        toolbarView.addSubview(saveButton)

        saveSpinner = UIActivityIndicatorView(style: .medium)
        saveSpinner.translatesAutoresizingMaskIntoConstraints = false
        saveSpinner.color = .white
        saveSpinner.hidesWhenStopped = true
        saveButton.addSubview(saveSpinner)

        // ── Content scroll view (starts below the header row) ────────────────
        contentScrollView = UIScrollView()
        contentScrollView.translatesAutoresizingMaskIntoConstraints = false
        contentScrollView.keyboardDismissMode = .interactive
        contentScrollView.alwaysBounceVertical = true
        view.addSubview(contentScrollView)

        let contentContainer = UIView()
        contentContainer.translatesAutoresizingMaskIntoConstraints = false
        contentScrollView.addSubview(contentContainer)

        // ── Note text view ────────────────────────────────────────────────────
        noteTextView = UITextView()
        noteTextView.translatesAutoresizingMaskIntoConstraints = false
        noteTextView.backgroundColor = .clear
        noteTextView.font = UIFont.systemFont(ofSize: 17)
        noteTextView.textColor = colorTextPrimary
        noteTextView.tintColor = colorPrimary
        noteTextView.delegate = self
        noteTextView.textContainerInset = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
        noteTextView.textContainer.lineFragmentPadding = 0
        noteTextView.isScrollEnabled = false
        contentContainer.addSubview(noteTextView)

        notePlaceholderLabel = UILabel()
        notePlaceholderLabel.translatesAutoresizingMaskIntoConstraints = false
        notePlaceholderLabel.text = "Add a note…"
        notePlaceholderLabel.font = UIFont.systemFont(ofSize: 17)
        notePlaceholderLabel.textColor = colorTextTertiary
        contentContainer.addSubview(notePlaceholderLabel)

        // ── Shared content label ──────────────────────────────────────────────
        sharedContentLabel = UILabel()
        sharedContentLabel.translatesAutoresizingMaskIntoConstraints = false
        sharedContentLabel.numberOfLines = 3
        sharedContentLabel.isHidden = true
        contentContainer.addSubview(sharedContentLabel)

        // ── Status label ──────────────────────────────────────────────────────
        statusLabel = UILabel()
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.font = UIFont.systemFont(ofSize: 13)
        statusLabel.textColor = colorTextSecondary
        statusLabel.textAlignment = .center
        statusLabel.isHidden = true
        contentContainer.addSubview(statusLabel)

        // ── Error banner ──────────────────────────────────────────────────────
        errorBannerView = UIView()
        errorBannerView.translatesAutoresizingMaskIntoConstraints = false
        errorBannerView.backgroundColor = colorCard
        errorBannerView.layer.cornerRadius = 8
        errorBannerView.isHidden = true

        // Left accent border
        let accentBorder = UIView()
        accentBorder.translatesAutoresizingMaskIntoConstraints = false
        accentBorder.backgroundColor = colorPrimary
        accentBorder.layer.cornerRadius = 1.5
        errorBannerView.addSubview(accentBorder)

        errorStageLbl = UILabel()
        errorStageLbl.translatesAutoresizingMaskIntoConstraints = false
        errorStageLbl.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
        errorStageLbl.textColor = colorTextPrimary
        errorBannerView.addSubview(errorStageLbl)

        errorDetailLbl = UILabel()
        errorDetailLbl.translatesAutoresizingMaskIntoConstraints = false
        errorDetailLbl.font = UIFont.systemFont(ofSize: 12)
        errorDetailLbl.textColor = colorTextSecondary
        errorDetailLbl.numberOfLines = 4
        errorBannerView.addSubview(errorDetailLbl)

        contentContainer.addSubview(errorBannerView)

        // Retry button — shown only for auth failures
        retryButton = UIButton(type: .system)
        retryButton.translatesAutoresizingMaskIntoConstraints = false
        retryButton.setTitle("Retry", for: .normal)
        retryButton.titleLabel?.font = UIFont.systemFont(ofSize: 12, weight: .semibold)
        retryButton.setTitleColor(colorPrimary, for: .normal)
        retryButton.isHidden = true
        retryButton.addTarget(self, action: #selector(handleRetryAuth), for: .touchUpInside)
        errorBannerView.addSubview(retryButton)

        // ── Attachment strip ──────────────────────────────────────────────────
        attachmentStripContainer = UIView()
        attachmentStripContainer.translatesAutoresizingMaskIntoConstraints = false
        attachmentStripContainer.isHidden = true
        contentContainer.addSubview(attachmentStripContainer)

        attachmentScrollView = UIScrollView()
        attachmentScrollView.translatesAutoresizingMaskIntoConstraints = false
        attachmentScrollView.showsHorizontalScrollIndicator = false
        attachmentScrollView.alwaysBounceHorizontal = true
        attachmentStripContainer.addSubview(attachmentScrollView)

        attachmentStackView = UIStackView()
        attachmentStackView.translatesAutoresizingMaskIntoConstraints = false
        attachmentStackView.axis = .horizontal
        attachmentStackView.spacing = 10
        attachmentStackView.alignment = .center
        attachmentScrollView.addSubview(attachmentStackView)

        // ── Toolbar bottom constraint (keyboard avoidance) ────────────────────
        toolbarBottomConstraint = toolbarView.bottomAnchor.constraint(equalTo: view.bottomAnchor)

        NSLayoutConstraint.activate([
            // Header container (top-left, vertically centred with close button)
            headerContainer.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 14),
            headerContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            headerContainer.heightAnchor.constraint(equalToConstant: 36),

            // Close button (top-right, same vertical band as header)
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
            closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            closeButton.widthAnchor.constraint(equalToConstant: 36),
            closeButton.heightAnchor.constraint(equalToConstant: 36),

            // Toolbar
            toolbarView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbarView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbarView.heightAnchor.constraint(equalToConstant: 56),
            toolbarBottomConstraint,

            borderLine.topAnchor.constraint(equalTo: toolbarView.topAnchor),
            borderLine.leadingAnchor.constraint(equalTo: toolbarView.leadingAnchor),
            borderLine.trailingAnchor.constraint(equalTo: toolbarView.trailingAnchor),
            borderLine.heightAnchor.constraint(equalToConstant: 0.5),

            saveButton.trailingAnchor.constraint(equalTo: toolbarView.trailingAnchor, constant: -16),
            saveButton.centerYAnchor.constraint(equalTo: toolbarView.centerYAnchor),

            saveSpinner.centerXAnchor.constraint(equalTo: saveButton.centerXAnchor),
            saveSpinner.centerYAnchor.constraint(equalTo: saveButton.centerYAnchor),

            // Content scroll view — starts below the header row (56pt below safeArea top)
            contentScrollView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 56),
            contentScrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentScrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentScrollView.bottomAnchor.constraint(equalTo: toolbarView.topAnchor),

            // Content container inside scroll view
            contentContainer.topAnchor.constraint(equalTo: contentScrollView.topAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: contentScrollView.leadingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: contentScrollView.trailingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: contentScrollView.bottomAnchor),
            contentContainer.widthAnchor.constraint(equalTo: contentScrollView.widthAnchor),

            // Note text view — scroll view already clears the header, just add normal padding
            noteTextView.topAnchor.constraint(equalTo: contentContainer.topAnchor, constant: 16),
            noteTextView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor, constant: 20),
            noteTextView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor, constant: -20),

            notePlaceholderLabel.topAnchor.constraint(equalTo: noteTextView.topAnchor),
            notePlaceholderLabel.leadingAnchor.constraint(equalTo: noteTextView.leadingAnchor),

            // Shared content label
            sharedContentLabel.topAnchor.constraint(equalTo: noteTextView.bottomAnchor, constant: 12),
            sharedContentLabel.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor, constant: 20),
            sharedContentLabel.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor, constant: -20),

            // Status label
            statusLabel.topAnchor.constraint(equalTo: sharedContentLabel.bottomAnchor, constant: 12),
            statusLabel.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor, constant: -20),

            // Error banner
            errorBannerView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 8),
            errorBannerView.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor, constant: 16),
            errorBannerView.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor, constant: -16),

            accentBorder.topAnchor.constraint(equalTo: errorBannerView.topAnchor, constant: 8),
            accentBorder.bottomAnchor.constraint(equalTo: errorBannerView.bottomAnchor, constant: -8),
            accentBorder.leadingAnchor.constraint(equalTo: errorBannerView.leadingAnchor, constant: 8),
            accentBorder.widthAnchor.constraint(equalToConstant: 3),

            errorStageLbl.topAnchor.constraint(equalTo: errorBannerView.topAnchor, constant: 10),
            errorStageLbl.leadingAnchor.constraint(equalTo: accentBorder.trailingAnchor, constant: 10),
            errorStageLbl.trailingAnchor.constraint(equalTo: errorBannerView.trailingAnchor, constant: -10),

            errorDetailLbl.topAnchor.constraint(equalTo: errorStageLbl.bottomAnchor, constant: 4),
            errorDetailLbl.leadingAnchor.constraint(equalTo: accentBorder.trailingAnchor, constant: 10),
            errorDetailLbl.trailingAnchor.constraint(equalTo: errorBannerView.trailingAnchor, constant: -10),
            errorDetailLbl.bottomAnchor.constraint(equalTo: retryButton.topAnchor, constant: -6),

            retryButton.leadingAnchor.constraint(equalTo: accentBorder.trailingAnchor, constant: 10),
            retryButton.bottomAnchor.constraint(equalTo: errorBannerView.bottomAnchor, constant: -10),

            // Attachment strip
            attachmentStripContainer.topAnchor.constraint(equalTo: errorBannerView.bottomAnchor, constant: 8),
            attachmentStripContainer.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            attachmentStripContainer.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            attachmentStripContainer.heightAnchor.constraint(equalToConstant: 88),
            attachmentStripContainer.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor, constant: -12),

            attachmentScrollView.topAnchor.constraint(equalTo: attachmentStripContainer.topAnchor, constant: 12),
            attachmentScrollView.bottomAnchor.constraint(equalTo: attachmentStripContainer.bottomAnchor, constant: -12),
            attachmentScrollView.leadingAnchor.constraint(equalTo: attachmentStripContainer.leadingAnchor),
            attachmentScrollView.trailingAnchor.constraint(equalTo: attachmentStripContainer.trailingAnchor),

            attachmentStackView.topAnchor.constraint(equalTo: attachmentScrollView.topAnchor),
            attachmentStackView.bottomAnchor.constraint(equalTo: attachmentScrollView.bottomAnchor),
            attachmentStackView.leadingAnchor.constraint(equalTo: attachmentScrollView.leadingAnchor, constant: 16),
            attachmentStackView.trailingAnchor.constraint(equalTo: attachmentScrollView.trailingAnchor, constant: -16),
            attachmentStackView.heightAnchor.constraint(equalTo: attachmentScrollView.heightAnchor),
        ])
    }

    // MARK: - Populate preview after parsing

    private func populatePreview() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.populateSharedContentLabel()
            self.populateAttachmentStrip()
        }
    }

    private func populateSharedContentLabel() {
        if !parsedURLs.isEmpty {
            let urlString = parsedURLs[0]
            sharedContentLabel.text = urlString
            sharedContentLabel.font = UIFont.systemFont(ofSize: 15)
            sharedContentLabel.textColor = colorPrimary
            sharedContentLabel.numberOfLines = 2
            sharedContentLabel.isUserInteractionEnabled = true
            let tap = UITapGestureRecognizer(target: self, action: #selector(openSharedURL))
            sharedContentLabel.addGestureRecognizer(tap)
            sharedContentLabel.isHidden = false
        } else if parsedImagePaths.isEmpty && parsedDocumentPaths.isEmpty && !parsedTexts.isEmpty {
            let text = parsedTexts[0]
            let truncated = text.count > 120 ? String(text.prefix(120)) + "…" : text
            sharedContentLabel.text = truncated
            sharedContentLabel.font = UIFont.italicSystemFont(ofSize: 14)
            sharedContentLabel.textColor = colorTextSecondary
            sharedContentLabel.numberOfLines = 3
            sharedContentLabel.isUserInteractionEnabled = false
            sharedContentLabel.isHidden = false
        } else {
            sharedContentLabel.isHidden = true
        }
    }

    @objc private func openSharedURL() {
        guard let urlString = parsedURLs.first, let url = URL(string: urlString) else { return }
        print("[ShareViewController] Opening shared URL in Safari: \(urlString)")
        self.extensionContext?.open(url, completionHandler: nil)
    }

    private func populateAttachmentStrip() {
        // Clear existing items
        attachmentStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }
        attachmentImageViews.removeAll()
        attachmentFileViews.removeAll()

        var itemCount = 0

        // Image thumbnails
        for (index, imagePath) in parsedImagePaths.prefix(10).enumerated() {
            guard let imageData = try? Data(contentsOf: URL(fileURLWithPath: imagePath)),
                  let image = UIImage(data: imageData) else { continue }
            let container = makeImageAttachmentView(image: image, index: index)
            attachmentStackView.addArrangedSubview(container)
            attachmentImageViews.append(container.subviews.compactMap { $0 as? UIImageView }.first ?? UIImageView())
            itemCount += 1
            if itemCount >= 10 { break }
        }

        // Document chips
        for (index, fileName) in parsedDocumentNames.prefix(10 - itemCount).enumerated() {
            let chip = makeDocumentChipView(fileName: fileName, index: index)
            attachmentStackView.addArrangedSubview(chip)
            attachmentFileViews.append(chip)
            itemCount += 1
            if itemCount >= 10 { break }
        }

        attachmentStripContainer.isHidden = itemCount == 0
    }

    private func makeImageAttachmentView(image: UIImage, index: Int) -> UIView {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.widthAnchor.constraint(equalToConstant: 64).isActive = true
        container.heightAnchor.constraint(equalToConstant: 64).isActive = true

        let imageView = UIImageView(image: image)
        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFill
        imageView.clipsToBounds = true
        imageView.layer.cornerRadius = 10
        container.addSubview(imageView)

        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: container.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        // Remove badge
        let badge = makeRemoveBadge()
        badge.tag = index
        badge.addTarget(self, action: #selector(removeImageAttachment(_:)), for: .touchUpInside)
        container.addSubview(badge)
        NSLayoutConstraint.activate([
            badge.topAnchor.constraint(equalTo: container.topAnchor, constant: -4),
            badge.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: 4),
            badge.widthAnchor.constraint(equalToConstant: 18),
            badge.heightAnchor.constraint(equalToConstant: 18),
        ])

        return container
    }

    private func makeDocumentChipView(fileName: String, index: Int) -> UIView {
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = colorCard
        container.layer.cornerRadius = 8
        container.layer.borderWidth = 1
        container.layer.borderColor = colorBorder.cgColor

        let ext = (fileName as NSString).pathExtension.lowercased()
        let iconName = ext == "pdf" ? "doc.fill" : "doc.text.fill"
        let iconConfig = UIImage.SymbolConfiguration(pointSize: 16, weight: .regular)
        let iconView = UIImageView(image: UIImage(systemName: iconName, withConfiguration: iconConfig))
        iconView.translatesAutoresizingMaskIntoConstraints = false
        iconView.tintColor = colorTextSecondary
        iconView.contentMode = .scaleAspectFit
        container.addSubview(iconView)

        let nameLabel = UILabel()
        nameLabel.translatesAutoresizingMaskIntoConstraints = false
        let baseName = (fileName as NSString).deletingPathExtension
        let truncatedBase = baseName.count > 20 ? String(baseName.prefix(20)) : baseName
        let displayName = ext.isEmpty ? truncatedBase : "\(truncatedBase).\(ext)"
        nameLabel.text = displayName
        nameLabel.font = UIFont.systemFont(ofSize: 13)
        nameLabel.textColor = colorTextSecondary
        container.addSubview(nameLabel)

        let badge = makeRemoveBadge()
        badge.tag = index
        badge.addTarget(self, action: #selector(removeDocumentAttachment(_:)), for: .touchUpInside)
        container.addSubview(badge)

        NSLayoutConstraint.activate([
            iconView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10),
            iconView.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 18),
            iconView.heightAnchor.constraint(equalToConstant: 18),

            nameLabel.leadingAnchor.constraint(equalTo: iconView.trailingAnchor, constant: 6),
            nameLabel.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            nameLabel.trailingAnchor.constraint(equalTo: badge.leadingAnchor, constant: -6),

            badge.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -6),
            badge.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            badge.widthAnchor.constraint(equalToConstant: 18),
            badge.heightAnchor.constraint(equalToConstant: 18),

            container.heightAnchor.constraint(equalToConstant: 36),
        ])

        // Fix leading/trailing to drive intrinsic width
        let leadingPin = iconView.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10)
        let trailingPin = badge.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -6)
        leadingPin.isActive = true
        trailingPin.isActive = true

        return container
    }

    private func makeRemoveBadge() -> UIButton {
        let btn = UIButton(type: .custom)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.backgroundColor = colorCard
        btn.layer.cornerRadius = 9
        btn.layer.borderWidth = 1
        btn.layer.borderColor = colorBorder.cgColor
        let xConfig = UIImage.SymbolConfiguration(pointSize: 10, weight: .medium)
        btn.setImage(UIImage(systemName: "xmark", withConfiguration: xConfig), for: .normal)
        btn.tintColor = colorTextSecondary
        return btn
    }

    @objc private func removeImageAttachment(_ sender: UIButton) {
        let index = sender.tag
        print("[ShareViewController] Remove image attachment at index \(index)")
        guard index < parsedImagePaths.count else { return }
        parsedImagePaths.remove(at: index)
        populateAttachmentStrip()
    }

    @objc private func removeDocumentAttachment(_ sender: UIButton) {
        let index = sender.tag
        print("[ShareViewController] Remove document attachment at index \(index)")
        guard index < parsedDocumentPaths.count else { return }
        parsedDocumentPaths.remove(at: index)
        parsedDocumentNames.remove(at: index)
        populateAttachmentStrip()
    }

    // MARK: - URL Scraping

    private func scrapeURLMetadata(urlString: String) {
        isScraping = true

        guard let url = URL(string: urlString) else {
            isScraping = false
            return
        }

        var request = URLRequest(url: url, timeoutInterval: 8)
        request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            self.isScraping = false

            guard let data = data, error == nil,
                  let rawHtml = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
                return
            }
            let maxBytes = 512 * 1024
            let html: String
            if rawHtml.utf8.count > maxBytes {
                html = String(rawHtml.prefix(maxBytes))
            } else {
                html = rawHtml
            }

            let metaTags = self.extractAllMetaTags(html: html)

            let title = (metaTags["og:title"]
                ?? metaTags["twitter:title"]
                ?? self.extractHTMLTitle(html: html))
                .map { self.decodeHtmlEntities($0) }
            let description = (metaTags["og:description"]
                ?? metaTags["twitter:description"]
                ?? metaTags["description"])
                .map { self.decodeHtmlEntities($0) }
            let imageURLString = metaTags["og:image"]
                ?? metaTags["og:image:secure_url"]
                ?? metaTags["og:image:url"]
                ?? metaTags["twitter:image"]
                ?? metaTags["twitter:image:src"]
            let siteName = (metaTags["og:site_name"] ?? metaTags["application-name"])
                .map { self.decodeHtmlEntities($0) }

            self.scrapedTitle = title
            self.scrapedDescription = description
            self.scrapedImageURL = imageURLString

            print("[ShareViewController] Scraped metadata — title: \(title ?? "nil"), siteName: \(siteName ?? "nil"), hasImage: \(imageURLString != nil)")
        }.resume()
    }

    // MARK: - HTML Parsing Helpers

    private func extractAllMetaTags(html: String) -> [String: String] {
        var tags: [String: String] = [:]
        guard let metaRegex = try? NSRegularExpression(
            pattern: "<meta\\s+([^>]*?)/?>",
            options: [.caseInsensitive, .dotMatchesLineSeparators]
        ) else { return tags }

        let metaMatches = metaRegex.matches(in: html, range: NSRange(html.startIndex..., in: html))
        for match in metaMatches {
            guard match.numberOfRanges >= 2,
                  let attrsRange = Range(match.range(at: 1), in: html) else { continue }
            let attrs = String(html[attrsRange])

            let keyRegex = try? NSRegularExpression(
                pattern: "(?:property|name)\\s*=\\s*[\"']([^\"']+)[\"']",
                options: [.caseInsensitive]
            )
            let contentRegex = try? NSRegularExpression(
                pattern: "content\\s*=\\s*[\"']([^\"']*)[\"']",
                options: [.caseInsensitive]
            )

            guard let keyMatch = keyRegex?.firstMatch(in: attrs, range: NSRange(attrs.startIndex..., in: attrs)),
                  keyMatch.numberOfRanges >= 2,
                  let keyRange = Range(keyMatch.range(at: 1), in: attrs),
                  let contentMatch = contentRegex?.firstMatch(in: attrs, range: NSRange(attrs.startIndex..., in: attrs)),
                  contentMatch.numberOfRanges >= 2,
                  let contentRange = Range(contentMatch.range(at: 1), in: attrs) else { continue }

            let key = String(attrs[keyRange]).lowercased()
            let value = String(attrs[contentRange])
            if tags[key] == nil {
                tags[key] = value
            }
        }
        return tags
    }

    private func extractHTMLTitle(html: String) -> String? {
        if let regex = try? NSRegularExpression(pattern: "<title[^>]*>([^<]+)</title>", options: .caseInsensitive),
           let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
           let range = Range(match.range(at: 1), in: html) {
            return String(html[range]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return nil
    }

    private func decodeHtmlEntities(_ text: String) -> String {
        if text.isEmpty { return text }
        var result = text

        let namedEntities: [(String, String)] = [
            ("&amp;", "&"),
            ("&lt;", "<"),
            ("&gt;", ">"),
            ("&quot;", "\""),
            ("&apos;", "'"),
            ("&nbsp;", " "),
            ("&ldquo;", "\u{201C}"),
            ("&rdquo;", "\u{201D}"),
            ("&lsquo;", "\u{2018}"),
            ("&rsquo;", "\u{2019}"),
            ("&mdash;", "\u{2014}"),
            ("&ndash;", "\u{2013}"),
            ("&hellip;", "\u{2026}"),
        ]
        for (entity, replacement) in namedEntities {
            result = result.replacingOccurrences(of: entity, with: replacement)
        }

        if let hexRegex = try? NSRegularExpression(pattern: "&#x([0-9a-fA-F]{1,6});", options: []) {
            let nsResult = NSMutableString(string: result)
            let matches = hexRegex.matches(in: result, range: NSRange(result.startIndex..., in: result))
            for match in matches.reversed() {
                guard match.numberOfRanges >= 2,
                      let hexRange = Range(match.range(at: 1), in: result),
                      let fullRange = Range(match.range, in: result) else { continue }
                let hexStr = String(result[hexRange])
                if let codePoint = UInt32(hexStr, radix: 16),
                   codePoint > 0,
                   codePoint <= 0x10FFFF,
                   let scalar = Unicode.Scalar(codePoint) {
                    let replacement = String(scalar)
                    let nsFullRange = NSRange(fullRange, in: result)
                    nsResult.replaceCharacters(in: nsFullRange, with: replacement)
                }
            }
            result = nsResult as String
        }

        if let decRegex = try? NSRegularExpression(pattern: "&#([0-9]{1,7});", options: []) {
            let nsResult = NSMutableString(string: result)
            let matches = decRegex.matches(in: result, range: NSRange(result.startIndex..., in: result))
            for match in matches.reversed() {
                guard match.numberOfRanges >= 2,
                      let decRange = Range(match.range(at: 1), in: result),
                      let fullRange = Range(match.range, in: result) else { continue }
                let decStr = String(result[decRange])
                if let codePoint = UInt32(decStr),
                   codePoint > 0,
                   codePoint <= 0x10FFFF,
                   let scalar = Unicode.Scalar(codePoint) {
                    let replacement = String(scalar)
                    let nsFullRange = NSRange(fullRange, in: result)
                    nsResult.replaceCharacters(in: nsFullRange, with: replacement)
                }
            }
            result = nsResult as String
        }

        return result
    }

    // MARK: - Auth Token

    private enum TokenLoadFailure {
        case containerUnavailable
        case fileMissing(path: String)
        case fileUnreadable(path: String, error: String)
        case jsonInvalid(path: String, bytes: Int, snippet: String)
        case missingFields(path: String, hasAccess: Bool, hasRefresh: Bool, hasUserId: Bool)
    }

    private enum TokenLoadResult {
        case success(accessToken: String, refreshToken: String, userId: String, expiresAt: Double)
        case failure(TokenLoadFailure)
    }

    private func userFacingMessageFor(_ failure: TokenLoadFailure) -> String {
        switch failure {
        case .containerUnavailable:
            return "Share extension can't access shared storage. Try reinstalling Recall."
        case .fileMissing:
            return "Open Recall once to enable sharing."
        case .fileUnreadable:
            return "Couldn't read sign-in info. Open Recall and try again."
        case .jsonInvalid:
            return "Sign-in info is corrupted. Open Recall to refresh."
        case .missingFields:
            return "Sign-in info is incomplete. Open Recall to refresh."
        }
    }

    private func persistLastFailure(_ failure: TokenLoadFailure) {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            print("[ShareViewController] persistLastFailure — container unavailable, can't persist")
            return
        }
        let errorURL = containerURL.appendingPathComponent("share-ext-last-error.json")
        var payload: [String: Any] = [
            "timestamp": Date().timeIntervalSince1970,
            "appGroupID": appGroupID,
        ]
        switch failure {
        case .containerUnavailable:
            payload["stage"] = "containerUnavailable"
            payload["message"] = "FileManager.containerURL returned nil"
        case .fileMissing(let path):
            payload["stage"] = "fileMissing"
            payload["path"] = path
        case .fileUnreadable(let path, let error):
            payload["stage"] = "fileUnreadable"
            payload["path"] = path
            payload["error"] = error
        case .jsonInvalid(let path, let bytes, let snippet):
            payload["stage"] = "jsonInvalid"
            payload["path"] = path
            payload["bytes"] = bytes
            payload["snippet"] = snippet
        case .missingFields(let path, let hasAccess, let hasRefresh, let hasUserId):
            payload["stage"] = "missingFields"
            payload["path"] = path
            payload["hasAccess"] = hasAccess
            payload["hasRefresh"] = hasRefresh
            payload["hasUserId"] = hasUserId
        }
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
            do {
                try data.write(to: errorURL, options: .atomic)
                print("[ShareViewController] persistLastFailure — wrote \(data.count) bytes to \(errorURL.path)")
            } catch {
                print("[ShareViewController] persistLastFailure — write failed: \(error.localizedDescription)")
            }
        }
    }

    private func persistSuccess(userId: String) {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else { return }
        let errorURL = containerURL.appendingPathComponent("share-ext-last-error.json")
        let payload: [String: Any] = [
            "stage": "success",
            "timestamp": Date().timeIntervalSince1970,
            "appGroupID": appGroupID,
            "userId": userId,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
            try? data.write(to: errorURL, options: .atomic)
            print("[ShareViewController] persistSuccess — wrote success marker for userId=\(userId)")
        }
    }


    // MARK: - Keychain fallback

    private func readTokenFromKeychain() -> (accessToken: String, refreshToken: String, userId: String, expiresAt: Double)? {
        print("[ShareViewController] readTokenFromKeychain — attempting Keychain read")
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecAttrAccessGroup as String: keychainAccessGroup,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String,
              let userId = json["user_id"] as? String else {
            print("[ShareViewController] readTokenFromKeychain — failed (status: \(status))")
            return nil
        }
        let expiresAt = (json["expires_at"] as? Double) ?? 0
        print("[ShareViewController] readTokenFromKeychain — success, userId=\(userId), expiresAt=\(expiresAt)")
        return (accessToken: accessToken, refreshToken: refreshToken, userId: userId, expiresAt: expiresAt)
    }

    private func loadAuthToken() -> TokenLoadResult {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            print("[ShareViewController] loadAuthToken stage 1 FAILED — App Group containerURL is nil for groupID=\(appGroupID), trying Keychain fallback")
            if let kc = readTokenFromKeychain() {
                print("[ShareViewController] loadAuthToken — Keychain fallback succeeded")
                return .success(accessToken: kc.accessToken, refreshToken: kc.refreshToken, userId: kc.userId, expiresAt: kc.expiresAt)
            }
            print("[ShareViewController] loadAuthToken — Keychain fallback also failed")
            return .failure(.containerUnavailable)
        }
        print("[ShareViewController] loadAuthToken stage 1 OK — containerURL=\(containerURL.path)")

        let tokenURL = containerURL.appendingPathComponent("auth-token.json")
        let tokenPath = tokenURL.path

        guard FileManager.default.fileExists(atPath: tokenPath) else {
            print("[ShareViewController] loadAuthToken stage 2 FAILED — auth-token.json does not exist at \(tokenPath), trying Keychain fallback")
            if let kc = readTokenFromKeychain() {
                print("[ShareViewController] loadAuthToken — Keychain fallback succeeded")
                return .success(accessToken: kc.accessToken, refreshToken: kc.refreshToken, userId: kc.userId, expiresAt: kc.expiresAt)
            }
            return .failure(.fileMissing(path: tokenPath))
        }

        var fileSize: Int = 0
        var fileMtime: TimeInterval = 0
        if let attrs = try? FileManager.default.attributesOfItem(atPath: tokenPath) {
            fileSize = (attrs[.size] as? Int) ?? 0
            fileMtime = (attrs[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        }
        print("[ShareViewController] loadAuthToken stage 2 OK — auth-token.json exists, size=\(fileSize) bytes, mtime=\(fileMtime)")

        // Fix 2 (read): wrap with NSFileCoordinator to prevent races with the main app
        var tokenData: Data?
        let readCoordinator = NSFileCoordinator()
        var readCoordinatorError: NSError?
        readCoordinator.coordinate(readingItemAt: tokenURL, options: .withoutChanges, error: &readCoordinatorError) { coordURL in
            tokenData = try? Data(contentsOf: coordURL)
        }
        if let err = readCoordinatorError {
            print("[ShareViewController] NSFileCoordinator read error: \(err.localizedDescription)")
        }
        guard let data = tokenData else {
            let errMsg = readCoordinatorError?.localizedDescription ?? "NSFileCoordinator read returned nil data"
            print("[ShareViewController] loadAuthToken stage 3 FAILED — \(errMsg)")
            return .failure(.fileUnreadable(path: tokenPath, error: errMsg))
        }
        print("[ShareViewController] loadAuthToken stage 3 OK — read \(data.count) bytes")

        let json: [String: Any]
        do {
            let parsed = try JSONSerialization.jsonObject(with: data)
            guard let dict = parsed as? [String: Any] else {
                let snippet = String(data: data, encoding: .utf8).map { String($0.prefix(120)) } ?? "<not-utf8>"
                print("[ShareViewController] loadAuthToken stage 4 FAILED — top-level JSON is not a dict. snippet=\(snippet)")
                return .failure(.jsonInvalid(path: tokenPath, bytes: data.count, snippet: snippet))
            }
            json = dict
        } catch {
            let snippet = String(data: data, encoding: .utf8).map { String($0.prefix(120)) } ?? "<not-utf8>"
            print("[ShareViewController] loadAuthToken stage 4 FAILED — JSON parse error: \(error.localizedDescription). snippet=\(snippet)")
            return .failure(.jsonInvalid(path: tokenPath, bytes: data.count, snippet: snippet))
        }

        let hasAccess = json["access_token"] is String
        let hasRefresh = json["refresh_token"] is String
        let hasUserId = json["user_id"] is String
        print("[ShareViewController] loadAuthToken stage 4 OK — keys present: access=\(hasAccess) refresh=\(hasRefresh) userId=\(hasUserId)")

        guard let token = json["access_token"] as? String,
              let refreshToken = json["refresh_token"] as? String,
              let userId = json["user_id"] as? String else {
            print("[ShareViewController] loadAuthToken stage 5 FAILED — required field missing")
            return .failure(.missingFields(path: tokenPath, hasAccess: hasAccess, hasRefresh: hasRefresh, hasUserId: hasUserId))
        }
        let expiresAt = (json["expires_at"] as? Double) ?? 0
        print("[ShareViewController] loadAuthToken stage 5 OK — userId=\(userId) expiresAt=\(expiresAt)")
        return .success(accessToken: token, refreshToken: refreshToken, userId: userId, expiresAt: expiresAt)
    }

    // Fix 1: userId is passed in explicitly from the already-loaded token data so the
    // write-back never needs to re-read the file (which could fail or return stale data).
    private func refreshAccessToken(refreshToken: String, userId: String, completion: @escaping (String?, Double) -> Void) {
        let urlString = "\(supabaseURL)/auth/v1/token?grant_type=refresh_token"
        guard let url = URL(string: urlString) else {
            print("[ShareViewController] refreshAccessToken — invalid URL")
            completion(nil, 0)
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        let body = ["refresh_token": refreshToken]
        guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
            print("[ShareViewController] refreshAccessToken — failed to serialize body")
            completion(nil, 0)
            return
        }
        request.httpBody = httpBody

        print("[ShareViewController] POST \(urlString) [refresh token request — token redacted]")

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let bodyStr: String
            if let data = data, let str = String(data: data, encoding: .utf8) {
                bodyStr = str.count > 500 ? String(str.prefix(500)) + "…" : str
            } else {
                bodyStr = "<no body>"
            }

            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let newAccessToken = json["access_token"] as? String else {
                print("[ShareViewController] Token refresh FAILED — HTTP \(statusCode), body: \(bodyStr.prefix(300))")
                completion(nil, 0)
                return
            }

            let newExpiresAt = (json["expires_at"] as? Double) ?? 0
            print("[ShareViewController] Token refresh SUCCESS — new token expires at: \(newExpiresAt), userId: \(userId)")

            // Fix 1 + Fix 2 (write): use the userId captured from the original loadAuthToken()
            // result (never re-read the file), and wrap the write with NSFileCoordinator.
            if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupID) {
                let tokenURL = containerURL.appendingPathComponent("auth-token.json")
                var updatedJson = json
                updatedJson["user_id"] = userId  // userId captured from the original loadAuthToken() result
                if let updatedData = try? JSONSerialization.data(withJSONObject: updatedJson) {
                    let writeCoordinator = NSFileCoordinator()
                    var writeCoordinatorError: NSError?
                    writeCoordinator.coordinate(writingItemAt: tokenURL, options: .forReplacing, error: &writeCoordinatorError) { coordURL in
                        try? updatedData.write(to: coordURL, options: .atomic)
                    }
                    if let err = writeCoordinatorError {
                        print("[ShareViewController] NSFileCoordinator write error: \(err.localizedDescription)")
                    } else {
                        print("[ShareViewController] Token refreshed and written back for user: \(userId)")
                    }
                }
            }
            completion(newAccessToken, newExpiresAt)
        }.resume()
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
        toolbarBottomConstraint.constant = -keyboardHeight
        UIView.animate(withDuration: duration) { self.view.layoutIfNeeded() }
    }

    @objc private func keyboardWillHide(_ notification: Notification) {
        guard let info = notification.userInfo,
              let duration = info[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double else { return }
        toolbarBottomConstraint.constant = 0
        UIView.animate(withDuration: duration) { self.view.layoutIfNeeded() }
    }

    // MARK: - Actions

    @objc private func handleSave() {
        print("[ShareViewController] Save button tapped")
        // Fix 5.1 — keyboard dismissed only on success, not here
        saveButton.isEnabled = false
        saveButton.alpha = 0.5
        var btnConfig = saveButton.configuration
        btnConfig?.title = ""
        saveButton.configuration = btnConfig
        saveSpinner.startAnimating()

        switch loadAuthToken() {
        case .success(let accessToken, let refreshToken, let userId, let expiresAt):
            // Pre-flight auth check
            guard !userId.isEmpty && !accessToken.isEmpty else {
                print("[ShareViewController] PRE-FLIGHT FAIL — userId empty: \(userId.isEmpty), token empty: \(accessToken.isEmpty)")
                showInFormError(stage: "Auth", message: "Missing user ID or token — open Recall and try again")
                return
            }

            persistSuccess(userId: userId)
            updateStatus("Authenticating…")

            let timeRemaining = expiresAt - Date().timeIntervalSince1970
            if timeRemaining > 300 {
                // Token still valid — skip the network refresh round-trip
                print("[ShareViewController] Token still valid (\(Int(timeRemaining))s remaining) — skipping refresh")
                self.proceedWithSave(accessToken: accessToken, userId: userId)
            } else {
                // Token expired or near-expiry — refresh before saving
                print("[ShareViewController] Token expired or near-expiry (\(Int(timeRemaining))s remaining) — refreshing")
                refreshAccessToken(refreshToken: refreshToken, userId: userId) { [weak self] freshToken, _ in
                    guard let self = self else { return }
                    let finalToken = freshToken ?? accessToken
                    if freshToken != nil {
                        print("[ShareViewController] Using refreshed token for insert")
                    } else {
                        print("[ShareViewController] Refresh failed — falling back to stored token for insert")
                    }
                    self.proceedWithSave(accessToken: finalToken, userId: userId)
                }
            }

        case .failure(let stageFail):
            let userMessage = userFacingMessageFor(stageFail)
            persistLastFailure(stageFail)
            print("[ShareViewController] No auth token — \(stageFail). Showing user message: \(userMessage)")
            writeRecoveryPayloadToAppGroup()
            self.isAuthFailure = true
            showInFormError(stage: "Auth Failed", message: userMessage)
        }
    }

    /// Extracted save logic — called with a valid (possibly refreshed) access token.
    private func proceedWithSave(accessToken: String, userId: String) {
        // Fix 2.1 — Wait up to 5 s for any in-flight URL scrape to finish
        if self.isScraping {
            let deadline = DispatchTime.now() + .seconds(5)
            let waitGroup = DispatchGroup()
            waitGroup.enter()
            DispatchQueue.global().async {
                var waited = 0
                while self.isScraping && waited < 50 {
                    Thread.sleep(forTimeInterval: 0.1)
                    waited += 1
                }
                waitGroup.leave()
            }
            waitGroup.wait(timeout: deadline)
        }

        let noteText = self.noteTextView.text ?? ""
        var parts: [String] = []
        if !noteText.trimmingCharacters(in: .whitespaces).isEmpty {
            parts.append(noteText.trimmingCharacters(in: .whitespaces))
        }
        var metaParts: [String] = []
        if let t = self.scrapedTitle, !t.isEmpty { metaParts.append(t) }
        if let d = self.scrapedDescription, !d.isEmpty { metaParts.append(d) }
        if !metaParts.isEmpty { parts.append(metaParts.joined(separator: "\n")) }
        if !self.parsedURLs.isEmpty { parts.append(self.parsedURLs.joined(separator: "\n")) }
        let nonURLTexts = self.parsedTexts.filter { !$0.hasPrefix("http") }
        if !nonURLTexts.isEmpty { parts.append(nonURLTexts.joined(separator: "\n\n")) }
        let finalText = parts.joined(separator: "\n\n")

        print("[ShareViewController] Inserting recall — userId: \(userId), textLength: \(finalText.count)")

        DispatchQueue.main.async {
            self.updateStatus("Saving recall…")
        }

        self.insertRecall(text: finalText, urls: self.parsedURLs, imagePaths: self.parsedImagePaths, userId: userId, accessToken: accessToken)
    }

    @objc private func handleCancel() {
        print("[ShareViewController] Cancel tapped — dismissing extension")
        view.endEditing(true)
        extensionContext?.cancelRequest(withError: NSError(domain: "UserCancelled", code: 0))
    }

    @objc private func handleRetryAuth() {
        print("[ShareViewController] Retry tapped — re-running auth + save flow")
        DispatchQueue.main.async {
            self.errorBannerView.isHidden = true
            self.isAuthFailure = false
            self.retryButton.isHidden = true
            self.updateStatus("Retrying…")
        }
        DispatchQueue.global(qos: .userInitiated).async {
            self.handleSave()
        }
    }

    // MARK: - Supabase Insert

    private func insertRecall(text: String, urls: [String], imagePaths: [String], userId: String, accessToken: String) {
        guard !supabaseURL.isEmpty, !supabaseAnonKey.isEmpty else {
            print("[ShareViewController] insertRecall — Supabase config missing from Info.plist")
            showInFormError(stage: "Config Error", message: "Supabase config missing — rebuild the app")
            return
        }
        let urlString = "\(supabaseURL)/rest/v1/recalls"
        guard let url = URL(string: urlString) else {
            print("[ShareViewController] insertRecall — invalid URL")
            writeRecoveryPayloadToAppGroup()
            showInFormError(stage: "Save Failed", message: "Invalid endpoint URL — try again")
            return
        }

        // Fix 8.1 — Add client-side timestamps to recall insert
        let isoFormatter = ISO8601DateFormatter()
        let nowISO = isoFormatter.string(from: Date())
        let body: [String: Any] = [
            "text": text,
            "user_id": userId,
            "created_at": nowISO,
            "updated_at": nowISO,
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("return=representation", forHTTPHeaderField: "Prefer")

        guard let httpBody = try? JSONSerialization.data(withJSONObject: body) else {
            print("[ShareViewController] insertRecall — failed to serialize body")
            writeRecoveryPayloadToAppGroup()
            showInFormError(stage: "Save Failed", message: "Failed to serialize request body")
            return
        }
        request.httpBody = httpBody

        print("[ShareViewController] INSERT PRE-FLIGHT — url: \(urlString), userId present: \(!userId.isEmpty), tokenLength: \(accessToken.count), bodyKeys: \(body.keys.sorted())")

        let startTime = Date().timeIntervalSince1970

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            let elapsed = Int((Date().timeIntervalSince1970 - startTime) * 1000)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let bodyStr: String
            if let data = data, let str = String(data: data, encoding: .utf8) {
                bodyStr = str.count > 500 ? String(str.prefix(500)) + "…" : str
            } else {
                bodyStr = "<no body>"
            }

            print("[ShareViewController] INSERT RESPONSE — status: \(statusCode), elapsed: \(elapsed)ms, userId: \(userId), body: \(bodyStr.prefix(300))")

            DispatchQueue.main.async {
                if error != nil && statusCode == 0 {
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "No Internet", message: "Network error — check your connection and try again")
                    return
                }

                if statusCode == 401 || statusCode == 403 {
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "Session Expired", message: "Your session has expired — open Recall to sign in again")
                    return
                }

                if statusCode >= 500 {
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "Server Error (HTTP \(statusCode))", message: "Server error — try again later. Body: \(bodyStr.prefix(200))")
                    return
                }

                if statusCode >= 400 && statusCode < 500 {
                    print("[ShareViewController] Insert 4xx error — PostgREST body: \(bodyStr)")
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "Save Failed (HTTP \(statusCode))", message: bodyStr)
                    return
                }

                guard statusCode >= 200 && statusCode < 300 else {
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "Save Failed (HTTP \(statusCode))", message: "Unexpected status code — try again")
                    return
                }

                guard let data = data,
                      let jsonArray = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]],
                      let firstRow = jsonArray.first,
                      let rowId = firstRow["id"] as? String,
                      !rowId.isEmpty else {
                    print("[ShareViewController] Insert returned 2xx but response body missing id — body: \(bodyStr)")
                    self.writeRecoveryPayloadToAppGroup()
                    self.showInFormError(stage: "Save Failed", message: "Save unconfirmed — response missing row ID")
                    return
                }

                print("[ShareViewController] Recall inserted id=\(rowId)")

                // Always write the success payload so the main app can trigger the edge function pipeline
                self.saveSharedData([
                    "recall_id": rowId,
                    "text": self.noteTextView?.text ?? "",
                    "urls": self.parsedURLs,
                    "images": imagePaths,
                    "documents": self.parsedDocumentPaths,
                    "documentNames": self.parsedDocumentNames,
                    "timestamp": Date().timeIntervalSince1970,
                    "already_saved": true
                ])

                // Post Darwin notification so the main app wakes immediately
                CFNotificationCenterPostNotification(
                    CFNotificationCenterGetDarwinNotifyCenter(),
                    CFNotificationName("com.b3nny1nc.recall.shareCompleted" as CFString),
                    nil, nil, true
                )
                print("[ShareViewController] Darwin notification posted: com.b3nny1nc.recall.shareCompleted")

                self.showSuccessAndDismiss()
            }
        }.resume()
    }

    // MARK: - Status / Error UI

    private func showInFormError(stage: String, message: String) {
        print("[ShareViewController] IN-FORM ERROR — stage: \(stage), message: \(message)")
        DispatchQueue.main.async {
            self.errorStageLbl.text = stage
            self.errorDetailLbl.text = message
            // Show retry button only for auth failures (user may have opened Recall in the meantime)
            self.retryButton.isHidden = !self.isAuthFailure
            self.errorBannerView.alpha = 0
            self.errorBannerView.transform = CGAffineTransform(translationX: 0, y: 8)
            self.errorBannerView.isHidden = false
            UIView.animate(withDuration: 0.25) {
                self.errorBannerView.alpha = 1
                self.errorBannerView.transform = .identity
            }
            self.saveButton.isEnabled = true
            self.saveButton.alpha = 1.0
            // Fix 4.1 — UIButton.Configuration title reset
            var btnConfig = self.saveButton.configuration
            btnConfig?.title = "Create Recall"
            self.saveButton.configuration = btnConfig
            self.saveSpinner.stopAnimating()
            self.statusLabel.isHidden = true
        }
    }

    private func updateStatus(_ text: String, isSuccess: Bool = false) {
        DispatchQueue.main.async {
            self.statusLabel.text = text
            self.statusLabel.textColor = isSuccess ? UIColor(hex: "#4CAF50") : self.colorTextSecondary
            self.statusLabel.isHidden = false
            self.errorBannerView.isHidden = true
        }
    }

    private func showSuccessAndDismiss() {
        updateStatus("Done ✓", isSuccess: true)
        DispatchQueue.main.async {
            self.saveSpinner.stopAnimating()
            // Fix 4.1 — UIButton.Configuration title reset
            var btnConfig = self.saveButton.configuration
            btnConfig?.title = "Create Recall"
            self.saveButton.configuration = btnConfig
            self.saveButton.alpha = 1.0
            // Fix 5.1 — dismiss keyboard only on success
            self.noteTextView.resignFirstResponder()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            guard let self = self else { return }
            // Open the main app via URL scheme so it foregrounds and processes the pending share.
            // This is the cold-launch path; the Darwin notification (already posted above) handles
            // the already-running-in-background path.
            if let url = URL(string: "recall://share-intent") {
                self.extensionContext?.open(url, completionHandler: { _ in
                    self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                })
            } else {
                self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
            }
        }
    }

    // MARK: - App Group Recovery Payload

    private func writeRecoveryPayloadToAppGroup() {
        let noteText = noteTextView?.text ?? ""
        let sharedText = parsedTexts.joined(separator: "\n\n")
        let combined = [noteText, sharedText].filter { !$0.isEmpty }.joined(separator: "\n\n")

        var payload: [String: Any] = [
            "text": combined,
            "urls": parsedURLs,
            "images": parsedImagePaths,
            "documents": parsedDocumentPaths,
            "documentNames": parsedDocumentNames,
            "timestamp": Date().timeIntervalSince1970,
        ]
        if let title = scrapedTitle { payload["scrapedTitle"] = title }
        if let description = scrapedDescription { payload["scrapedDescription"] = description }
        if let imageURL = scrapedImageURL { payload["scrapedImageURL"] = imageURL }

        print("[ShareViewController] Writing recovery payload to App Group (fallback — insert did NOT succeed)")
        saveSharedData(payload)
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
        var documentPaths: [String] = []
        var documentNames: [String] = []
        var capturedImageData: Data?

        let outerGroup = DispatchGroup()

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }

            if let title = item.attributedTitle?.string, !title.isEmpty {
                texts.append(title)
            }
            if let body = item.attributedContentText?.string, !body.isEmpty {
                texts.append(body)
            }

            for provider in attachments {
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

                // Handle documents (PDF, Word, etc.)
                if !provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) &&
                   !provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) &&
                   !provider.hasItemConformingToTypeIdentifier("public.url") &&
                   !provider.hasItemConformingToTypeIdentifier("public.plain-text") &&
                   (provider.hasItemConformingToTypeIdentifier(UTType.data.identifier) ||
                    provider.hasItemConformingToTypeIdentifier("public.item")) {
                    outerGroup.enter()
                    let typeId = provider.hasItemConformingToTypeIdentifier(UTType.data.identifier)
                        ? UTType.data.identifier : "public.item"
                    provider.loadItem(forTypeIdentifier: typeId, options: nil) { [weak self] item, error in
                        defer { outerGroup.leave() }
                        guard let self = self, error == nil else {
                            print("[ShareViewController] Document load error: \(String(describing: error))")
                            return
                        }
                        var sourceURL: URL?
                        if let url = item as? URL { sourceURL = url }
                        else if let data = item as? Data,
                                let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupID) {
                            let fileName = "shared-doc-\(UUID().uuidString).bin"
                            let fileURL = containerURL.appendingPathComponent(fileName)
                            try? data.write(to: fileURL)
                            sourceURL = fileURL
                        }
                        guard let src = sourceURL else { return }
                        let fileName = src.lastPathComponent
                        print("[ShareViewController] Document received: \(fileName), path: \(src.path)")
                        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupID) {
                            let destURL = containerURL.appendingPathComponent("shared-doc-\(UUID().uuidString)-\(fileName)")
                            do {
                                if src.startAccessingSecurityScopedResource() {
                                    defer { src.stopAccessingSecurityScopedResource() }
                                    try FileManager.default.copyItem(at: src, to: destURL)
                                } else {
                                    try FileManager.default.copyItem(at: src, to: destURL)
                                }
                                documentPaths.append(destURL.path)
                                documentNames.append(fileName)
                                print("[ShareViewController] Document copied to App Group: \(destURL.path)")
                            } catch {
                                print("[ShareViewController] Document copy failed: \(error.localizedDescription)")
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
            self.parsedDocumentPaths = documentPaths
            self.parsedDocumentNames = documentNames
            self.firstImageData = capturedImageData
            print("[ShareViewController] Parsed — urls: \(urls.count), images: \(imagePaths.count), texts: \(texts.count), documents: \(documentPaths.count)")
            self.populatePreview()
            // Kick off URL scraping in background if URL was shared
            if let firstURL = urls.first {
                self.scrapeURLMetadata(urlString: firstURL)
            }
        }
    }

    // MARK: - Save to App Group

    // Fix 3.1 — Wrap saveSharedData write with NSFileCoordinator
    private func saveSharedData(_ data: [String: Any]) {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
            print("[ShareViewController] Failed to get App Group container URL")
            return
        }

        let fileURL = containerURL.appendingPathComponent("shared-data.json")

        guard let jsonData = try? JSONSerialization.data(withJSONObject: data, options: []) else {
            print("[ShareViewController] Failed to serialize shared data")
            return
        }

        let coordinator = NSFileCoordinator()
        var coordinatorError: NSError?
        coordinator.coordinate(writingItemAt: fileURL, options: .forReplacing, error: &coordinatorError) { coordURL in
            do {
                try jsonData.write(to: coordURL, options: .atomic)
                print("[ShareViewController] Saved shared data to: \(coordURL.path)")
            } catch {
                print("[ShareViewController] Error saving shared data: \(error)")
            }
        }
        if let err = coordinatorError {
            print("[ShareViewController] NSFileCoordinator write error: \(err.localizedDescription)")
        }
    }
}

// MARK: - UITextViewDelegate

extension ShareViewController: UITextViewDelegate {
    func textViewDidChange(_ textView: UITextView) {
        notePlaceholderLabel.isHidden = !textView.text.isEmpty
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
