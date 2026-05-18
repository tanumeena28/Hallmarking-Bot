import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert
} from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  company: string;
  role: string;
}

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        navigation.navigate('Welcome');
        return;
      }

      const response = await fetch(`${apiUrl}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data);
      } else {
        Alert.alert('Error', data.detail || 'Failed to fetch profile');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('userToken');
    navigation.navigate('Welcome');
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'jeweler': return 'Jeweler';
      case 'hallmarking_centre': return 'Hallmarking Centre';
      case 'refinery': return 'Gold Refinery';
      case 'nch_admin': return 'NCH Admin';
      default: return role;
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#003087" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Profile</Text>
      
      {user ? (
        <View style={styles.profileContainer}>
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <Text style={styles.value}>{user.name}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{user.email}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Company</Text>
            <Text style={styles.value}>{user.company}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Account Type</Text>
            <Text style={styles.value}>{getRoleLabel(user.role)}</Text>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.errorText}>No profile data found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 30,
    marginTop: 10,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  profileContainer: {
    width: '100%',
  },
  field: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ff4d4d',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutText: {
    color: '#ff4d4d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    fontSize: 16,
    color: '#ff0000',
    marginTop: 20,
  },
});
