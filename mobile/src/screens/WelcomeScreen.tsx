import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export default function WelcomeScreen({ navigation }: any) {
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await SecureStore.getItemAsync('userToken');
        if (token) {
          // If token exists, navigate straight to the Main Tab Navigator (ChatScreen is the first tab)
          navigation.replace('Main');
        } else {
          // If no token exists, navigate to the Login screen
          navigation.replace('Login');
        }
      } catch (error) {
        console.error('Error reading token:', error);
        navigation.replace('Login');
      }
    };
    checkToken();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#003087" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

