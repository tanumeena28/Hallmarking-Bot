import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Animated,
  Dimensions
} from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const sidebarWidth = width * 0.78;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  language?: string;
  logId?: number;
  userFeedback?: 'up' | 'down';
}

interface ConversationSession {
  id: number;
  started_at: string;
  preview: string;
}

export default function ChatScreen({ navigation }: any) {
  // Chat Session & View State
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [fetchingSessions, setFetchingSessions] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  // Chat Message State
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [activeSpeakingId, setActiveSpeakingId] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [isProfileIncomplete, setIsProfileIncomplete] = useState(false);
  const [ttsConfig, setTtsConfig] = useState<{ provider: string; is_premium: boolean }>({
    provider: 'gtts',
    is_premium: false,
  });
  
  // Sidebar Animation State
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const flatListRef = useRef<FlatList>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  // Sidebar controls
  const openSidebar = () => {
    loadSessions();
    setSidebarOpen(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const closeSidebar = () => {
    Animated.timing(slideAnim, {
      toValue: -sidebarWidth,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSidebarOpen(false));
  };

  // Load list of conversations
  const loadSessions = async () => {
    setFetchingSessions(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/chat/conversations`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setFetchingSessions(false);
    }
  };

  const checkProfileCompleteness = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) return;

      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const u = await response.json();
        // Required fields: phone, company, designation, age, bis_registration_number (except for nch_admin)
        const isMissing = !u.phone?.trim() || 
                          !u.company?.trim() || 
                          !u.designation?.trim() || 
                          !u.age || 
                          (u.role !== 'nch_admin' && !u.bis_registration_number?.trim());
        
        setIsProfileIncomplete(isMissing);
      }
    } catch (error) {
      console.error('Error verifying profile completeness:', error);
    }
  };

  // Load history on initial mount so user list is ready
  useEffect(() => {
    loadSessions();
    checkProfileCompleteness();

    const unsubscribe = navigation.addListener('focus', () => {
      checkProfileCompleteness();
    });
    
    async function getVoices() {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        setAvailableVoices(voices || []);
      } catch (err) {
        console.error('Error fetching available TTS voices:', err);
      }
    }
    getVoices();

    async function getTtsConfig() {
      try {
        const res = await fetch(`${apiUrl}/bot/tts-info`);
        if (res.ok) {
          const data = await res.json();
          setTtsConfig(data);
          console.log('Loaded TTS Config from server:', data);
        }
      } catch (err) {
        console.warn('Failed to load TTS config from server:', err);
      }
    }
    if (apiUrl) {
      getTtsConfig();
    }

    return () => {
      Speech.stop();
      unsubscribe();
    };
  }, [navigation, apiUrl]);

  // Fetch message history for a chosen session
  const loadMessageHistory = async (conversationId: number) => {
    Speech.stop();
    setActiveSpeakingId(null);
    setFetchingHistory(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${apiUrl}/chat/conversations/${conversationId}/messages`, {
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const history: Message[] = data.map((msg: any) => ({
          id: msg.id.toString(),
          text: msg.content,
          isUser: msg.role === 'user',
          timestamp: new Date(msg.timestamp),
          language: msg.language,
          logId: msg.role === 'bot' ? msg.query_log_id : undefined,
          userFeedback: msg.feedback_rating === 1 ? 'up' : (msg.feedback_rating === -1 ? 'down' : undefined)
        }));
        
        if (history.length === 0) {
          setMessages([
            { id: 'welcome', text: 'Hello! I am the Hallmarking Bot. How can I help you today?', isUser: false, timestamp: new Date() }
          ]);
        } else {
          setMessages(history);
        }
        setCurrentConversationId(conversationId);
        closeSidebar();
      } else {
        Alert.alert('Error', 'Failed to retrieve conversation history');
      }
    } catch (error) {
      console.error('Error loading history:', error);
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setFetchingHistory(false);
    }
  };

  // Start a fresh chat session
  const startNewChat = async () => {
    Speech.stop();
    setActiveSpeakingId(null);
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${apiUrl}/chat/conversations`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMessages([
          { id: 'welcome', text: 'Hello! I am the Hallmarking Bot. How can I help you today?', isUser: false, timestamp: new Date() }
        ]);
        setCurrentConversationId(data.conversation_id);
        closeSidebar();
      } else {
        Alert.alert('Error', 'Failed to start a new chat session');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (textToPost?: string) => {
    const text = textToPost || inputText;
    if (!text.trim()) return;

    // Check if we need to auto-create a session first
    let activeId = currentConversationId;
    if (!activeId) {
      await startNewChat();
      return;
    }

    // Add user message locally
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const token = await SecureStore.getItemAsync('userToken');
      
      const response = await fetch(`${apiUrl}/bot/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ 
          message: text,
          conversation_id: activeId,
          platform: 'app'
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          isUser: false,
          timestamp: new Date(),
          language: data.language,
          logId: data.log_id
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        Alert.alert('Error', data.detail || 'Failed to get response');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
      console.error(error);
    } finally {
      setLoading(false);
      // Scroll to bottom
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow microphone access to use voice input.');
        return;
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    
    // Check if session is active
    let activeId = currentConversationId;
    if (!activeId) {
      Alert.alert('Notice', 'Please click "Start New Chat" or select a conversation from the menu first.');
      setRecording(null);
      await recording.stopAndUnloadAsync();
      return;
    }

    setRecording(null);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI(); 
    if (!uri) return;
    
    setLoading(true);
    
    try {
      const token = await SecureStore.getItemAsync('userToken');
      
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri,
        name: 'voice.m4a',
        type: 'audio/m4a',
      });
      
      const response = await fetch(`${apiUrl}/bot/ask-audio?conversation_id=${activeId}`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Add user message with refined transcript
        const userMessage: Message = {
          id: Date.now().toString(),
          text: data.question || "Voice Message",
          isUser: true,
          timestamp: new Date()
        };
        
        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: data.reply,
          isUser: false,
          timestamp: new Date(),
          language: data.language,
          logId: data.log_id
        };
        
        setMessages(prev => [...prev, userMessage, botMessage]);
        
        // Speak response in correct language
        speakResponse(data.reply, botMessage.id, data.language);
      } else {
        Alert.alert('Error', data.detail || 'Failed to get response');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
      console.error(error);
    } finally {
      setLoading(false);
      // Scroll to bottom
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const playBackendAudio = async (text: string, messageId: string, language?: string) => {
    try {
      const audioUrl = `${apiUrl}/bot/speak?text=${encodeURIComponent(text)}&language=${encodeURIComponent(language || 'en')}`;
      console.log('Playing server-side TTS:', audioUrl);

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        undefined,
        false // Start playing as it buffers
      );

      soundRef.current = sound;

      // Reset state once audio finishes playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          console.log('Server audio playback finished successfully.');
          setActiveSpeakingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (serverTtsErr) {
      console.warn('Backend TTS failed:', serverTtsErr);
      setActiveSpeakingId(null);
    }
  };

  const speakResponse = async (text: string, messageId: string, language?: string) => {
    // 1. Stop any active speech or playback
    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (unloadErr) {
        console.warn('Error unloading previous sound:', unloadErr);
      }
      soundRef.current = null;
    }

    setActiveSpeakingId(messageId);

    // 2. Crucial: Reset Audio Mode to Playback (Disable Recording route)
    // This forces the device to play TTS/Audio from the main speakers instead of the call earpiece.
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch (audioModeErr) {
      console.warn('Failed to reset Audio mode for speaker routing:', audioModeErr);
    }

    // 3. Play Server-side audio if premium configured, otherwise play locally for 0-latency
    if (ttsConfig.is_premium) {
      try {
        await playBackendAudio(text, messageId, language);
      } catch (serverTtsErr) {
        console.warn('Backend premium TTS failed, falling back to local client TTS engine:', serverTtsErr);
        fallbackLocalSpeech(text, messageId, language);
      }
    } else {
      // Use local client-side speech immediately for zero-latency if server is on free gTTS
      console.log('Server is using free non-premium TTS (gTTS). Using zero-latency native speech synthesis.');
      fallbackLocalSpeech(text, messageId, language);
    }
  };

  const fallbackLocalSpeech = (text: string, messageId: string, language?: string) => {
    let langCode = 'en-IN';
    const lang = language?.toLowerCase();
    
    // Support all 22 official Indian languages
    if (lang === 'hi' || lang === 'hinglish') langCode = 'hi-IN';
    else if (lang === 'gu' || lang === 'gujlish') langCode = 'gu-IN';
    else if (lang === 'ta' || lang === 'tamil') langCode = 'ta-IN';
    else if (lang === 'te' || lang === 'telugu') langCode = 'te-IN';
    else if (lang === 'kn' || lang === 'kannada') langCode = 'kn-IN';
    else if (lang === 'ml' || lang === 'malayalam') langCode = 'ml-IN';
    else if (lang === 'bn' || lang === 'bengali') langCode = 'bn-IN';
    else if (lang === 'mr' || lang === 'marathi') langCode = 'mr-IN';
    else if (lang === 'pa' || lang === 'punjabi') langCode = 'pa-IN';
    else if (lang === 'or' || lang === 'odia') langCode = 'or-IN';
    else if (lang === 'ur' || lang === 'urdu') langCode = 'ur-IN';
    else if (lang === 'as' || lang === 'assamese') langCode = 'as-IN';
    else if (lang === 'sa' || lang === 'sanskrit') langCode = 'sa-IN';
    else if (lang === 'ne' || lang === 'nepali') langCode = 'ne-IN';
    else if (lang === 'ks' || lang === 'kashmiri') langCode = 'ks-IN';
    else if (lang === 'sd' || lang === 'sindhi') langCode = 'sd-IN';
    else if (lang === 'kok' || lang === 'konkani') langCode = 'kok-IN';
    else if (lang === 'doi' || lang === 'dogri') langCode = 'doi-IN';
    else if (lang === 'brx' || lang === 'bodo') langCode = 'brx-IN';
    else if (lang === 'mai' || lang === 'maithili') langCode = 'mai-IN';
    else if (lang === 'sat' || lang === 'santali') langCode = 'sat-IN';
    
    try {
      Speech.speak(text, {
        language: langCode,
        voice: (() => {
          if (!availableVoices || availableVoices.length === 0) return undefined;
          const langPrefix = langCode.split('-')[0].toLowerCase();
          const matchingVoices = availableVoices.filter(v => 
            v.language && 
            (v.language.toLowerCase() === langCode.toLowerCase() || 
             v.language.toLowerCase().startsWith(langPrefix + '-') ||
             v.language.toLowerCase().startsWith(langPrefix + '_'))
          );
          if (matchingVoices.length > 0) {
            const sorted = [...matchingVoices].sort((a, b) => {
              const nameA = (a.name || a.identifier || '').toLowerCase();
              const nameB = (b.name || b.identifier || '').toLowerCase();
              const scoreA = (nameA.includes('network') ? 10 : 0) + 
                             (nameA.includes('neural') ? 10 : 0) + 
                             (nameA.includes('wavenet') ? 10 : 0) + 
                             (nameA.includes('premium') ? 5 : 0) +
                             (nameA.includes('natural') ? 5 : 0);
              const scoreB = (nameB.includes('network') ? 10 : 0) + 
                             (nameB.includes('neural') ? 10 : 0) + 
                             (nameB.includes('wavenet') ? 10 : 0) + 
                             (nameB.includes('premium') ? 5 : 0) +
                             (nameB.includes('natural') ? 5 : 0);
              return scoreB - scoreA;
            });
            const bestVoice = sorted[0];
            return bestVoice.identifier || bestVoice.name;
          }
          const anyIndian = availableVoices.find(v => 
            v.language && 
            (v.language.toLowerCase().includes('-in') || v.language.toLowerCase().includes('_in'))
          );
          if (anyIndian) return anyIndian.identifier || anyIndian.name;
          return undefined;
        })(),
        rate: 1.0,
        onDone: () => setActiveSpeakingId(null),
        onError: (err) => {
          console.warn('Local TTS speak failed (async), falling back to server-side audio stream:', err);
          playBackendAudio(text, messageId, language);
        },
        onStopped: () => setActiveSpeakingId(null),
      });
    } catch (err) {
      console.warn('Local TTS speak failed (sync), falling back to server-side audio stream:', err);
      playBackendAudio(text, messageId, language);
    }
  };

  const stopSpeaking = async () => {
    Speech.stop();
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (err) {
        console.warn('Error unloading sound on stopSpeaking:', err);
      }
      soundRef.current = null;
    }
    setActiveSpeakingId(null);
  };

  const submitFeedback = async (msgId: string, logId: number | undefined, rating: number) => {
    if (!logId) return;
    
    // Optimistically update the UI color instantly
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, userFeedback: rating === 1 ? 'up' : 'down' } : m));
    
    try {
      const response = await fetch(`${apiUrl}/bot/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, rating: rating }),
      });
      if (!response.ok) {
        // Rollback on server error
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, userFeedback: undefined } : m));
        Alert.alert('Error', 'Failed to submit feedback to server.');
      } else {
        Alert.alert('Feedback Saved', rating === 1 ? 'Thank you! 👍' : 'Thank you! We will self-correct this response. 👎');
      }
    } catch (error) {
      console.error('Failed to submit feedback', error);
      // Rollback on network error
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, userFeedback: undefined } : m));
      Alert.alert('Error', 'Network request failed. Feedback not saved.');
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const hasFeedback = item.userFeedback !== undefined;
    return (
      <View style={[styles.messageBubble, item.isUser ? styles.userBubble : styles.botBubble]}>
        <Text style={[styles.messageText, item.isUser ? styles.userText : styles.botText]}>
          {item.text}
        </Text>
        {!item.isUser ? (
          <View style={styles.feedbackContainer}>
            {activeSpeakingId === item.id ? (
              <TouchableOpacity 
                onPress={stopSpeaking} 
                style={styles.audioCtrlBtn}
              >
                <Ionicons name="stop-circle" size={16} color="#c62828" />
                <Text style={[styles.audioBtnText, { color: '#c62828', fontWeight: 'bold' }]}>Stop</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={() => speakResponse(item.text, item.id, item.language)} 
                style={styles.audioCtrlBtn}
              >
                <Ionicons name="volume-high-outline" size={16} color="#003087" />
                <Text style={[styles.audioBtnText, { color: '#003087' }]}>Listen</Text>
              </TouchableOpacity>
            )}

            {item.logId ? (
              <View style={{ flexDirection: 'row', marginLeft: 'auto' }}>
                <TouchableOpacity 
                  onPress={() => !hasFeedback && submitFeedback(item.id, item.logId, 1)} 
                  style={[
                    styles.feedbackBtn, 
                    item.userFeedback === 'up' && styles.feedbackSelectedUp,
                    item.userFeedback === 'down' && styles.feedbackDimmed
                  ]}
                  disabled={hasFeedback}
                >
                  <Ionicons 
                    name={item.userFeedback === 'up' ? "thumbs-up" : "thumbs-up-outline"} 
                    size={16} 
                    color={item.userFeedback === 'up' ? "#003087" : (hasFeedback ? "#ccc" : "#003087")} 
                  />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => !hasFeedback && submitFeedback(item.id, item.logId, -1)} 
                  style={[
                    styles.feedbackBtn, 
                    item.userFeedback === 'down' && styles.feedbackSelectedDown,
                    item.userFeedback === 'up' && styles.feedbackDimmed
                  ]}
                  disabled={hasFeedback}
                >
                  <Ionicons 
                    name={item.userFeedback === 'down' ? "thumbs-down" : "thumbs-down-outline"} 
                    size={16} 
                    color={item.userFeedback === 'down' ? "#c62828" : (hasFeedback ? "#ccc" : "#003087")} 
                  />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
      >
        {/* HEADER BAR */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuButton} onPress={openSidebar}>
            <Ionicons name="menu" size={26} color="#fff" />
            {sessions.length > 0 && <View style={styles.badgeDot} />}
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Hallmarking Bot</Text>
          <TouchableOpacity style={styles.headerRightButton} onPress={startNewChat}>
            <Ionicons name="add-circle" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ACTIVE CHAT SCREEN / WELCOME STATE */}
        {isProfileIncomplete ? (
          <View style={styles.incompleteContainer}>
            <View style={styles.incompleteCard}>
              <Ionicons name="warning" size={70} color="#e5a93b" style={styles.incompleteIcon} />
              <Text style={styles.incompleteTitle}>Complete Profile Required</Text>
              <Text style={styles.incompleteSubtitle}>
                To chat with the Hallmarking Bot, you must fill in all required profile details in the Profile tab:
              </Text>
              <View style={styles.requirementsList}>
                <View style={styles.requirementRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#003087" style={{ marginRight: 8 }} />
                  <Text style={styles.requirementText}>Mobile Number</Text>
                </View>
                <View style={styles.requirementRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#003087" style={{ marginRight: 8 }} />
                  <Text style={styles.requirementText}>Company Name</Text>
                </View>
                <View style={styles.requirementRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#003087" style={{ marginRight: 8 }} />
                  <Text style={styles.requirementText}>Designation</Text>
                </View>
                <View style={styles.requirementRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#003087" style={{ marginRight: 8 }} />
                  <Text style={styles.requirementText}>Age & Gender</Text>
                </View>
                <View style={styles.requirementRow}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#003087" style={{ marginRight: 8 }} />
                  <Text style={styles.requirementText}>BIS Registration Number</Text>
                </View>
              </View>
              <TouchableOpacity 
                style={styles.goToProfileBtn} 
                onPress={() => navigation.navigate('Profile')}
              >
                <Text style={styles.goToProfileText}>Complete Profile Now</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          </View>
        ) : fetchingHistory ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#003087" />
            <Text style={{ marginTop: 10, color: '#666' }}>Loading messages...</Text>
          </View>
        ) : currentConversationId === null ? (
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeIconWrapper}>
              <Ionicons name="chatbubbles-outline" size={80} color="#003087" />
            </View>
            <Text style={styles.welcomeTitle}>Welcome to Hallmarking Bot</Text>
            <Text style={styles.welcomeSubtitle}>
              Your multilingual assistant for BIS regulations, jewelers, gold refineries, and hallmarking centres.
            </Text>
            
            <TouchableOpacity style={styles.startChatButton} onPress={startNewChat}>
              <Text style={styles.startChatButtonText}>Start a New Chat</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <Text style={styles.welcomeTip}>
              💡 Tap the menu icon in the top left to see your past chats history.
            </Text>
          </View>
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.messageList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="#003087" />
                <Text style={styles.loadingText}>Bot is typing...</Text>
              </View>
            )}

            {activeSpeakingId !== null && (
              <View style={styles.floatingAudioBar}>
                <Ionicons name="volume-high" size={18} color="#003087" style={styles.floatingAudioIcon} />
                <Text style={styles.floatingAudioText}>Bot is speaking...</Text>
                <TouchableOpacity style={styles.floatingStopBtn} onPress={stopSpeaking}>
                  <Ionicons name="stop" size={12} color="#fff" />
                  <Text style={styles.floatingStopText}>Stop</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Ask a question..."
                value={inputText}
                onChangeText={setInputText}
                multiline
              />
              
              <TouchableOpacity 
                style={[styles.iconButton, recording && styles.recordingButton]} 
                onPress={recording ? stopRecording : startRecording}
              >
                <Ionicons 
                  name={recording ? "square" : "mic"} 
                  size={22} 
                  color={recording ? "#d32f2f" : "#003087"} 
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()}>
                <Ionicons name="send" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* SIDEBAR BACKDROP */}
        {sidebarOpen && (
          <TouchableOpacity 
            activeOpacity={1} 
            style={styles.backdrop} 
            onPress={closeSidebar} 
          />
        )}

        {/* SLIDING SIDEBAR HISTORY */}
        <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }] }]}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Chat History</Text>
              <TouchableOpacity onPress={closeSidebar} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.sidebarNewChatBtn} onPress={startNewChat}>
              <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.sidebarNewChatBtnText}>New Conversation</Text>
            </TouchableOpacity>

            {fetchingSessions ? (
              <View style={styles.sidebarCenter}>
                <ActivityIndicator size="small" color="#003087" />
              </View>
            ) : (
              <FlatList
                data={sessions}
                keyExtractor={item => item.id.toString()}
                contentContainerStyle={styles.sidebarList}
                renderItem={({ item }) => {
                  const isActive = item.id === currentConversationId;
                  return (
                    <TouchableOpacity 
                      style={[styles.sidebarCard, isActive && styles.sidebarCardActive]}
                      onPress={() => loadMessageHistory(item.id)}
                    >
                      <Ionicons 
                        name="chatbubble-ellipses" 
                        size={18} 
                        color={isActive ? "#003087" : "#666"} 
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sidebarPreview, isActive && styles.sidebarPreviewActive]} numberOfLines={1}>
                          {item.preview}
                        </Text>
                        <Text style={styles.sidebarDate}>{formatDate(item.started_at)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.sidebarEmpty}>
                    <Text style={styles.sidebarEmptyText}>No previous chats</Text>
                  </View>
                }
              />
            )}
          </SafeAreaView>
        </Animated.View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#003087', // Match headers
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Header Bar
  header: {
    height: 56,
    backgroundColor: '#003087',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  menuButton: {
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  badgeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff4d4d',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerRightButton: {
    padding: 8,
  },
  // Welcome screen
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#f8fafc',
  },
  welcomeIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e6eefc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  startChatButton: {
    backgroundColor: '#003087',
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#003087',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    marginBottom: 24,
  },
  startChatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  welcomeTip: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
  // Active Chat Message List
  messageList: {
    padding: 15,
    paddingBottom: 25,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 12,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  userBubble: {
    backgroundColor: '#003087',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 2,
  },
  botBubble: {
    backgroundColor: '#f1f3f6',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: '#fff',
  },
  botText: {
    color: '#333',
  },
  feedbackContainer: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 6,
  },
  feedbackBtn: {
    padding: 4,
    marginLeft: 12,
  },
  feedbackSelected: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginLeft: 15,
    marginBottom: 10,
  },
  loadingText: {
    marginLeft: 10,
    color: '#666',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    fontSize: 16,
    maxHeight: 100,
    color: '#333',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#f0f2f5',
  },
  recordingButton: {
    backgroundColor: '#ffebee',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#003087',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  // Sidebar Drawer Panel
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: sidebarWidth,
    backgroundColor: '#fff',
    zIndex: 1001,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 1000,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003087',
  },
  closeBtn: {
    padding: 4,
  },
  sidebarNewChatBtn: {
    backgroundColor: '#003087',
    margin: 12,
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarNewChatBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  sidebarCenter: {
    padding: 24,
    alignItems: 'center',
  },
  sidebarList: {
    padding: 12,
    paddingTop: 0,
  },
  sidebarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  sidebarCardActive: {
    backgroundColor: '#e6eefc',
    borderWidth: 1,
    borderColor: '#b3d1ff',
  },
  sidebarPreview: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 3,
  },
  sidebarPreviewActive: {
    color: '#003087',
  },
  sidebarDate: {
    fontSize: 11,
    color: '#888',
  },
  sidebarEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  sidebarEmptyText: {
    color: '#999',
    fontSize: 14,
  },
  audioCtrlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  audioBtnText: {
    marginLeft: 4,
    fontSize: 12,
  },
  floatingAudioBar: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatingAudioIcon: {
    marginRight: 8,
  },
  floatingAudioText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
  },
  floatingStopBtn: {
    backgroundColor: '#c62828',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  floatingStopText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  feedbackSelectedUp: {
    backgroundColor: 'rgba(0, 48, 135, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 48, 135, 0.3)',
  },
  feedbackSelectedDown: {
    backgroundColor: 'rgba(198, 40, 40, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(198, 40, 40, 0.3)',
  },
  feedbackDimmed: {
    opacity: 0.25,
  },
  incompleteContainer: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  incompleteCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  incompleteIcon: {
    marginBottom: 16,
  },
  incompleteTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  incompleteSubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  requirementsList: {
    alignSelf: 'stretch',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  requirementText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  goToProfileBtn: {
    backgroundColor: '#003087',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  goToProfileText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
