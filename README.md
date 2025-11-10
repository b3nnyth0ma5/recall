
# Recall - Note Taking App

A simple and intuitive mobile app built with React Native and Expo that allows users to take text notes and upload images with location tagging. Features cloud sync via Supabase.

## Features

- 📝 Create and edit text notes
- 📷 Attach multiple images to notes (camera or gallery)
- 📍 Location tagging with automatic geocoding
- 🔍 Search functionality across notes
- ☁️ Cloud sync with Supabase
- 🌙 Dark mode UI
- 🔐 User authentication

## Tech Stack

- **React Native** - Mobile framework
- **Expo 54** - Development platform
- **Supabase** - Backend (database, auth, storage)
- **TypeScript** - Type safety
- **Expo Router** - File-based routing
- **React Native Reanimated** - Animations

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18 or higher)
- npm or pnpm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (for Mac) or Android Studio (for Android development)
- Expo Go app on your physical device (optional)

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd <project-directory>
```

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 3. Configure Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Update the Supabase credentials in `utils/supabase.ts`:
   ```typescript
   const supabaseUrl = 'YOUR_SUPABASE_URL';
   const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
   ```

3. Set up the database tables by running these SQL commands in your Supabase SQL Editor:

```sql
-- Create recalls table
CREATE TABLE recalls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recalls ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own recalls"
  ON recalls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recalls"
  ON recalls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recalls"
  ON recalls FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recalls"
  ON recalls FOR DELETE
  USING (auth.uid() = user_id);

-- Create recall_images table
CREATE TABLE recall_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recall_id UUID REFERENCES recalls(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  image_data TEXT NOT NULL,
  content_type TEXT DEFAULT 'image/jpeg',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE recall_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own images"
  ON recall_images FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own images"
  ON recall_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own images"
  ON recall_images FOR DELETE
  USING (auth.uid() = user_id);

-- Create search_history table
CREATE TABLE search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users NOT NULL,
  search_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own search history"
  ON search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history"
  ON search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search history"
  ON search_history FOR UPDATE
  USING (auth.uid() = user_id);
```

### 4. Run the App Locally

#### For iOS (Mac only):
```bash
npm run ios
```

#### For Android:
```bash
npm run android
```

#### For Web:
```bash
npm run web
```

#### Using Expo Go (Recommended for quick testing):
```bash
npm run dev
```
Then scan the QR code with:
- **iOS**: Camera app
- **Android**: Expo Go app

## Project Structure

```
.
├── app/                    # App screens (file-based routing)
│   ├── (tabs)/            # Tab navigation screens
│   ├── login.tsx          # Login screen
│   ├── note-editor.tsx    # Note creation/editing
│   ├── location-search.tsx # Location search
│   └── search.tsx         # Search screen
├── components/            # Reusable components
├── contexts/              # React contexts (Auth, etc.)
├── hooks/                 # Custom React hooks
├── styles/                # Global styles
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
│   └── supabase.ts       # Supabase client & helpers
└── assets/               # Images, fonts, etc.
```

## Deployment

### Deploy to Expo

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
```

2. **Login to Expo:**
```bash
eas login
```

3. **Configure EAS:**
```bash
eas build:configure
```

4. **Build for iOS:**
```bash
eas build --platform ios
```

5. **Build for Android:**
```bash
eas build --platform android
```

6. **Submit to App Stores:**
```bash
# For iOS
eas submit --platform ios

# For Android
eas submit --platform android
```

### Deploy Web Version

1. **Build the web version:**
```bash
npm run build:web
```

2. **Deploy to hosting service:**
   - The build output will be in the `dist` folder
   - Deploy to Vercel, Netlify, or any static hosting service

**Example with Vercel:**
```bash
npm install -g vercel
vercel --prod
```

## Environment Variables

For production deployments, set these environment variables:

- `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Documentation

- **`GOOGLE_PLACES_SETUP.md`** - Complete guide to setting up Google Places API
- **`LOCATION_UPDATE_SUMMARY.md`** - Summary of location feature implementation
- **`LOCATION_API_COMPARISON.md`** - Comparison between Google Places and OpenStreetMap
- **`LOCATION_API_QUICK_START.md`** - Quick reference for developers

## Features in Detail

### Image Storage
Images are stored directly in the Supabase database as base64-encoded data in the `recall_images` table. This eliminates the need for separate storage buckets.

### Location Search
Location search now supports **Google Places API** for enhanced accuracy and better results. The app includes an intelligent fallback to OpenStreetMap's Nominatim API if Google Places is not configured.

**Features:**
- Google Places API integration (optional, requires API key)
- Automatic fallback to OpenStreetMap (free, no setup)
- Proximity-based result sorting
- Distance display for each result
- Auto-search with 500ms debounce

**Setup Google Places API (Optional but Recommended):**

See `GOOGLE_PLACES_SETUP.md` for detailed instructions, or quick start:

1. Get API key from [Google Cloud Console](https://console.cloud.google.com/)
2. Enable "Places API (New)" and "Geocoding API"
3. Add key to `utils/googlePlaces.ts`
4. Restart app

**Without Google Places API:**
The app works perfectly with OpenStreetMap (no setup required).

## Troubleshooting

### Common Issues

1. **Metro bundler issues:**
   ```bash
   npx expo start -c
   ```

2. **iOS build issues:**
   ```bash
   cd ios && pod install && cd ..
   ```

3. **Android build issues:**
   ```bash
   cd android && ./gradlew clean && cd ..
   ```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Open an issue on GitHub
- Check the [Expo documentation](https://docs.expo.dev/)
- Check the [Supabase documentation](https://supabase.com/docs)

## Acknowledgments

- Built with [Expo](https://expo.dev/)
- Backend powered by [Supabase](https://supabase.com/)
- Location services: [Google Places API](https://developers.google.com/maps/documentation/places) & [OpenStreetMap](https://www.openstreetmap.org/)
- UI inspired by modern design principles with Geist Sans typography
