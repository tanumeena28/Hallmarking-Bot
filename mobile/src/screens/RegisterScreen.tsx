import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen({ route, navigation }: any) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [designation, setDesignation] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [role, setRole] = useState('jeweler');
  const [isCertified, setIsCertified] = useState('yes');
  const [phone, setPhone] = useState('');
  const [bisRegistrationNumber, setBisRegistrationNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Invite states
  const [inviteCode, setInviteCode] = useState('');
  const [isInviteVerified, setIsInviteVerified] = useState(false);
  const [inviterInfoText, setInviterInfoText] = useState('');
  const [verifyingInvite, setVerifyingInvite] = useState(false);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const verifyCodeAndEmail = async (codeVal: string, emailVal: string) => {
    if (!codeVal.trim()) return;
    setVerifyingInvite(true);
    try {
      const response = await fetch(`${apiUrl}/auth/invite/verify/${codeVal.trim().toUpperCase()}`);
      const data = await response.json();

      if (response.ok) {
        // If email was provided, verify it matches
        if (emailVal && data.invitee_email.trim().toLowerCase() !== emailVal.trim().toLowerCase()) {
          Alert.alert(
            'Verification Error', 
            `This invitation code is for ${data.invitee_email}. Please register using that email.`
          );
          setVerifyingInvite(false);
          return;
        }
        
        // Auto-fill and lock details
        setIsInviteVerified(true);
        setInviteCode(codeVal.trim().toUpperCase());
        setEmail(data.invitee_email);
        setCompanyName(data.company || '');
        setRole(data.role || 'jeweler');
        setIsCertified(data.is_certified || 'yes');
        setBisRegistrationNumber(data.bis_registration_number || '');
        setInviterInfoText(`Invited by ${data.inviter_name || 'your colleague'} to join ${data.company || 'their team'}`);
      } else {
        Alert.alert('Verification Failed', data.detail || 'Invalid or expired invitation code');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not verify invitation code with the server');
    } finally {
      setVerifyingInvite(false);
    }
  };

  useEffect(() => {
    if (route.params) {
      const { code, email: paramEmail } = route.params;
      if (code) {
        const emailToVerify = paramEmail || email;
        verifyCodeAndEmail(code, emailToVerify);
      }
    }
  }, [route.params]);

  const handleClearInvite = () => {
    setInviteCode('');
    setIsInviteVerified(false);
    setInviterInfoText('');
    setCompanyName('');
    setBisRegistrationNumber('');
    setRole('jeweler');
    setIsCertified('yes');
    setEmail('');
  };

  const handleRegister = async () => {
    if (isInviteVerified) {
      if (!name.trim()) {
        Alert.alert('Error', 'Name is compulsory to fill!');
        return;
      }
      if (!password.trim()) {
        Alert.alert('Error', 'Password is compulsory to fill!');
        return;
      }
      if (!designation.trim()) {
        Alert.alert('Error', 'Designation is compulsory to fill!');
        return;
      }
      if (!phone.trim()) {
        Alert.alert('Error', 'Mobile Number is compulsory to fill!');
        return;
      }
      if (!age.trim()) {
        Alert.alert('Error', 'Age is compulsory to fill!');
        return;
      }
      if (!gender) {
        Alert.alert('Error', 'Gender is compulsory to select!');
        return;
      }
    } else {
      if (!name.trim() || !email.trim() || !password.trim() || !age.trim()) {
        Alert.alert('Error', 'Please fill all basic details (Name, Email, Password, Age)');
        return;
      }
      if (!phone.trim()) {
        Alert.alert('Reminder', 'Mobile Number is compulsory to fill!');
        return;
      }
      if (!companyName.trim()) {
        Alert.alert('Reminder', 'Company Name is compulsory to fill!');
        return;
      }
      if (!designation.trim()) {
        Alert.alert('Reminder', 'Designation is compulsory to fill!');
        return;
      }
      if (!bisRegistrationNumber.trim()) {
        Alert.alert('Reminder', 'BIS Registration Number is compulsory to fill!');
        return;
      }
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
          phone,
          age: age ? parseInt(age) : null,
          gender: gender,
          role: role,
          is_certified: isCertified,
          bis_registration_number: bisRegistrationNumber,
          invite_code: isInviteVerified ? inviteCode.trim() : null
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
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.title}>Create Account</Text>

        {verifyingInvite && (
          <View style={styles.verifyingContainer}>
            <ActivityIndicator size="small" color="#003087" style={{ marginRight: 10 }} />
            <Text style={styles.verifyingText}>Verifying invitation...</Text>
          </View>
        )}

        {isInviteVerified && (
          <View style={styles.verifiedBanner}>
            <View style={styles.verifiedHeader}>
              <Ionicons name="checkmark-circle" size={24} color="#2e7d32" style={{ marginRight: 10 }} />
              <View style={styles.verifiedHeaderTextContainer}>
                <Text style={styles.verifiedTitle}>Invitation Verified</Text>
                <Text style={styles.verifiedSubtitle}>{inviterInfoText}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.changeInviteLink} onPress={handleClearInvite}>
              <Text style={styles.changeInviteLinkText}>Use a different invitation / register normally</Text>
            </TouchableOpacity>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
        />
        
        <TextInput
          style={[styles.input, isInviteVerified && styles.disabledInput]}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isInviteVerified}
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
          placeholder="Mobile Number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
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

        {!isInviteVerified && (
          <>
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
                  onPress={() => {
                    setRole(r.value);
                    setIsCertified('yes');
                  }}
                >
                  <Text style={[styles.roleText, role === r.value && styles.activeRoleText]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Conditional Onboarding Questions */}
            {role === 'jeweler' && (
              <View style={styles.certifiedContainer}>
                <Text style={styles.label}>Are you a BIS Certified Jeweler?</Text>
                <View style={styles.row}>
                  {[
                    { label: 'Yes', value: 'yes' },
                    { label: 'No', value: 'no' }
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, isCertified === opt.value && styles.activeChip]}
                      onPress={() => setIsCertified(opt.value)}
                    >
                      <Text style={[styles.chipText, isCertified === opt.value && styles.activeChipText]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {role === 'hallmarking_centre' && (
              <View style={styles.certifiedContainer}>
                <Text style={styles.label}>Is your AHC Recognized by BIS?</Text>
                <View style={styles.row}>
                  {[
                    { label: 'Yes', value: 'yes' },
                    { label: 'No', value: 'no' }
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, isCertified === opt.value && styles.activeChip]}
                      onPress={() => setIsCertified(opt.value)}
                    >
                      <Text style={[styles.chipText, isCertified === opt.value && styles.activeChipText]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {role === 'refinery' && (
              <View style={styles.certifiedContainer}>
                <Text style={styles.label}>Is your Refinery NABL Accredited or BIS Licensed?</Text>
                <View style={styles.row}>
                  {[
                    { label: 'Yes', value: 'yes' },
                    { label: 'No', value: 'no' }
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, isCertified === opt.value && styles.activeChip]}
                      onPress={() => setIsCertified(opt.value)}
                    >
                      <Text style={[styles.chipText, isCertified === opt.value && styles.activeChipText]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* BIS Registration / License Number */}
            <TextInput
              style={styles.input}
              placeholder={
                role === 'jeweler' 
                  ? 'BIS Jeweler Registration Number' 
                  : role === 'hallmarking_centre' 
                  ? 'BIS AHC Recognition Number' 
                  : 'BIS Refinery License Number'
              }
              value={bisRegistrationNumber}
              onChangeText={setBisRegistrationNumber}
              autoCapitalize="characters"
            />
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Register</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#666',
    borderColor: '#eee',
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
  certifiedContainer: {
    marginBottom: 15,
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
  verifiedBanner: {
    backgroundColor: '#e8f5e9',
    borderColor: '#a5d6a7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
  },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedHeaderTextContainer: {
    flex: 1,
  },
  verifiedTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
  },
  verifiedSubtitle: {
    fontSize: 14,
    color: '#4e5d4e',
    marginTop: 2,
  },
  changeInviteLink: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#c8e6c9',
    paddingTop: 10,
  },
  changeInviteLinkText: {
    fontSize: 14,
    color: '#1b5e20',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  verifyingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderColor: '#90caf9',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  verifyingText: {
    fontSize: 14,
    color: '#1565c0',
    fontWeight: '500',
  },
});
