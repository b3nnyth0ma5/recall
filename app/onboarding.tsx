import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  ImageSourcePropType,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/utils/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { AUTH_REDIRECT_URLS } from '@/constants/config';
import * as Haptics from 'expo-haptics';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  MapPin,
  Tags,
  Images,
  FileText,
  Globe,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CORAL = '#FF6B7A';

// ─── Image resolver ──────────────────────────────────────────────────────────
function resolveImageSource(
  source: string | number | ImageSourcePropType | undefined
): ImageSourcePropType {
  if (!source) return { uri: '' };
  if (typeof source === 'string') return { uri: source };
  return source as ImageSourcePropType;
}

// ─── Use-case data ────────────────────────────────────────────────────────────
interface UseCase {
  key: string;
  title: string;
  useCase: string;
  recallIt: string;
  image: ImageSourcePropType;
}

const ANYTHING_CARD: UseCase = {
  key: 'anything',
  title: 'Literally anything you want',
  useCase:
    "If it crosses your mind, it belongs in Recall. A dream you don't want to forget. A compliment someone gave you. The colour of paint in a hotel lobby. A funny thing your kid said. The wine your neighbour brought to dinner. Recall has no opinion about what's worth saving — only that you might want it back one day.",
  recallIt:
    "Ask in plain language: 'what was that thing about…?' Recall searches across everything you've ever saved — text, images, places, people, links — and surfaces whatever fits. The more you capture, the more your second brain has to draw on.",
  image: require('@/assets/images/onboarding/use-case-anything.jpg'),
};

