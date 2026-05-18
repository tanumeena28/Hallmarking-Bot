import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  RefreshControl,
  ActivityIndicator,
  Alert
} from 'react-native';
import Constants from 'expo-constants';

interface GoldRate {
  date: string;
  rate_24k: number;
  rate_22k: number;
  source: string;
  updated_at: string;
}

export default function GoldRateScreen() {
  const [rate, setRate] = useState<GoldRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const apiUrl = Constants.expoConfig?.extra?.apiUrl;

  const fetchGoldRate = async () => {
    try {
      const response = await fetch(`${apiUrl}/gold/rate`);
      const data = await response.json();

      if (response.ok) {
        setRate(data);
      } else {
        Alert.alert('Error', data.detail || 'Failed to fetch gold rate');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not connect to server');
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGoldRate();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchGoldRate();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#003087" />
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#003087']} />
      }
    >
      <Text style={styles.title}>Live Gold Rate</Text>
      
      {rate ? (
        <View style={styles.cardsContainer}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>24K Gold</Text>
            <Text style={styles.cardValue}>₹{rate.rate_24k.toFixed(2)}</Text>
            <Text style={styles.cardUnit}>per gram</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>22K Gold</Text>
            <Text style={styles.cardValue}>₹{rate.rate_22k.toFixed(2)}</Text>
            <Text style={styles.cardUnit}>per gram</Text>
          </View>

          <View style={styles.metaContainer}>
            <Text style={styles.metaText}>Source: {rate.source}</Text>
            <Text style={styles.metaText}>Last Updated: {new Date(rate.updated_at).toLocaleString()}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.errorText}>No gold rate data available.</Text>
      )}
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
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 30,
    marginTop: 10,
  },
  cardsContainer: {
    width: '100%',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 5,
  },
  cardUnit: {
    fontSize: 14,
    color: '#666',
  },
  metaContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  errorText: {
    fontSize: 16,
    color: '#ff0000',
    marginTop: 20,
  },
});
