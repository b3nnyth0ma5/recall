
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  Linking,
  Animated,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  id: string;
  created_at: string;
}

interface RecallChatModalProps {
  visible: boolean;
  recall: Note | null;
  onClose: () => void;
}

const FadeInView: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

const TypingIndicator = () => {
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in container
    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Pulsing dots with staggered delay
    const makePulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );

    const anim1 = makePulse(dot1Opacity, 0);
    const anim2 = makePulse(dot2Opacity, 200);
    const anim3 = makePulse(dot3Opacity, 400);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1Opacity, dot2Opacity, dot3Opacity, containerOpacity]);

  return (
    <Animated.View
      style={[styles.messageContainer, styles.assistantMessageContainer, { opacity: containerOpacity }]}
    >
      <View style={styles.avatarContainer}>
        <View style={styles.assistantAvatar}>
          <IconSymbol name="sparkles" size={20} color={colors.background} />
        </View>
      </View>
      <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
        <View style={styles.typingIndicator}>
          <Animated.View style={[styles.typingDot, { opacity: dot1Opacity }]} />
          <Animated.View style={[styles.typingDot, { opacity: dot2Opacity }]} />
          <Animated.View style={[styles.typingDot, { opacity: dot3Opacity }]} />
        </View>
      </View>
    </Animated.View>
  );
};