const RANDOM_POOL: UseCase[] = [
  {
    key: 'wines',
    title: 'Wines',
    useCase:
      "That bottle you loved at dinner. The one your friend recommended. The label you photographed at that vineyard. Snap a picture of the bottle and add a tasting note — even just 'liked it, peppery.' Recall extracts the producer, vintage, and region from the label automatically.",
    recallIt:
      "Ask: 'which Bordeaux did I open last summer?' or 'show me the reds I rated 7/10 or higher.' Recall finds the bottle, the note, the place — perfect for the next restaurant order or wine shop visit.",
    image: require('@/assets/images/onboarding/use-case-wines.jpg'),
  },
  {
    key: 'ideas',
    title: 'Ideas',
    useCase:
      'Every fleeting thought, half-formed concept, or shower-time epiphany — captured before it slips away. Jot down a sentence, dictate a voice memo, snap a sketch on a napkin. Recall preserves the spark and the context: when you had it, where you were, what triggered it.',
    recallIt:
      "Ask: 'what was that idea I had about the side project last month?' or 'show me everything I noted down about pricing.' Recall connects related ideas across time and surfaces the thread you were pulling on — even if you've forgotten the exact words.",
    image: require('@/assets/images/onboarding/use-case-ideas.jpg'),
  },
  {
    key: 'inventory',
    title: 'Things',
    useCase:
      "Keep track of everything you own and where it lives. Snap a photo of the contents of a drawer, a storage box in the attic, or the shelf in the garage. Add a note about what's inside, condition, or when you bought it. Recall handles the rest — turning piles of stuff into a searchable, organised inventory you can actually find again.",
    recallIt:
      "Ask: 'where did I put the Christmas lights?' or 'do I still have spare HDMI cables?' Recall surfaces the photo, the note, and the location instantly.",
    image: require('@/assets/images/onboarding/use-case-inventory.jpg'),
  },
  {
    key: 'dreamhome',
    title: 'Dream Home',
    useCase:
      "Every interior you've fallen in love with, every paint colour that caught your eye, every fixture and floorplan idea — collected as you find them. Snap pages from magazines, save Instagram posts, pin a tile shop on the map, jot a sentence about the kitchen you stayed in on holiday.",
    recallIt:
      "Ask: 'what was that green I liked for the bedroom?' or 'show me the bathrooms I've saved.' Recall pulls the photos, the notes and the places together — turning a scattered moodboard into something you can actually take to a builder.",
    image: require('@/assets/images/onboarding/use-case-dreamhome.jpg'),
  },
  {
    key: 'lists',
    title: 'Lists',
    useCase:
      "Shopping lists, packing lists, gift ideas, books to read, films to watch. All the running tallies that live on scraps of paper and half-finished notes apps — finally in one place. Add items in seconds, with photos or links if you want the extra context.",
    recallIt:
      "Ask: 'what's on my packing list for skiing?' or 'what books did I want to read this summer?' Recall pulls up the list and remembers what you finished.",
    image: require('@/assets/images/onboarding/use-case-lists.jpg'),
  },
  {
    key: 'cookbooks',
    title: 'Cookbooks',
    useCase:
      'Your physical cookbook shelf, made searchable. Snap the cover, the recipe index and a few favourite pages from each book. Recall indexes the recipes — so a wall of cookbooks becomes a personal recipe database you can actually use mid-week.',
    recallIt:
      "Ask: 'which of my books has a good roast chicken recipe?' or 'what can I make with aubergines?' Recall points you to the exact book and page.",
    image: require('@/assets/images/onboarding/use-case-cookbooks.jpg'),
  },
  {
    key: 'todo',
    title: 'Things to do',
    useCase:
      "The restaurant a friend mentioned. The hiking trail you saw on Instagram. The exhibition closing next month. All the 'we should do that sometime' moments — captured with a link, a photo, or a pinned location, so they don't fade into vague intentions.",
    recallIt:
      "Ask: 'what restaurants did I save in Lisbon?' or 'what gig did Elly recommend?' Recall surfaces ideas by place, by season, or by who suggested them — turning a backlog of intentions into actual plans.",
    image: require('@/assets/images/onboarding/use-case-todo.jpg'),
  },
  {
    key: 'receipts',
    title: 'Bills & Invoices',
    useCase:
      "Never lose a receipt again. Snap it the moment you're handed one — paper, email, or screen. Recall reads the merchant, the amount, the items and the date automatically, so you don't have to type anything.",
    recallIt:
      "Ask: 'how much did I spend on coffee last month?' or 'find the receipt from the hardware store in June.' Recall surfaces the image and the extracted details, ready to forward, file or claim.",
    image: require('@/assets/images/onboarding/use-case-receipts.jpg'),
  },
  {
    key: 'dates',
    title: 'Important Dates',
    useCase:
      "Birthdays, anniversaries, the day you started a new job, when the boiler was last serviced. The dates you'll wish you remembered, plus the context: who, what, where, and what you did last time.",
    recallIt:
      "Ask: 'what did I get Mum last year?' or 'when's our anniversary?' Recall surfaces the date and everything attached to it — so you never duplicate a gift, miss a milestone, or forget the year the car was bought.",
    image: require('@/assets/images/onboarding/use-case-dates.jpg'),
  },
  {
    key: 'misc',
    title: 'Miscellaneous',
    useCase:
      "Everything that doesn't fit a neat category. A serial number from the back of an appliance. A parking spot photo. A Wi-Fi password scribbled on a coaster. A quote you liked. The bits and pieces of life that don't belong in a notes app but you really do need later.",
    recallIt:
      "Ask: 'what was the Wi-Fi at that café?' or 'find the serial number for the washing machine.' Recall surfaces the photo or note instantly.",
    image: require('@/assets/images/onboarding/use-case-misc.jpg'),
  },
  {
    key: 'alcohol',
    title: 'Alcohol Cabinet',
    useCase:
      'The whiskies, gins, vermouths and bitters scattered across your shelf — all in one searchable place. Snap each bottle as you open it, add a quick note on how you liked it, what you mixed it with, or who gifted it.',
    recallIt:
      "Ask: 'what gin do I have that works for a Negroni?' or 'which whisky did Dad bring last Christmas?' Recall surfaces the bottle, your tasting note and what's still left.",
    image: require('@/assets/images/onboarding/use-case-alcohol.jpg'),
  },
  {
    key: 'pets',
    title: 'Pets',
    useCase:
      "Vaccination dates, vet bills, the brand of food they actually eat, the toy they destroyed in a week, photos at every age. Everything about your pet, in one place — instead of scattered across the fridge, the vet's portal and your camera roll.",
    recallIt:
      "Ask: 'when's the next worming due?' or 'what was the name of that treat she loved?' Recall surfaces the record, the photo or the receipt.",
    image: require('@/assets/images/onboarding/use-case-pets.jpg'),
  },
  {
    key: 'plants',
    title: 'Plants',
    useCase:
      "Every plant in the house, plus the ones you've killed and the ones you want to try. Snap each pot, note the species, when you last watered, when you repotted, the spot it likes. Recall keeps the care notes attached to the plant instead of on a sticky note that's long gone.",
    recallIt:
      "Ask: 'when did I last feed the monstera?' or 'which plants are safe for the cat?' Recall surfaces the schedule, the photos and the notes.",
    image: require('@/assets/images/onboarding/use-case-plants.jpg'),
  },
  {
    key: 'collectibles',
    title: 'Collectibles',
    useCase:
      'Coins, stamps, action figures, trading cards, vinyl, enamel pins — whatever you collect. Snap each piece, note the condition, the year, where you bought it and what you paid. Recall reads what it can from the image and keeps the rest organised.',
    recallIt:
      "Ask: 'do I already own this one?' or 'what's missing from the 1986 set?' Recall surfaces matches, gaps and duplicates — so you stop buying the same thing twice and finally close out the set.",
    image: require('@/assets/images/onboarding/use-case-collectibles.jpg'),
  },
  {
    key: 'jewellery',
    title: 'Jewellery',
    useCase:
      'Every ring, chain, pair of earrings and family heirloom — photographed, valued and quietly catalogued. Add the maker, the metal, the stone, the story behind it. Useful for insurance, useful for inheritance.',
    recallIt:
      "Ask: 'where's Grandma's brooch?' or 'show me the silver pieces.' Recall surfaces the photo, the location and the details — ready for an insurance claim, a valuation or just finding what to wear tonight.",
    image: require('@/assets/images/onboarding/use-case-jewellery.jpg'),
  },
  {
    key: 'events',
    title: 'Upcoming Events',
    useCase:
      "Concerts, weddings, festivals, conferences, the gallery opening next month. The tickets, the wristbands, the dress code, the address, who else is going and what time you said you'd arrive — all in one place instead of scattered across email and DMs.",
    recallIt:
      "Ask: 'what's on this weekend?' or 'where's the ticket for Friday?' Recall pulls up the event, the tickets, the location and any notes — so you stop scrolling through inboxes the morning of.",
    image: require('@/assets/images/onboarding/use-case-events.jpg'),
  },
];

