import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  ActivityIndicator
} from 'react-native';
import Constants from 'expo-constants';

export default function RegisterScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [role, setRole] = useState('jeweler');
  const [loading, setLoading] = useState(false);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const handleRegister = async () => {
    if (!name || !email || !password || !companyName || !designation || !age) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          company_name: companyName,
          designation,
          age: parseInt(age),
          gender,
          role,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', 'Registration successful!');
        navigation.navigate('Login');
      } else {
        Alert.alert('Error', data.detail || 'Registration failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Create Account</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Full Name"
        value={name}
        onChangeText={setName}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      
      <TextInput
        style={styles.input}
        placeholder="Company Name"
        value={companyName}
        onChangeText={setCompanyName}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Designation"
        value={designation}
        onChangeText={setDesignation}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Age"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Gender</Text>
      <View style={styles.row}>
        {['Male', 'Female', 'Other'].map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, gender === g && styles.activeChip]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.chipText, gender === g && styles.activeChipText]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>I am a...</Text>
      <View style={styles.roleContainer}>
        {[
          { label: 'Jeweler', value: 'jeweler' },
          { label: 'Hallmarking Centre', value: 'hallmarking_centre' },
          { label: 'Gold Refinery', value: 'refinery' }
        ].map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.roleCard, role === r.value && styles.activeRoleCard]}
            onPress={() => setRole(r.value)}
          >
            <Text style={[styles.roleText, role === r.value && styles.activeRoleText]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Register</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    marginTop: 5,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 10,
    backgroundColor: '#f5f5f5',
  },
  activeChip: {
    backgroundColor: '#003087',
    borderColor: '#003087',
  },
  chipText: {
    color: '#333',
  },
  activeChipText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  roleContainer: {
    marginBottom: 20,
  },
  roleCard: {
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 10,
    backgroundColor: '#f5f5f5',
  },
  activeRoleCard: {
    borderColor: '#003087',
    backgroundColor: '#e6f0ff',
  },
  roleText: {
    fontSize: 16,
    color: '#333',
  },
  activeRoleText: {
    color: '#003087',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#003087',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
