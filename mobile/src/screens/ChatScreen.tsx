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
  Alert
} from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  language?: string;
  logId?: number;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'Hello! I am the Hallmarking Bot. How can I help you today?', isUser: false, timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const handleSend = async (textToPost?: string) => {
    const text = textToPost || inputText;
    if (!text.trim()) return;

    // Add user message
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
        body: JSON.stringify({ message: text }),
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
        
        // Speak response in correct language
        speakResponse(data.reply, data.language);
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
      
      const response = await fetch(`${apiUrl}/bot/ask-audio`, {
        method: 'POST',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        // Add user message with transcribed text
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
        speakResponse(data.reply, data.language);
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


  const speakResponse = (text: string, language?: string) => {
    let langCode = 'en-IN';
    if (language === 'hi') langCode = 'hi-IN';
    if (language === 'gu') langCode = 'gu-IN';
    
    Speech.speak(text, {
      language: langCode,
      rate: 0.9
    });
  };


  const submitFeedback = async (logId: number | undefined, rating: int) => {
    if (!logId) return;
    try {
      const response = await fetch(`${apiUrl}/bot/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, rating: rating }),
      });
      if (response.ok) {
        Alert.alert('Feedback Received', rating === 1 ? 'Thank you! 👍' : 'Thank you for helping us improve! We will self-correct this. 👎');
      }
    } catch (error) {
      console.error('Failed to submit feedback', error);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageBubble, item.isUser ? styles.userBubble : styles.botBubble]}>
      <Text style={[styles.messageText, item.isUser ? styles.userText : styles.botText]}>
        {item.text}
      </Text>
      {!item.isUser && item.logId && (
        <View style={styles.feedbackContainer}>
          <TouchableOpacity onPress={() => submitFeedback(item.logId, 1)}>
            <Text style={styles.feedbackIcon}>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => submitFeedback(item.logId, -1)}>
            <Text style={styles.feedbackIcon}>👎</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Hallmarking Bot</Text>
      </View>

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
          <Text style={styles.iconText}>{recording ? '⏹️' : '🎤'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sendButton} onPress={() => handleSend()}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 15,
    backgroundColor: '#003087',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  messageList: {
    padding: 15,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    maxWidth: '80%',
  },
  userBubble: {
    backgroundColor: '#003087',
    alignSelf: 'flex-end',
  },
  botBubble: {
    backgroundColor: '#f0f0f0',
    alignSelf: 'flex-自', // Typo in prompt or my thought? Let's use 'flex-start'!
  },
  messageText: {
    fontSize: 16,
  },
  userText: {
    color: '#fff',
  },
  botText: {
    color: '#333',
  },
  feedbackContainer: {
    flexDirection: 'row',
    marginTop: 5,
    justifyContent: 'flex-end',
  },
  feedbackIcon: {
    fontSize: 18,
    marginLeft: 10,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginLeft: 15,
  },
  loadingText: {
    marginLeft: 10,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    fontSize: 16,
    maxHeight: 100,
  },
  iconButton: {
    padding: 10,
    marginLeft: 5,
  },
  recordingButton: {
    backgroundColor: '#ffebee',
    borderRadius: 20,
  },
  iconText: {
    fontSize: 20,
  },
  sendButton: {
    backgroundColor: '#003087',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginLeft: 5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