// Stable random pick of 3 from pool (lazy initialiser — runs once)
function pickThreeRandom(): UseCase[] {
  const pool = [...RANDOM_POOL];
  const picked: UseCase[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// ─── AnimatedPressable ────────────────────────────────────────────────────────
interface AnimatedPressableProps {
  onPress?: () => void;
  style?: object | object[];
  children: React.ReactNode;
  disabled?: boolean;
  scaleValue?: number;
}

function AnimatedPressable({
  onPress,
  style,
  children,
  disabled,
  scaleValue = 0.97,
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: scaleValue,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale, scaleValue]);
  const animateOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }, [scale]);
  return (
    <Animated.View style={[{ transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
      <Pressable
        onPressIn={animateIn}
        onPressOut={animateOut}
        onPress={onPress}
        disabled={disabled}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Feature pill for "What is a Recall?" ────────────────────────────────────
interface FeaturePillProps {
  icon: React.ReactNode;
  label: string;
  description: string;
}

function FeaturePill({ icon, label, description }: FeaturePillProps) {
  return (
    <View style={featureStyles.pill}>
      <View style={featureStyles.pillIconRow}>
        <View style={featureStyles.pillIconCircle}>
          {icon}
        </View>
        <Text style={featureStyles.pillLabel}>{label}</Text>
      </View>
      <Text style={featureStyles.pillDesc}>{description}</Text>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  pill: {
    backgroundColor: '#242424',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333333',
  },
  pillIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 10,
  },
  pillIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,107,122,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  pillDesc: {
    fontSize: 14,
    color: '#B0B0B0',
    lineHeight: 20,
  },
});

// ─── Use-case card ────────────────────────────────────────────────────────────
interface UseCaseCardProps {
  card: UseCase;
  index: number;
  isLast: boolean;
}

function UseCaseCard({ card, index, isLast }: UseCaseCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay: index * 80,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay: index * 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  const wrapperStyle = isLast
    ? [cardStyles.wrapper, { marginBottom: 0 }]
    : cardStyles.wrapper;

  return (
    <Animated.View style={[wrapperStyle, { opacity, transform: [{ translateY }] }]}>
      <Image
        source={resolveImageSource(card.image)}
        style={cardStyles.image}
        resizeMode="cover"
      />
      <View style={cardStyles.body}>
        <Text style={cardStyles.title}>{card.title}</Text>
        <Text style={cardStyles.label}>The use case</Text>
        <Text style={cardStyles.text}>{card.useCase}</Text>
        <View style={cardStyles.recallRow}>
            <Text style={cardStyles.label}>Recall it</Text>
        </View>
        <Text style={cardStyles.text}>{card.recallIt}</Text>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#242424',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333333',
    boxShadow: '0px 4px 10px rgba(0,0,0,0.3)',
    elevation: 6,
  },
  image: {
    width: '100%',
    height: 185,
  },
  body: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  text: {
    fontSize: 16,
    color: '#B0B0B0',
    lineHeight: 21,
    marginBottom: 14,
  },
  recallRow: {
    marginBottom: 8,
  },
  recallBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,107,122,0.12)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,107,122,0.25)',
  },
  recallBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recallText: {
    fontSize: 16,
    color: '#B0B0B0',
    lineHeight: 21,
  },
});

