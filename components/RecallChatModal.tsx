
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';
import { Note } from '@/types/Note';
import { supabase } from '@/utils/supabase';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

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

export const RecallChatModal: React.FC<RecallChatModalProps> = ({
  visible,
  recall,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load chat history when modal opens
  useEffect(() => {
    if (visible && recall) {
      loadChatHistory();
    } else {
      // Clear messages when modal closes
      setMessages([]);
      setInputText('');
    }
  }, [visible, recall]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const loadChatHistory = async () => {
    if (!recall) {
      return;
    }

    console.log('Loading chat history for recall:', recall.id);
    setIsLoadingHistory(true);

    try {
      const { data: chatHistory, error } = await supabase
        .from('recall_chats')
        .select('id, user_question, chat_answer, created_at')
        .eq('recall_id', recall.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error loading chat history:', error);
        return;
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
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSendMessage = async () => {
    const trimmedText = inputText.trim();
    
    if (!trimmedText || !recall) {
      return;
    }

    console.log('User sending message:', trimmedText);

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

    // Dismiss keyboard
    Keyboard.dismiss();

    try {
      // Build chat history for API (only role and content)
      const chatHistory = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Prepare recall data for API
      const recallData = {
        id: recall.id,
        text: recall.text || '',
        location: recall.location,
        location_primary_type: recall.location_primary_type,
        images: recall.imageIds?.map((id, index) => ({
          id,
          ocr_text: '',
          image_explanation: '',
        })) || [],
      };

      console.log('Calling chat-with-recalls edge function...');

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

  const handleClose = () => {
    console.log('User closed chat modal');
    onClose();
  };

  const handleBackdropPress = () => {
    handleClose();
  };

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';
    
    return (
      <Animated.View
        key={message.id}
        entering={FadeIn.duration(300)}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {/* Avatar */}
        <View style={styles.avatarContainer}>
          {isUser ? (
            <View style={styles.userAvatar}>
              <IconSymbol name="person" size={20} color={colors.background} />
            </View>
          ) : (
            <View style={styles.assistantAvatar}>
              <IconSymbol name="brain" size={20} color="#FFFFFF" />
            </View>
          )}
        </View>

        {/* Message Bubble */}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}
          >
            {message.content}
          </Text>
        </View>
      </Animated.View>
    );
  };

  const renderTypingIndicator = () => {
    return (
      <Animated.View
        entering={FadeIn.duration(300)}
        style={[styles.messageContainer, styles.assistantMessageContainer]}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.assistantAvatar}>
            <IconSymbol name="brain" size={20} color="#FFFFFF" />
          </View>
        </View>
        <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
          <View style={styles.typingIndicator}>
            <View style={[styles.typingDot, styles.typingDot1]} />
            <View style={[styles.typingDot, styles.typingDot2]} />
            <View style={[styles.typingDot, styles.typingDot3]} />
          </View>
        </View>
      </Animated.View>
    );
  };

  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleBackdropPress}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          <Animated.View entering={SlideInDown.duration(300)} style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.brainIconContainer}>
                  <IconSymbol name="brain" size={24} color={colors.primary} />
                </View>
                <View style={styles.headerTextContainer}>
                  <Text style={styles.headerTitle}>Chat with Recall</Text>
                  <Text style={styles.headerSubtitle}>Ask questions about this memory</Text>
                </View>
              </View>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <IconSymbol name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Messages */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.chatContainer}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesScrollView}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {isLoadingHistory ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading chat history...</Text>
                  </View>
                ) : messages.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <IconSymbol name="message" size={48} color={colors.textSecondary} />
                    <Text style={styles.emptyText}>Start a conversation</Text>
                    <Text style={styles.emptySubtext}>
                      Ask questions about this recall and I'll help you find answers
                    </Text>
                  </View>
                ) : (
                  messages.map((message) => renderMessage(message))
                )}

                {isLoading && renderTypingIndicator()}
              </ScrollView>

              {/* Input Area */}
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Ask a question..."
                  placeholderTextColor={colors.textSecondary}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={500}
                  editable={!isLoading}
                  onSubmitEditing={handleSendMessage}
                  blurOnSubmit={false}
                />
                <Pressable
                  onPress={handleSendMessage}
                  disabled={!canSend}
                  style={[
                    styles.sendButton,
                    canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
                  ]}
                >
                  <IconSymbol
                    name="paperplane.fill"
                    size={20}
                    color={canSend ? '#FFFFFF' : colors.textSecondary}
                  />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </Pressable>
      </Pressable>
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
    height: '80%',
    maxHeight: 700,
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
    backgroundColor: colors.primaryLight,
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
    padding: 8,
    marginLeft: 8,
  },
  chatContainer: {
    flex: 1,
  },
  messagesScrollView: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF69B4',
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
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#FF69B4',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  assistantMessageText: {
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    opacity: 0.6,
  },
  typingDot1: {
    animationDelay: '0s',
  },
  typingDot2: {
    animationDelay: '0.2s',
  },
  typingDot3: {
    animationDelay: '0.4s',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonActive: {
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.cardDark,
  },
});