export const RecallChatModal: React.FC<RecallChatModalProps> = ({
  visible,
  recall,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [usedQuestions, setUsedQuestions] = useState<Set<string>>(new Set());
  const pillsOpacity = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const sendButtonAnim = useRef(new Animated.Value(0)).current;

  const LINE_HEIGHT = 20;
  const MAX_LINES = 5;
  const MAX_INPUT_HEIGHT = LINE_HEIGHT * MAX_LINES + 20; // +20 for vertical padding

  const loadChatHistory = useCallback(async (): Promise<boolean> => {
    if (!recall) {
      return false;
    }

    console.log('Loading chat history for recall:', recall.id);
    setIsLoadingHistory(true);

    try {
      const { data: chatHistory, error } = await supabase
        .from('recall_chats')
        .select('id, user_question, chat_answer, followup_questions, created_at')
        .eq('recall_id', recall.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading chat history:', error);
        return false;
      }

      if (chatHistory && chatHistory.length > 0) {
        const formattedMessages: ChatMessage[] = [];
        
        chatHistory.forEach((chat) => {
          // Add user message
          formattedMessages.push({
            role: 'user',
            content: chat.user_question,
            id: `${chat.id}-user`,
            created_at: chat.created_at,
          });
          
          // Add assistant message
          if (chat.chat_answer) {
            formattedMessages.push({
              role: 'assistant',
              content: chat.chat_answer,
              id: `${chat.id}-assistant`,
              created_at: chat.created_at,
            });
          }
        });

        setMessages(formattedMessages);
        console.log(`Loaded ${formattedMessages.length} messages from history`);

        // Find the most recent chat record with followup_questions
        const withFollowups = [...chatHistory].reverse().find(
          (c) => c.followup_questions && Array.isArray(c.followup_questions) && c.followup_questions.length > 0
        );
        if (withFollowups) {
          console.log('[RecallChat] Restoring followup questions from history');
          setSuggestedQuestions(withFollowups.followup_questions);
        }

        return true;
      }
      return false;
    } catch (error) {
      console.error('Error loading chat history:', error);
      return false;
    } finally {
      setIsLoadingHistory(false);
    }
  }, [recall]);

  const loadSuggestedQuestions = useCallback(async () => {
    if (!recall) return;
    console.log('[RecallChat] Loading suggested questions for recall:', recall.id);
    setIsLoadingSuggestions(true);
    try {
      let imageData: { id: string; ocr_text?: string; image_explanation?: string }[] = [];
      if (recall.imageIds && recall.imageIds.length > 0) {
        const { data: fetchedImages } = await supabase
          .from('recall_images')
          .select('id, ocr_text, image_explanation')
          .in('id', recall.imageIds);
        if (fetchedImages) imageData = fetchedImages;
      }
      const recallData = {
        id: recall.id,
        text: recall.text || '',
        location: recall.location,
        location_primary_type: recall.location_primary_type,
        images: imageData,
      };
      console.log('[RecallChat] Calling chat-with-recalls for suggested questions (empty question)');
      const { data, error } = await supabase.functions.invoke('chat-with-recalls', {
        body: { recall: recallData, user_question: '', chat_history: [] },
      });
      if (!error && data?.suggested_questions?.length) {
        console.log('[RecallChat] Received', data.suggested_questions.length, 'suggested questions');
        setSuggestedQuestions(data.suggested_questions);
      }
    } catch (e) {
      console.error('[RecallChat] Error loading suggestions:', e);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [recall]);

  // Load chat history when modal opens
  useEffect(() => {
    if (visible && recall) {
      (async () => {
        const hadHistory = await loadChatHistory();
        if (!hadHistory) {
          loadSuggestedQuestions();
        }
      })();
    } else {
      // Clear messages when modal closes
      setMessages([]);
      setInputText('');
      setSuggestedQuestions([]);
      setUsedQuestions(new Set());
    }
  }, [visible, recall, loadChatHistory, loadSuggestedQuestions]);

  // Auto-scroll to bottom when new messages or suggestions arrive
  useEffect(() => {
    if (messages.length > 0 || suggestedQuestions.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, suggestedQuestions]);

  // Animate pills in when they appear
  useEffect(() => {
    if (suggestedQuestions.length > 0 && !isLoadingSuggestions) {
      pillsOpacity.setValue(0);
      Animated.timing(pillsOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [suggestedQuestions, isLoadingSuggestions, pillsOpacity]);

  // Animate send button when canSend changes
  const canSend = inputText.trim().length > 0 && !isLoading;
  useEffect(() => {
    Animated.timing(sendButtonAnim, {
      toValue: canSend ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [canSend, sendButtonAnim]);

  const sendButtonBg = sendButtonAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.cardDark, colors.primary],
  });

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === 'Enter') {
        // Shift+Enter on hardware keyboards inserts newline — handled by OS
        // Plain Enter submits
        console.log('[RecallChat] Enter key pressed — submitting message');
        handleSendMessage();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inputText, isLoading]
  );

  const handleCopyMessage = useCallback(async (content: string) => {
    console.log('User long-pressed message to copy');
    
    try {
      await Clipboard.setStringAsync(content);
      
      // Haptic feedback
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      
      // Show toast
      Toast.show({
        type: 'success',
        text1: 'Copied to clipboard',
        position: 'bottom',
        visibilityTime: 2000,
      });
      
      console.log('Message copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Toast.show({
        type: 'error',
        text1: 'Failed to copy',
        position: 'bottom',
        visibilityTime: 2000,
      });
    }
  }, []);

  const handleSuggestionTap = useCallback((question: string) => {
    console.log('[RecallChat] User tapped suggested question pill:', question);
    setUsedQuestions(prev => new Set([...prev, question]));
    setSuggestedQuestions([]);
    setInputText('');
    sendMessageWithText(question);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessageWithText = async (text: string) => {
    const trimmedText = text.trim();

    if (!trimmedText || !recall) {
      return;
    }

    console.log('[RecallChat] Sending message:', trimmedText);

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        console.error('Error triggering haptic feedback:', error);
      }
    }

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedText,
      id: `temp-user-${Date.now()}`,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // Build chat history for API (only role and content)
      const chatHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Fetch complete image data from database if images exist
      let imageData: { id: string; ocr_text?: string; image_explanation?: string }[] = [];
      
      if (recall.imageIds && recall.imageIds.length > 0) {
        console.log('Fetching image data for', recall.imageIds.length, 'images');
        
        const { data: fetchedImages, error: imageError } = await supabase
          .from('recall_images')
          .select('id, ocr_text, image_explanation')
          .in('id', recall.imageIds);

        if (imageError) {
          console.error('Error fetching image data:', imageError);
          imageData = recall.imageIds.map(id => ({ id }));
        } else if (fetchedImages && fetchedImages.length > 0) {
          console.log('Successfully fetched', fetchedImages.length, 'images with OCR and explanations');
          imageData = fetchedImages;
        } else {
          console.log('No images found in database');
          imageData = recall.imageIds.map(id => ({ id }));
        }
      }

      // Prepare recall data for API with complete image information
      const recallData = {
        id: recall.id,
        text: recall.text || '',
        location: recall.location,
        location_primary_type: recall.location_primary_type,
        images: imageData,
      };

      console.log('Calling chat-with-recalls edge function with', imageData.length, 'images');

      const { data, error } = await supabase.functions.invoke('chat-with-recalls', {
        body: {
          recall: recallData,
          user_question: trimmedText,
          chat_history: chatHistory,
        },
      });

      if (error) {
        console.error('Error calling chat function:', error);
        throw error;
      }

      console.log('Received response from chat function');

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.chat_answer || 'Sorry, I could not generate a response.',
        id: data.chat_record_id || `temp-assistant-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update followup questions if provided
      if (data.followup_questions && Array.isArray(data.followup_questions) && data.followup_questions.length > 0) {
        console.log('[RecallChat] Received', data.followup_questions.length, 'followup questions');
        setSuggestedQuestions(data.followup_questions);
        setUsedQuestions(new Set());
      }

      // Success haptic
      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Error haptic
      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (error) {
          console.error('Error triggering haptic feedback:', error);
        }
      }

      // Add error message
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your question. Please try again.',
        id: `error-${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmedText = inputText.trim();
    
    if (!trimmedText || !recall) {
      return;
    }

    console.log('[RecallChat] Send button — delegating to sendMessageWithText');
    await sendMessageWithText(trimmedText);
  };

  const handleClose = () => {
    console.log('User closed chat modal');
    onClose();
  };

  const handleBackdropPress = () => {
    handleClose();
  };

  const renderMessageContent = (content: string) => {
    // URL regex pattern to detect http/https URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    
    return parts.map((part, index) => {
      // Check if this part is a URL
      if (part.match(urlRegex)) {
        const urlText = part;
        return (
          <Text
            key={index}
            style={styles.linkText}
            onPress={() => {
              console.log('User tapped URL:', urlText);
              Linking.openURL(urlText).catch((err) => {
                console.error('Error opening URL:', err);
                Toast.show({
                  type: 'error',
                  text1: 'Could not open link',
                  position: 'bottom',
                  visibilityTime: 2000,
                });
              });
            }}
          >
            {urlText}
          </Text>
        );
      }
      
      // Regular text
      const textContent = part;
      return (
        <Text key={index}>
          {textContent}
        </Text>
      );
    });
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    return (
      <FadeInView key={message.id}>
        <View
          style={[
            styles.messageContainer,
            isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
          ]}
        >
          <View style={styles.avatarContainer}>
            {isUser ? (
              <View style={styles.userAvatar}>
                <IconSymbol name="person" size={20} color={colors.text} />
              </View>
            ) : (
              <View style={styles.assistantAvatar}>
                <IconSymbol name="sparkles" size={20} color={colors.background} />
              </View>
            )}
          </View>
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text
              style={styles.messageText}
              selectable={true}
              onLongPress={() => handleCopyMessage(message.content)}
            >
              {renderMessageContent(message.content)}
            </Text>
          </View>
        </View>
      </FadeInView>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.kavWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.brainIconContainer}>
                  <IconSymbol 
                    name="sparkles" 
                    size={24} 
                    color={colors.text} 
                  />
                </View>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>Chat with this Recall</Text>
                  <Text style={styles.headerSubtitle}>Ask questions about this memory</Text>
                </View>
              </View>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <IconSymbol 
                  name="xmark" 
                  size={20} 
                  color={colors.text} 
                />
              </Pressable>
            </View>

            {/* Messages Area - Properly structured for scrolling */}
            <View style={styles.messagesContainer}>
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesScrollView}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={true}
                scrollEnabled={true}
                bounces={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled={true}
                removeClippedSubviews={false}
              >
                {isLoadingHistory ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading chat history...</Text>
                  </View>
                ) : messages.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <IconSymbol 
                      name="message" 
                      size={48} 
                      color={colors.textSecondary} 
                    />
                    <Text style={styles.emptyText}>Start a conversation</Text>
                    <Text style={styles.emptySubtext}>
                      Ask questions about this recall and I&apos;ll help you find answers
                    </Text>
                  </View>
                ) : (
                  messages.map((message) => renderMessage(message))
                )}

                {isLoading && <TypingIndicator />}

                {/* Skeleton pills while suggestions are loading */}
                {isLoadingSuggestions && (
                  <View style={styles.suggestionsInChat}>
                    {[140, 110, 160].map((w, i) => (
                      <View key={i} style={[styles.skeletonPill, { width: w, alignSelf: 'flex-end' }]} />
                    ))}
                  </View>
                )}

                {/* Suggestion pills — right-aligned in chat area */}
                {!isLoadingSuggestions && suggestedQuestions.filter(q => !usedQuestions.has(q)).length > 0 && (
                  <View style={styles.suggestionsInChat}>
                    {suggestedQuestions.filter(q => !usedQuestions.has(q)).map((question, i) => (
                      <Pressable key={i} style={[styles.suggestionPill, { alignSelf: 'flex-end' }]} onPress={() => handleSuggestionTap(question)}>
                        <Text style={styles.suggestionPillText}>{question}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Input Area - Fixed at bottom */}
            <Pressable
              style={styles.inputContainer}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.inputPill}>
                <TextInput
                  style={[styles.input, { height: Math.min(inputHeight, MAX_INPUT_HEIGHT) }]}
                  placeholder="Ask a question..."
                  placeholderTextColor={colors.textSecondary}
                  value={inputText}
                  onChangeText={(text) => {
                    setInputText(text);
                    if (text.length > 0 && suggestedQuestions.length > 0) {
                      setSuggestedQuestions([]);
                    }
                  }}
                  multiline
                  maxLength={500}
                  editable={!isLoading}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={() => {
                    console.log('[RecallChat] onSubmitEditing fired — submitting message');
                    handleSendMessage();
                  }}
                  submitBehavior="submit"
                  enablesReturnKeyAutomatically={true}
                  onKeyPress={handleKeyPress}
                  onContentSizeChange={(e) => {
                    setInputHeight(e.nativeEvent.contentSize.height);
                  }}
                />
                <Animated.View style={[styles.sendButtonWrapper, { backgroundColor: sendButtonBg }]}>
                  <Pressable
                    onPress={() => {
                      console.log('[RecallChat] Send button pressed');
                      handleSendMessage();
                    }}
                    disabled={!canSend}
                    style={styles.sendButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol
                      name="arrow.up"
                      size={20}
                      color={canSend ? '#FFFFFF' : colors.textSecondary}
                    />
                  </Pressable>
                </Animated.View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 500,
    height: '85%',
    maxHeight: 750,
  },
  modalContent: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brainIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  messagesContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  messagesScrollView: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#E0E0E0',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#1A1A1A',
  },
  linkText: {
    fontSize: 15,
    lineHeight: 20,
    color: '#0066CC',
    textDecorationLine: 'underline',
  },
  typingBubble: {
    paddingVertical: 12,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  kavWrapper: {
    flex: 1,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.cardDark,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    minHeight: 40,
    paddingVertical: 4,
    lineHeight: 20,
  },
  sendButtonWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    // kept for legacy reference — visual state now driven by sendButtonWrapper animation
  },
  sendButtonDisabled: {
    // kept for legacy reference
  },
  suggestionsInChat: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: 8,
  },
  suggestionPill: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: `${colors.primary}15`,
    maxWidth: 220,
  },
  suggestionPillText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '500',
    lineHeight: 18,
  },
  skeletonPill: {
    height: 36,
    borderRadius: 20,
    backgroundColor: colors.cardDark,
    opacity: 0.5,
  },
});