// ─── TopBar ───────────────────────────────────────────────────────────────────
interface TopBarProps {
  currentStep: number;
  onLoginPress: () => void;
}

function TopBar({ currentStep, onLoginPress }: TopBarProps) {
  const insets = useSafeAreaInsets();
  const topPadding = insets.top > 0 ? insets.top : (Platform.OS === 'android' ? 28 : 44);

  return (
    <View style={[topBarStyles.container, { paddingTop: topPadding }, currentStep === 0 && { justifyContent: 'center' }]}>
      {/* Logo + wordmark */}
      <View style={topBarStyles.logoRow}>
        <Image
          source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
          style={topBarStyles.logo}
          resizeMode="contain"
        />
        <Text style={topBarStyles.wordmark}>Recall</Text>
      </View>

      {/* Login/Signup pill — only on intermediate steps (not landing, not auth step) */}
      {currentStep >= 1 && currentStep < 3 ? (
        <Pressable
          onPress={onLoginPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={topBarStyles.loginButton}
        >
          <Text style={topBarStyles.loginButtonText}>Login / Sign up</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const topBarStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#1A1A1A',
    zIndex: 20,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  loginButton: {
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: CORAL,
  },
  loginButtonSpacer: {
    width: 100,
    height: 44,
  },
});

// ─── ChevronNav ───────────────────────────────────────────────────────────────
interface ChevronNavProps {
  currentStep: number;
  onPrev: () => void;
  onNext: () => void;
  bottomInset: number;
}

function ChevronNav({ currentStep, onPrev, onNext, bottomInset }: ChevronNavProps) {
  const showLeft = currentStep > 0;
  const showRight = currentStep < 3;
  const paddingBottom = bottomInset > 0 ? bottomInset + 16 : 32;

  return (
    <View style={[chevronStyles.row, { paddingBottom }]}>
      {/* Left slot */}
      {showLeft ? (
        <Pressable
          onPress={onPrev}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={chevronStyles.button}
        >
          <ChevronLeft size={28} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={chevronStyles.spacer} />
      )}

      {/* Right slot */}
      {showRight ? (
        <Pressable
          onPress={onNext}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={chevronStyles.button}
        >
          <ChevronRight size={28} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      ) : (
        <View style={chevronStyles.spacer} />
      )}
    </View>
  );
}

const chevronStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: '#1A1A1A',
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: {
    width: 56,
    height: 56,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const [currentPage, setCurrentPage] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const router = useRouter();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  // Auth state (step 4)
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Stable random 3 use-case cards — lazy initialiser runs once
  const [selectedCards] = useState<UseCase[]>(() => pickThreeRandom());

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  // ── Haptics helpers ──────────────────────────────────────────────────────
  const hapticLight = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
    }
  };
  const hapticMedium = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
    }
  };
  const hapticHeavy = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (_) {}
    }
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const handleNext = () => {
    console.log('[Onboarding] Chevron right pressed, currentPage:', currentPage);
    hapticLight();
    if (currentPage < 3) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      scrollViewRef.current?.scrollTo({ x: nextPage * SCREEN_WIDTH, animated: true });
    }
  };

  const handlePrev = () => {
    console.log('[Onboarding] Chevron left pressed, currentPage:', currentPage);
    hapticLight();
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      scrollViewRef.current?.scrollTo({ x: prevPage * SCREEN_WIDTH, animated: true });
    }
  };

  const handleGoToLogin = () => {
    console.log('[Onboarding] Login/Signup button pressed, jumping to step 4');
    hapticMedium();
    setCurrentPage(3);
    scrollViewRef.current?.scrollTo({ x: 3 * SCREEN_WIDTH, animated: true });
  };

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    if (page !== currentPage) {
      setCurrentPage(page);
    }
  };

  // ── Onboarding completion ────────────────────────────────────────────────
  const markOnboardingComplete = async (userId: string) => {
    console.log('[Onboarding] Marking onboarding complete for user:', userId);
    const { data: existingJourney, error: fetchError } = await supabase
      .from('user_journeys')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[Onboarding] Error fetching user journey:', fetchError);
    }

    if (existingJourney) {
      console.log('[Onboarding] Updating existing user journey record');
      const { error: updateError } = await supabase
        .from('user_journeys')
        .update({ main_onboarding_date: new Date().toISOString() })
        .eq('user_id', userId);
      if (updateError) {
        console.error('[Onboarding] Error updating user journey:', updateError);
      } else {
        console.log('[Onboarding] Successfully updated user journey');
      }
    } else {
      console.log('[Onboarding] Inserting new user journey record');
      const { error: insertError } = await supabase
        .from('user_journeys')
        .insert({
          user_id: userId,
          main_onboarding_date: new Date().toISOString(),
        });
      if (insertError) {
        console.error('[Onboarding] Error inserting user journey:', insertError);
      } else {
        console.log('[Onboarding] Successfully inserted user journey');
      }
    }
  };

  // ── Login history ────────────────────────────────────────────────────────
  const logLogin = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('login_history')
        .insert([{ user_id: userId, login_at: new Date().toISOString() }]);
      if (error) {
        console.error('[Onboarding] Error logging login:', error);
      } else {
        console.log('[Onboarding] Login logged successfully');
      }
    } catch (err) {
      console.error('[Onboarding] Error logging login:', err);
    }
  };

  // ── Apple sign-in ────────────────────────────────────────────────────────
  const handleAppleSignIn = async () => {
    console.log('[Onboarding] Apple sign-in button pressed');
    try {
      setAuthLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        console.log('[Apple] No identity token returned');
        Alert.alert('Sign In Error', 'No identity token returned from Apple');
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });

      if (error) {
        console.error('[Apple] Supabase sign-in error:', error.message);
        Alert.alert('Sign In Error', error.message);
        return;
      }

      if (data.user) {
        console.log('[Onboarding] Apple sign-in successful:', data.user.id);

        // Apple only returns fullName on FIRST sign-in. Persist it.
        const appleFullName = [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean)
          .join(' ')
          .trim();

        if (appleFullName && !data.user.user_metadata?.full_name) {
          console.log('[Apple] Persisting full_name to Supabase user_metadata:', appleFullName);
          const { error: updateError } = await supabase.auth.updateUser({
            data: { full_name: appleFullName },
          });
          if (updateError) {
            console.error('[Apple] Failed to persist full_name:', updateError.message);
          } else {
            console.log('[Apple] full_name persisted successfully');
          }
        }

        hapticHeavy();
        await logLogin(data.user.id);

        if (isCompleting) return;
        setIsCompleting(true);

        try {
          await markOnboardingComplete(data.user.id);
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('[Onboarding] Apple sign-in: navigating to home screen');
          router.replace('/(tabs)/(home)');
        } catch (navErr) {
          console.error('[Onboarding] Error completing onboarding after Apple sign-in:', navErr);
          router.replace('/(tabs)/(home)');
        } finally {
          setIsCompleting(false);
        }
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') {
        console.log('[Onboarding] Apple sign-in cancelled by user');
        return;
      }
      console.error('[Onboarding] Apple sign-in error:', e);
      Alert.alert('Error', 'An unexpected error occurred during Apple sign-in');
    } finally {
      setAuthLoading(false);
    }
  };

  // ── Auth handler ─────────────────────────────────────────────────────────
  const handleAuth = async () => {
    if (isSignUp && !name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }
    console.log('[Onboarding] Auth button pressed, isSignUp:', isSignUp, 'email:', email);

    try {
      setAuthLoading(true);

      if (isSignUp) {
        console.log('[Onboarding] Attempting sign up for:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: AUTH_REDIRECT_URLS.EMAIL_CONFIRMED,
            data: name.trim() ? { full_name: name.trim() } : undefined,
          },
        });

        if (error) {
          console.error('[Onboarding] Sign up error:', error.message);
          Alert.alert('Sign Up Error', error.message);
        } else if (data.user) {
          console.log('[Onboarding] Sign up successful, email confirmation required');
          Alert.alert(
            'Check your email',
            'Account created! Please check your email to verify your account before signing in.',
            [{ text: 'OK' }]
          );
          setIsSignUp(false);
          // Do NOT mark onboarding complete — wait for actual sign-in after email confirmation
        }
      } else {
        console.log('[Onboarding] Attempting sign in for:', email);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          console.error('[Onboarding] Sign in error:', error.message);
          Alert.alert('Sign In Error', error.message);
        } else if (data.user) {
          console.log('[Onboarding] Sign in successful, user:', data.user.id);
          hapticHeavy();
          await logLogin(data.user.id);

          if (isCompleting) return;
          setIsCompleting(true);

          try {
            await markOnboardingComplete(data.user.id);
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('[Onboarding] Navigating to home screen');
            router.replace('/(tabs)/(home)');
          } catch (navErr) {
            console.error('[Onboarding] Error completing onboarding after sign in:', navErr);
            router.replace('/(tabs)/(home)');
          } finally {
            setIsCompleting(false);
          }
        }
      }
    } catch (err) {
      console.error('[Onboarding] Unexpected auth error:', err);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = () => {
    console.log('[Onboarding] Forgot password pressed');
    router.push('/reset-password');
  };

  const handleToggleSignUp = () => {
    console.log('[Onboarding] Toggle sign up/in, switching to:', !isSignUp ? 'sign up' : 'sign in');
    setIsSignUp(!isSignUp);
  };

  // ── Derived display values ───────────────────────────────────────────────
  const authButtonLabel = isSignUp ? 'Create account' : 'Sign in';
  const switchLabel = isSignUp
    ? 'Already have an account? Sign in'
    : "Don't have an account? Sign up";
  const authTitle = isSignUp ? 'Create your account' : 'Welcome back';
  const authSubtitle = isSignUp
    ? 'Join Recall and start building your second brain.'
    : 'Sign in to continue to Recall.';

  const allCards = [...selectedCards, ANYTHING_CARD];

  // Content top padding — below the top bar (approx 60px bar height)
  const contentTopPadding = 16;
  const bottomInset = insets.bottom;

  return (
    <View style={styles.container}>
      {/* ── Persistent Top Bar ── */}
      <TopBar currentStep={currentPage} onLoginPress={handleGoToLogin} />

      {/* ── Horizontal pager ── */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
        scrollEnabled={!isCompleting && !authLoading}
      >
        {/* ════════════════════════════════════════════════════════════════
            PAGE 1 — Welcome to Recall
        ════════════════════════════════════════════════════════════════ */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[styles.pageScrollContent, { paddingTop: contentTopPadding }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero image */}
            <View style={styles.heroImageWrapper}>
              <Image
                source={require('@/assets/images/onboarding/hero-stack.jpg')}
                style={styles.heroImage}
                resizeMode="cover"
              />
              <View style={styles.heroImageOverlay} />
            </View>

            {/* Hero copy */}
            <Text style={styles.heroHeadline}>Capture anything.</Text>
            <Text style={styles.heroHeadlineAccent}>Recall it later.</Text>
            <Text style={styles.heroSubtitle}>
              Recall is your second brain for anything you want to remember — a thought, a website,
              that Insta post, some photos, a place. Save it in seconds. Recall it later.
            </Text>

            {/* How it works teaser */}
            <View style={styles.howItWorksRow}>
              <View style={styles.howStep}>
                <View style={styles.howStepNumber}>
                  <Text style={styles.howStepNumberText}>01</Text>
                </View>
                <Text style={styles.howStepLabel}>Create</Text>
                <Text style={styles.howStepDesc}>
                  Add a Recall — some text, a URL, photos, a location.
                </Text>
              </View>
              <View style={styles.howDivider} />
              <View style={styles.howStep}>
                <View style={styles.howStepNumber}>
                  <Text style={styles.howStepNumberText}>02</Text>
                </View>
                <Text style={styles.howStepLabel}>Recall</Text>
                <Text style={styles.howStepDesc}>
                  Search anything — a word, that place, those people, ask a question. It surfaces.
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 2 — What is a Recall?
        ════════════════════════════════════════════════════════════════ */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[styles.pageScrollContent, { paddingTop: contentTopPadding }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <Text style={styles.sectionHeading}>What is a Recall?</Text>
            <Text style={styles.sectionSubheading}>
              A Recall is more than just a note. It's everything your memory needs — kept in your
              second brain.
            </Text>

						<FeaturePill
              icon={<FileText size={24} color={CORAL} strokeWidth={2} />}
              label="Text"
              description="Write a thought, an observation, some notes — anything really."
            />
						<FeaturePill
              icon={<Images size={24} color={CORAL} strokeWidth={2} />}
              label="Images"
              description="Attach images. Recall will analyse them; ready when you need anything from them."
            />
            <FeaturePill
              icon={<MapPin size={24} color={CORAL} strokeWidth={2} />}
              label="A place"
              description="Pin a location so you remember where it happened."
            />
            <FeaturePill
              icon={<Globe size={24} color={CORAL} strokeWidth={2} />}
              label="Links"
              description="Include a URL and the content will be available for you to Recall."
            />
            <FeaturePill
              icon={<User size={24} color={CORAL} strokeWidth={2} />}
              label="People"
              description="Recall surfaces and tags people mentioned anywhere — even in the images."
            />
						
            {/* Spacer so content clears the bottom chevrons */}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 3 — Use Cases
        ════════════════════════════════════════════════════════════════ */}
        <View style={[styles.page, { width: SCREEN_WIDTH }]}>
          <ScrollView
            contentContainerStyle={[styles.pageScrollContent, { paddingTop: contentTopPadding }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <Text style={styles.sectionHeading}>What to use Recall for?</Text>
            <Text style={styles.sectionSubheading}>
              A few of the things people use Recall for. Slide through to see what it could do for
              you.
            </Text>

            {allCards.map((card, index) => (
              <UseCaseCard
                key={card.key}
                card={card}
                index={index}
                isLast={index === allCards.length - 1}
              />
            ))}

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>

        {/* ════════════════════════════════════════════════════════════════
            PAGE 4 — Login / Sign Up
        ════════════════════════════════════════════════════════════════ */}
        <KeyboardAvoidingView
          style={{ width: SCREEN_WIDTH }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={[styles.pageScrollContent, styles.authScrollContent, { paddingTop: contentTopPadding + 8 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Brand */}
            <View style={styles.authBrandRow}>
              <Image
                source={require('@/assets/images/976f1127-ecb6-4965-9721-d979165ced5e.png')}
                style={styles.authBrandIcon}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.authTitle}>{authTitle}</Text>
            <Text style={styles.authSubtitle}>{authSubtitle}</Text>

            {/* Apple Sign In — Apple HIG Guideline 4.8: must be first social option */}
            {appleAvailable && Platform.OS === 'ios' && (
              <View style={styles.appleSection}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={isSignUp
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={10}
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                />
                <View style={styles.appleDividerContainer}>
                  <View style={styles.appleDividerLine} />
                  <Text style={styles.appleDividerText}>or continue with email</Text>
                  <View style={styles.appleDividerLine} />
                </View>
              </View>
            )}

            {/* Inputs */}
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full name</Text>
                <View style={styles.inputWrapper}>
                  <IconSymbol
                    name="person.fill"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor={colors.textTertiary}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                    returnKeyType="next"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputWrapper}>
                <IconSymbol
                  name="envelope.fill"
                  size={18}
                  color={colors.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <IconSymbol
                  name="lock.fill"
                  size={18}
                  color={colors.textSecondary}
                />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                  }}
                  secureTextEntry
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleAuth}
                />
              </View>
            </View>

            {/* Forgot password */}
            {!isSignUp && (
              <AnimatedPressable
                onPress={handleForgotPassword}
                style={styles.forgotButton}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </AnimatedPressable>
            )}

            {/* Primary CTA */}
            <AnimatedPressable
              onPress={handleAuth}
              disabled={authLoading || isCompleting}
              style={[
                styles.authButton,
                (authLoading || isCompleting) && styles.authButtonDisabled,
              ]}
            >
              {authLoading || isCompleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.authButtonText}>{authButtonLabel}</Text>
              )}
            </AnimatedPressable>

            {/* Toggle sign-in / sign-up */}
            <AnimatedPressable
              onPress={handleToggleSignUp}
              disabled={authLoading}
              style={styles.switchButton}
            >
              <Text style={styles.switchText}>{switchLabel}</Text>
            </AnimatedPressable>



            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </ScrollView>

      {/* ── Chevron navigation ── */}
      <ChevronNav
        currentStep={currentPage}
        onPrev={handlePrev}
        onNext={handleNext}
        bottomInset={bottomInset}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const BOTTOM_PADDING = Platform.OS === 'android' ? 32 : 48;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Pager ──
  scrollView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: BOTTOM_PADDING,
  },

  // ── Page 1: Hero ──
  heroImageWrapper: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.28,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,26,26,0.15)',
  },
  heroHeadline: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 44,
  },
  heroHeadlineAccent: {
    fontSize: 38,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.8,
    lineHeight: 44,
    marginBottom: 20,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#B0B0B0',
    lineHeight: 24,
    marginBottom: 32,
  },
  howItWorksRow: {
    flexDirection: 'row',
    backgroundColor: '#242424',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333333',
    gap: 16,
  },
  howStep: {
    flex: 1,
  },
  howStepNumber: {
    marginBottom: 6,
  },
  howStepNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  howStepLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  howStepDesc: {
    fontSize: 13,
    color: '#B0B0B0',
    lineHeight: 19,
  },
  howDivider: {
    width: 1,
    backgroundColor: '#333333',
    alignSelf: 'stretch',
  },

  // ── Pages 2 & 3: Section headings ──
  sectionHeading: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  sectionSubheading: {
    fontSize: 15,
    color: '#B0B0B0',
    lineHeight: 22,
    marginBottom: 24,
  },

  // ── Page 4: Auth ──
  authScrollContent: {},
  authBrandRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  authBrandIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
  },
  authTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 15,
    color: '#B0B0B0',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B0B0B0',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#242424',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    minHeight: 24,
  },
  forgotButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  authButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
    boxShadow: '0px 4px 12px rgba(255,107,122,0.3)',
    elevation: 6,
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  switchButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  switchText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  appleDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 4,
  },
  appleDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3A3A3A',
  },
  appleDividerText: {
    fontSize: 13,
    color: '#B0B0B0',
    marginHorizontal: 12,
    fontWeight: '500',
  },
  appleSection: {
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
});
