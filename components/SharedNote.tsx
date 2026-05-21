
import React from 'react';

export interface SharedNoteProps {
  text?: string;
  imageUrl?: string;
  location?: string;
  deepLinkUrl: string;
}

/**
 * Generate HTML for a shared note component
 * This HTML is used for native sharing and will be displayed in share previews
 */
export function generateSharedNoteHTML(props: SharedNoteProps): string {
  const { text, imageUrl, location, deepLinkUrl } = props;

  // Escape HTML special characters
  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const escapedText = text ? escapeHtml(text) : '';
  const escapedLocation = location ? escapeHtml(location) : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta property="og:title" content="Shared Note from Recall">
  <meta property="og:description" content="${escapedText.substring(0, 200)}">
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}">` : ''}
  <meta property="og:type" content="article">
  <title>Shared Note</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .shared-note {
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      overflow: hidden;
      animation: slideUp 0.5s ease-out;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .note-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 24px;
      text-align: center;
    }
    
    .note-header h1 {
      color: white;
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .note-header p {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
    }
    
    .note-image {
      width: 100%;
      height: auto;
      max-height: 400px;
      object-fit: cover;
      display: block;
    }
    
    .note-content {
      padding: 24px;
    }
    
    .note-text {
      font-size: 16px;
      line-height: 1.6;
      color: #333;
      margin-bottom: 20px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .note-location {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #f7f7f7;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    
    .location-icon {
      font-size: 18px;
    }
    
    .location-text {
      font-size: 14px;
      color: #666;
      font-weight: 500;
    }
    
    .note-cta {
      text-align: center;
      padding: 20px 24px 24px;
      border-top: 1px solid #eee;
    }
    
    .open-app-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 16px;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    
    .open-app-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }
    
    .open-app-button:active {
      transform: translateY(0);
    }
    
    .app-info {
      margin-top: 16px;
      font-size: 12px;
      color: #999;
    }
    
    @media (max-width: 640px) {
      .shared-note {
        border-radius: 0;
        max-width: 100%;
      }
      
      body {
        padding: 0;
      }
      
      .note-header h1 {
        font-size: 20px;
      }
      
      .note-text {
        font-size: 15px;
      }
    }
  </style>
</head>
<body>
  <div class="shared-note">
    <div class="note-header">
      <h1>📝 Shared Note</h1>
      <p>Someone shared this with you on Recall</p>
    </div>
    
    ${imageUrl ? `
    <img src="${imageUrl}" alt="Shared note image" class="note-image" />
    ` : ''}
    
    <div class="note-content">
      ${text ? `
      <div class="note-text">${escapedText}</div>
      ` : ''}
      
      ${location ? `
      <div class="note-location">
        <span class="location-icon">📍</span>
        <span class="location-text">${escapedLocation}</span>
      </div>
      ` : ''}
    </div>
    
    <div class="note-cta">
      <a href="${deepLinkUrl}" class="open-app-button">
        Open in Recall
      </a>
      <p class="app-info">
        Tap to view this note in the Recall app
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * SharedNote component for React Native rendering (optional, for preview purposes)
 */
export function SharedNote({ text, imageUrl, location, deepLinkUrl }: SharedNoteProps) {
  // This component is primarily for generating HTML
  // The actual rendering happens in the HTML string above
  return null;
}
