import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  ScrollView,
  SafeAreaView,
  TextInput,
  Modal,
  Clipboard
} from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  company?: string;
  designation?: string;
  phone?: string;
  bis_registration_number?: string;
  role: string;
  age?: number;
  gender?: string;
  is_certified?: string;
}

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editBisRegistrationNumber, setEditBisRegistrationNumber] = useState('');

  // Add Member Modal state
  const [isAddMemberVisible, setIsAddMemberVisible] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [memberDesignation, setMemberDesignation] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberAge, setMemberAge] = useState('');
  const [memberGender, setMemberGender] = useState('Male');
  const [submittingMember, setSubmittingMember] = useState(false);

  // Invite Colleague states
  const [invites, setInvites] = useState<any[]>([]);
  const [isInviteModalVisible, setIsInviteModalVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [generatedInviteCode, setGeneratedInviteCode] = useState('');
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        navigation.navigate('Welcome');
        return;
      }

      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data);
        fetchInvites();
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

  const fetchInvites = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) return;
      const response = await fetch(`${apiUrl}/auth/invites`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setInvites(data);
      }
    } catch (e) {
      console.error("Failed to fetch invites", e);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter colleague\'s email');
      return;
    }
    setSubmittingInvite(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${apiUrl}/auth/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName
        })
      });
      const data = await response.json();
      if (response.ok) {
        setIsInviteModalVisible(false);
        setGeneratedInviteCode(data.code);
        setIsSuccessModalVisible(true);
        setInviteEmail('');
        setInviteName('');
        fetchInvites();
      } else {
        Alert.alert('Error', data.detail || 'Failed to send invite');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not connect to server');
    } finally {
      setSubmittingInvite(false);
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
      case 'jeweler': return 'Registered Jeweler';
      case 'hallmarking_centre': return 'Assaying & Hallmarking Centre (AHC)';
      case 'refinery': return 'Gold Refinery / Mint';
      case 'nch_admin': return 'National Clearing House Admin';
      default: return role.toUpperCase();
    }
  };

  const startEditing = () => {
    if (!user) return;
    setEditName(user.name || '');
    setEditCompany(user.company || '');
    setEditDesignation(user.designation || '');
    setEditPhone(user.phone || '');
    setEditAge(user.age ? String(user.age) : '');
    setEditGender(user.gender || 'Male');
    setEditBisRegistrationNumber(user.bis_registration_number || '');
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }
    if (!editPhone.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }
    if (!editCompany.trim()) {
      Alert.alert('Error', 'Company name is required');
      return;
    }
    if (!editDesignation.trim()) {
      Alert.alert('Error', 'Designation is required');
      return;
    }
    if (!editBisRegistrationNumber.trim()) {
      Alert.alert('Error', 'BIS Registration Number is required');
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${apiUrl}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          company: editCompany,
          designation: editDesignation,
          phone: editPhone,
          bis_registration_number: editBisRegistrationNumber,
          age: editAge ? parseInt(editAge) : null,
          gender: editGender
        })
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data);
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully!');
      } else {
        Alert.alert('Error', data.detail || 'Failed to update profile');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberName.trim() || !memberEmail.trim() || !memberPassword.trim() || !memberPhone.trim() || !memberDesignation.trim() || !memberAge.trim()) {
      Alert.alert('Error', 'Please fill in all team member details');
      return;
    }
    setSubmittingMember(true);
    try {
      const token = await SecureStore.getItemAsync('userToken');
      const response = await fetch(`${apiUrl}/auth/add-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: memberName,
          email: memberEmail,
          password: memberPassword,
          designation: memberDesignation,
          phone: memberPhone,
          age: parseInt(memberAge),
          gender: memberGender
        })
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', 'Team member added successfully! They can log in using their email and password.');
        setIsAddMemberVisible(false);
        // Reset form
        setMemberName('');
        setMemberEmail('');
        setMemberPassword('');
        setMemberDesignation('');
        setMemberPhone('');
        setMemberAge('');
        setMemberGender('Male');
      } else {
        Alert.alert('Error', data.detail || 'Failed to add team member');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to connect to server');
    } finally {
      setSubmittingMember(false);
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
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {user ? (
          <View style={styles.profileWrapper}>
            {/* Header Avatar card */}
            <View style={styles.avatarCard}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.userName}>{user.name}</Text>
              <Text style={styles.userRoleTag}>{getRoleLabel(user.role)}</Text>
            </View>

            {isEditing ? (
              // EDIT MODE
              <View style={styles.infoCard}>
                <Text style={styles.cardSectionTitle}>Edit Profile Information</Text>
                
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  value={editName}
                  onChangeText={setEditName}
                />

                <Text style={styles.inputLabel}>Company / Centre Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Company Name"
                  value={editCompany}
                  onChangeText={setEditCompany}
                />

                <Text style={styles.inputLabel}>Designation</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Designation"
                  value={editDesignation}
                  onChangeText={setEditDesignation}
                />

                <Text style={styles.inputLabel}>BIS License / Reg Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="BIS Registration Number"
                  value={editBisRegistrationNumber}
                  onChangeText={setEditBisRegistrationNumber}
                />

                <Text style={styles.inputLabel}>Mobile Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Mobile Number"
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Age</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Age"
                  value={editAge}
                  onChangeText={setEditAge}
                  keyboardType="numeric"
                />

                <Text style={styles.inputLabel}>Gender</Text>
                <View style={styles.row}>
                  {['Male', 'Female', 'Other'].map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.chip, editGender === g && styles.activeChip]}
                      onPress={() => setEditGender(g)}
                    >
                      <Text style={[styles.chipText, editGender === g && styles.activeChipText]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setIsEditing(false)}>
                    <Text style={styles.btnCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleSaveProfile}>
                    <Text style={styles.btnSaveText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // VIEW MODE
              <>
                <View style={styles.infoCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.cardSectionTitle}>Business Information</Text>
                    <TouchableOpacity style={styles.editIconBtn} onPress={startEditing}>
                      <Ionicons name="create-outline" size={20} color="#003087" />
                      <Text style={styles.editIconText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="business" size={20} color="#003087" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Company / Centre Name</Text>
                      <Text style={styles.rowValue}>{user.company || 'Not Filled'}</Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="briefcase" size={20} color="#003087" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Designation</Text>
                      <Text style={styles.rowValue}>{user.designation || 'Not Filled'}</Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="ribbon" size={20} color="#e5a93b" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>BIS License / Reg Number</Text>
                      <Text style={styles.rowValue}>{user.bis_registration_number || 'Not Filled'}</Text>
                      {user.is_certified === 'yes' && (
                        <View style={styles.badgeContainer}>
                          <Ionicons name="checkmark-circle" size={14} color="#2e7d32" />
                          <Text style={styles.badgeText}>Certified / Active</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Contact Details Card */}
                <View style={styles.infoCard}>
                  <Text style={styles.cardSectionTitle}>Contact & Demographics</Text>
                  
                  <View style={styles.infoRow}>
                    <Ionicons name="mail" size={20} color="#003087" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Email Address</Text>
                      <Text style={styles.rowValue}>{user.email}</Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="call" size={20} color="#003087" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Mobile Number</Text>
                      <Text style={styles.rowValue}>{user.phone || 'Not Filled'}</Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Ionicons name="person-circle" size={20} color="#003087" style={styles.rowIcon} />
                    <View style={styles.rowContent}>
                      <Text style={styles.rowLabel}>Demographics</Text>
                      <Text style={styles.rowValue}>
                        {user.gender || 'Not Specified'}
                        {user.age ? `, ${user.age} Years` : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Team Members Section */}
                {user.role !== 'nch_admin' && (
                  <View style={styles.infoCard}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.cardSectionTitle}>Team & Invites</Text>
                      <View style={{ flexDirection: 'row' }}>
                        <TouchableOpacity style={[styles.addMemberBtn, { marginRight: 8 }]} onPress={() => setIsAddMemberVisible(true)}>
                          <Ionicons name="person-add-outline" size={16} color="#003087" />
                          <Text style={styles.addMemberText}>Add</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.addMemberBtn} onPress={() => setIsInviteModalVisible(true)}>
                          <Ionicons name="mail-unread-outline" size={16} color="#003087" />
                          <Text style={styles.addMemberText}>Invite</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.memberHelpText}>
                      Add or invite other people from {user.company || 'your company'} so they can also use this app and chat with the bot.
                    </Text>

                    {invites.length > 0 && (
                      <View style={styles.inviteListContainer}>
                        <Text style={styles.inviteListHeader}>Colleague Invites</Text>
                        {invites.map((invite) => (
                           <View key={invite.id} style={styles.inviteItem}>
                            <View style={styles.inviteInfo}>
                              <Text style={styles.inviteEmailText}>{invite.email}</Text>
                              {invite.name ? <Text style={styles.inviteNameText}>{invite.name}</Text> : null}
                              <Text style={styles.inviteCodeText}>Invitation sent via email</Text>
                            </View>
                            <View style={[
                              styles.statusBadge, 
                              invite.status === 'accepted' ? styles.statusAccepted : styles.statusPending
                            ]}>
                              <Text style={[
                                styles.statusText, 
                                invite.status === 'accepted' ? styles.statusTextAccepted : styles.statusTextPending
                              ]}>
                                {invite.status === 'accepted' ? 'Joined' : 'Pending'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Action buttons */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={20} color="#ff4d4d" style={{ marginRight: 8 }} />
                  <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>No profile data found.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchProfile}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add Team Member Modal */}
      <Modal
        visible={isAddMemberVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsAddMemberVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Team Member</Text>
              <TouchableOpacity onPress={() => setIsAddMemberVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              <Text style={styles.modalSubtitle}>
                Add a new colleague under <Text style={{fontWeight: 'bold'}}>{user?.company}</Text>.
              </Text>

              <Text style={styles.inputLabel}>Colleague's Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={memberName}
                onChangeText={setMemberName}
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                value={memberEmail}
                onChangeText={setMemberEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={memberPassword}
                onChangeText={setMemberPassword}
                secureTextEntry
              />

              <Text style={styles.inputLabel}>Designation</Text>
              <TextInput
                style={styles.input}
                placeholder="Designation (e.g. Sales, Assayer)"
                value={memberDesignation}
                onChangeText={setMemberDesignation}
              />

              <Text style={styles.inputLabel}>Mobile Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Mobile Number"
                value={memberPhone}
                onChangeText={setMemberPhone}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="Age"
                value={memberAge}
                onChangeText={setMemberAge}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Gender</Text>
              <View style={styles.row}>
                {['Male', 'Female', 'Other'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.chip, memberGender === g && styles.activeChip]}
                    onPress={() => setMemberGender(g)}
                  >
                    <Text style={[styles.chipText, memberGender === g && styles.activeChipText]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={[styles.button, { marginTop: 15 }]} 
                onPress={handleAddMember}
                disabled={submittingMember}
              >
                {submittingMember ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Add Colleague</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Invite Colleague Modal */}
      <Modal
        visible={isInviteModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsInviteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Colleague</Text>
              <TouchableOpacity onPress={() => setIsInviteModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              <Text style={styles.modalSubtitle}>
                Generate an invitation code for your friend or colleague to register and join <Text style={{fontWeight: 'bold'}}>{user?.company}</Text>.
              </Text>

              <Text style={styles.inputLabel}>Colleague's Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="colleague@email.com"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Colleague's Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                value={inviteName}
                onChangeText={setInviteName}
              />

              <TouchableOpacity 
                style={[styles.button, { marginTop: 15 }]} 
                onPress={handleSendInvite}
                disabled={submittingInvite}
              >
                {submittingInvite ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Generate Invite Code</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Success Invitation Modal */}
      <Modal
        visible={isSuccessModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '75%', borderTopLeftRadius: 20, borderTopRightRadius: 20 }]}>
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Ionicons name="checkmark-circle-outline" size={60} color="#2e7d32" />
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 10 }}>Invitation Sent!</Text>
              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginHorizontal: 20, marginTop: 10, lineHeight: 20 }}>
                An invitation email has been sent successfully. Your colleague can verify the invitation code directly from their email inbox to register and join your company workspace.
              </Text>

              <TouchableOpacity 
                style={[styles.button, { width: '80%', marginTop: 30 }]} 
                onPress={() => setIsSuccessModalVisible(false)}
              >
                <Text style={styles.buttonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  profileWrapper: {
    width: '100%',
  },
  avatarCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#003087',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  userRoleTag: {
    fontSize: 14,
    color: '#003087',
    fontWeight: '600',
    backgroundColor: '#e6eefc',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#003087',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  editIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6eefc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  editIconText: {
    color: '#003087',
    fontWeight: 'bold',
    marginLeft: 4,
    fontSize: 13,
  },
  addMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6eefc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addMemberText: {
    color: '#003087',
    fontWeight: 'bold',
    marginLeft: 4,
    fontSize: 13,
  },
  memberHelpText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  rowIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    backgroundColor: '#e8f5e9',
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#2e7d32',
    marginLeft: 4,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff4d4d',
    padding: 15,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: {
    color: '#ff4d4d',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4d4d',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#003087',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Edit mode & Modal Styles
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#444',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 15,
    marginTop: 5,
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
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  btn: {
    flex: 0.48,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  btnCancelText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 16,
  },
  btnSave: {
    backgroundColor: '#003087',
  },
  btnSaveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
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
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#003087',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    marginTop: 5,
  },
  modalForm: {
    paddingBottom: 30,
  },
  inviteListContainer: {
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  inviteListHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 8,
  },
  inviteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafafa',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 8,
  },
  inviteInfo: {
    flex: 1,
  },
  inviteEmailText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  inviteNameText: {
    fontSize: 12,
    color: '#666',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  inviteCodeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#003087',
  },
  copyMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6eefc',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 10,
  },
  copyMiniText: {
    fontSize: 10,
    color: '#003087',
    fontWeight: 'bold',
    marginLeft: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusAccepted: {
    backgroundColor: '#e8f5e9',
  },
  statusPending: {
    backgroundColor: '#fff3e0',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusTextAccepted: {
    color: '#2e7d32',
  },
  statusTextPending: {
    color: '#ef6c00',
  },
  inviteSuccessBox: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 15,
    width: '80%',
    alignItems: 'center',
    marginTop: 15,
  },
  inviteSuccessLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#777',
    marginBottom: 4,
  },
  inviteSuccessCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
    letterSpacing: 2,
  },
});
