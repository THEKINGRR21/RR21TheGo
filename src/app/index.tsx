import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, Platform, ScrollView, TextInput } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { color } from '@/theme/tokens';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { calculateWeightTrends, TrendPoint } from '@/utils/weight';
import { WeightChart } from '@/components/weight-chart';
import { formatWeight } from '@/utils/units';
import { TheTick } from '@/components/the-tick';
import { LocalStore, syncOfflineQueue } from '@/utils/sync';
import crypto from 'crypto';

const API_BASE = 'http://localhost:3000/api';

interface LoggedEntry {
  id: string;
  foodId: string;
  loggedFor: string;
  meal: string;
  grams: string;
  kcal: string;
  proteinG: string | null;
  fatG: string | null;
  carbG: string | null;
  foodName: string;
  foodBrand: string | null;
}

interface RawWeightEntry {
  id: string;
  date: string;
  weightKg: string;
  bodyFatPct: string | null;
  source: string;
}

export default function HomeScreen() {
  const { user, target, authSubject, logout, deleteAccount, toggleUnits } = useAuth();
  
  const [entries, setEntries] = useState<LoggedEntry[]>([]);
  const [weightHistory, setWeightHistory] = useState<RawWeightEntry[]>([]);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settings & Wellbeing States
  const [hideNumbers, setHideNumbers] = useState(false);

  // Weight Logging UI State
  const [isLoggingWeight, setIsLoggingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [bodyFatInput, setBodyFatInput] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchTodayEntries = async () => {
    if (!authSubject) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/entries?date=${todayStr}`, {
        headers: { 'Authorization': `Bearer ${authSubject}` }
      });

      if (res.status === 200) {
        const data = await res.json();
        setEntries(data);
        LocalStore.setLocalEntries(data);
      } else {
        const payload = await res.json();
        setErrorMessage(payload.error || 'Failed to load entries');
        // Fallback to local cache
        setEntries(LocalStore.getLocalEntries(todayStr));
      }
    } catch {
      // Offline fallback
      setEntries(LocalStore.getLocalEntries(todayStr));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWeightHistory = async () => {
    if (!authSubject) return;
    try {
      const res = await fetch(`${API_BASE}/weight/history`, {
        headers: { 'Authorization': `Bearer ${authSubject}` }
      });

      if (res.status === 200) {
        const data = await res.json();
        setWeightHistory(data);
        LocalStore.setLocalWeights(data);

        const mappedEntries = data.map((d: any) => ({
          date: d.date,
          weightKg: Number(d.weightKg),
        }));
        setTrendPoints(calculateWeightTrends(mappedEntries));
      } else {
        // Fallback to local cache
        const cached = LocalStore.getLocalWeights();
        setWeightHistory(cached);
        const mapped = cached.map((d: any) => ({
          date: d.date,
          weightKg: Number(d.weightKg),
        }));
        setTrendPoints(calculateWeightTrends(mapped));
      }
    } catch (err) {
      console.error('Failed to load weight history:', err);
      // Offline fallback
      const cached = LocalStore.getLocalWeights();
      setWeightHistory(cached);
      const mapped = cached.map((d: any) => ({
        date: d.date,
        weightKg: Number(d.weightKg),
      }));
      setTrendPoints(calculateWeightTrends(mapped));
    }
  };

  useEffect(() => {
    if (authSubject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTodayEntries();
      fetchWeightHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSubject]);

  const handleDeleteEntry = async (id: string) => {
    try {
      // 1. Delete from local cache immediately
      LocalStore.deleteLocalEntry(id);
      setEntries(prev => prev.filter(e => e.id !== id));

      // 2. Enqueue delete action
      LocalStore.enqueue('DELETE_ENTRY', { id });

      // 3. Trigger background sync replay
      if (authSubject) {
        syncOfflineQueue(authSubject).catch(err => console.warn('Background delete sync failed:', err));
      }
    } catch {
      setErrorMessage('Failed to delete entry.');
    }
  };

  const handleSaveWeight = async () => {
    const wVal = Number(weightInput);
    if (isNaN(wVal) || wVal <= 20 || wVal >= 300) {
      setErrorMessage('Please enter a valid weight.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 1. Create local weight log record
      const localWeight = {
        id: `weight_${crypto.randomUUID()}`,
        date: todayStr,
        weightKg: String(wVal),
        bodyFatPct: bodyFatInput ? String(bodyFatInput) : null,
        source: 'manual',
      };

      // 2. Save locally first
      LocalStore.addLocalWeight(localWeight);

      // 3. Enqueue upsert weight action
      const body = {
        weightKg: wVal,
        date: todayStr,
        bodyFatPct: bodyFatInput ? Number(bodyFatInput) : null,
      };
      LocalStore.enqueue('UPSERT_WEIGHT', body);

      // 4. Update local state and redraw trend lines instantly
      const updatedHistory = [localWeight, ...weightHistory.filter(w => w.date !== todayStr)];
      setWeightHistory(updatedHistory);

      const mapped = updatedHistory.map((d: any) => ({
        date: d.date,
        weightKg: Number(d.weightKg),
      }));
      setTrendPoints(calculateWeightTrends(mapped));

      // 5. Trigger background sync replay
      if (authSubject) {
        syncOfflineQueue(authSubject).catch(err => console.warn('Background weight sync failed:', err));
      }

      setWeightInput('');
      setBodyFatInput('');
      setIsLoggingWeight(false);
    } catch (err) {
      console.error(err);
      setErrorMessage('Failed to save weight.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!authSubject) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/user/export`, {
        headers: { 'Authorization': `Bearer ${authSubject}` }
      });
      if (res.status === 200) {
        const data = await res.json();
        const jsonStr = JSON.stringify(data, null, 2);
        
        if (Platform.OS === 'web') {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `rr21go_export_${new Date().toISOString().split('T')[0]}.json`;
          link.click();
          URL.revokeObjectURL(url);
        } else {
          console.log('Exported Data:', jsonStr);
          alert('Data exported to console log.');
        }
      } else {
        setErrorMessage('Failed to export data.');
      }
    } catch {
      setErrorMessage('Export failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate total macro intakes
  const totals = entries.reduce((acc, curr) => {
    acc.kcal += Number(curr.kcal) || 0;
    acc.protein += Number(curr.proteinG) || 0;
    acc.fat += Number(curr.fatG) || 0;
    acc.carb += Number(curr.carbG) || 0;
    return acc;
  }, { kcal: 0, protein: 0, fat: 0, carb: 0 });

  const targetKcal = target?.kcal || 2000;
  const targetProtein = target?.proteinG || 150;
  const targetFat = target?.fatG || 70;
  const targetCarb = target?.carbG || 300;

  // Active user unit system preference
  const activeUnit = user?.units || 'metric';

  // Get current weight trend display in active units
  const currentTrendPoint = trendPoints[trendPoints.length - 1];
  const currentTrendDisplay = currentTrendPoint ? formatWeight(currentTrendPoint.trendKg, activeUnit) : 'No data';
  const currentWeightDisplay = weightHistory[0] ? formatWeight(Number(weightHistory[0].weightKg), activeUnit) : 'No data';

  return (
    <ThemedView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <ThemedText type="subtitle">Dashboard</ThemedText>
          <ThemedText type="small" style={{ color: color.ash }}>Logged as {user?.email}</ThemedText>
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setHideNumbers(prev => !prev)} style={styles.toggleButton}>
            <ThemedText type="smallBold" style={{ color: hideNumbers ? color.ember : color.ash }}>
              {hideNumbers ? 'SHOW #' : 'HIDE #'}
            </ThemedText>
          </Pressable>
          <Pressable onPress={toggleUnits} style={styles.toggleButton}>
            <ThemedText type="smallBold" style={{ color: color.signal }}>
              {activeUnit.toUpperCase()}
            </ThemedText>
          </Pressable>
          <Pressable onPress={logout} style={styles.logoutButton}>
            <ThemedText type="smallBold" style={{ color: color.ash }}>LOGOUT</ThemedText>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Calorie Progress Ring Card */}
        <ThemedView type="backgroundElement" style={styles.card}>
          
          {/* Animated Tick progress indicator */}
          <TheTick consumedKcal={totals.kcal} targetKcal={targetKcal} hideNumbers={hideNumbers} />

          {/* Macro Progress Bars */}
          <View style={styles.macrosContainer}>
            <View style={styles.macroProgressItem}>
              <View style={styles.macroHeader}>
                <ThemedText type="smallBold">PROTEIN</ThemedText>
                {!hideNumbers && (
                  <ThemedText type="small" style={{ color: color.ash }}>
                    {totals.protein.toFixed(0)}g / {targetProtein}g
                  </ThemedText>
                )}
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (totals.protein / targetProtein) * 100)}%` }]} />
              </View>
            </View>

            <View style={styles.macroProgressItem}>
              <View style={styles.macroHeader}>
                <ThemedText type="smallBold">FATS</ThemedText>
                {!hideNumbers && (
                  <ThemedText type="small" style={{ color: color.ash }}>
                    {totals.fat.toFixed(0)}g / {targetFat}g
                  </ThemedText>
                )}
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (totals.fat / targetFat) * 100)}%` }]} />
              </View>
            </View>

            <View style={styles.macroProgressItem}>
              <View style={styles.macroHeader}>
                <ThemedText type="smallBold">CARBS</ThemedText>
                {!hideNumbers && (
                  <ThemedText type="small" style={{ color: color.ash }}>
                    {totals.carb.toFixed(0)}g / {targetCarb}g
                  </ThemedText>
                )}
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (totals.carb / targetCarb) * 100)}%` }]} />
              </View>
            </View>
          </View>

          {target?.rationale && !hideNumbers && (
            <View style={{ borderTopWidth: 1, borderTopColor: color.graphite, paddingTop: 12, marginTop: 4 }}>
              <ThemedText type="small" style={{ color: color.ash, fontSize: 11, lineHeight: 15 }}>
                {target.rationale}
              </ThemedText>
            </View>
          )}
        </ThemedView>

        {/* Body Weight Trend smoothed card */}
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <ThemedText type="small" style={styles.progressLabel}>WEIGHT TREND</ThemedText>
              <ThemedText type="title" style={{ color: color.signal }}>{currentTrendDisplay}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText type="small" style={styles.progressLabel}>LATEST RAW</ThemedText>
              <ThemedText type="subtitle">{currentWeightDisplay}</ThemedText>
            </View>
          </View>

          {/* weight line chart */}
          <WeightChart points={trendPoints} unit={activeUnit} />

          {/* Logging Weight Input Block */}
          {isLoggingWeight ? (
            <View style={styles.weightForm}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={styles.progressLabel}>WEIGHT (KG)</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={weightInput}
                    onChangeText={setWeightInput}
                    keyboardType="numeric"
                    placeholder="80.5"
                    placeholderTextColor={color.ash}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={styles.progressLabel}>BODY FAT % (OPT)</ThemedText>
                  <TextInput
                    style={styles.formInput}
                    value={bodyFatInput}
                    onChangeText={setBodyFatInput}
                    keyboardType="numeric"
                    placeholder="15.0"
                    placeholderTextColor={color.ash}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <Pressable style={styles.formSecondaryButton} onPress={() => setIsLoggingWeight(false)}>
                  <ThemedText type="smallBold" style={{ color: color.ash }}>CANCEL</ThemedText>
                </Pressable>
                <Pressable style={styles.formPrimaryButton} onPress={handleSaveWeight}>
                  <ThemedText type="smallBold" style={{ color: color.signal }}>SAVE WEIGHT</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable style={styles.outlineButton} onPress={() => setIsLoggingWeight(true)}>
              <ThemedText type="smallBold" style={{ color: color.signal }}>+ LOG DAILY WEIGHT</ThemedText>
            </Pressable>
          )}
        </ThemedView>

        {errorMessage && (
          <ThemedView type="backgroundElement" style={styles.errorCard}>
            <ThemedText type="small" style={{ color: color.ember }}>{errorMessage}</ThemedText>
          </ThemedView>
        )}

        {/* Logged Entries list header */}
        <View style={styles.sectionHeader}>
          <ThemedText type="subtitle">Logged Today</ThemedText>
          {isLoading && <ActivityIndicator size="small" color={color.signal} />}
        </View>

        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="small" style={styles.emptyText}>Nothing logged today yet.</ThemedText>
          </View>
        ) : (
          <View style={styles.entriesList}>
            {entries.map(item => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.entryRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{item.foodName}</ThemedText>
                  <ThemedText type="small" style={{ color: color.ash }}>
                    {item.meal.toUpperCase()} • {Number(item.grams).toFixed(0)}g
                  </ThemedText>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    {!hideNumbers ? (
                      <>
                        <ThemedText type="smallBold" style={{ color: color.signal }}>
                          {Math.round(Number(item.kcal))} kcal
                        </ThemedText>
                        <ThemedText type="small" style={{ color: color.ash }}>
                          P:{Number(item.proteinG).toFixed(0)} F:{Number(item.fatG).toFixed(0)} C:{Number(item.carbG).toFixed(0)}
                        </ThemedText>
                      </>
                    ) : (
                      <ThemedText type="smallBold" style={{ color: color.signal }}>✓</ThemedText>
                    )}
                  </View>
                  <Pressable onPress={() => handleDeleteEntry(item.id)} style={styles.deleteButton}>
                    <ThemedText type="smallBold" style={{ color: color.ember }}>X</ThemedText>
                  </Pressable>
                </View>
              </ThemedView>
            ))}
          </View>
        )}

        {/* Log Food Action */}
        <Pressable style={styles.logFoodButton} onPress={() => router.push('/log')}>
          <ThemedText type="smallBold" style={{ color: color.signal }}>+ LOG FOOD</ThemedText>
        </Pressable>

        {/* Reset Account Danger Area */}
        <View style={styles.dangerZone}>
          <Pressable onPress={handleExportData} style={styles.exportButton}>
            <ThemedText type="small" style={{ color: color.signal }}>Export my data (JSON)</ThemedText>
          </Pressable>
          <Pressable onPress={deleteAccount} style={styles.deleteAccountButton}>
            <ThemedText type="small" style={{ color: color.ember }}>Reset & Delete Onboarding Account</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.void,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 64,
    borderBottomWidth: 1,
    borderBottomColor: color.graphite,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleButton: {
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  logoutButton: {
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  card: {
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  progressLabel: {
    fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : 'monospace',
    fontSize: 9,
    letterSpacing: 1,
    color: color.ash,
    marginBottom: 4,
  },
  calorieNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: color.chalk,
  },
  dividerVertical: {
    width: 1,
    height: 40,
    backgroundColor: color.graphite,
  },
  macrosContainer: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: color.graphite,
    paddingTop: 16,
  },
  macroProgressItem: {
    gap: 6,
  },
  macroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: color.void,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: color.signal,
    borderRadius: 3,
  },
  weightForm: {
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: color.graphite,
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  formInput: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    color: color.chalk,
    padding: 12,
    fontSize: 15,
  },
  formPrimaryButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSecondaryButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButton: {
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  emptyState: {
    backgroundColor: color.carbon,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: color.ash,
  },
  entriesList: {
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
  },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  logFoodButton: {
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  errorCard: {
    borderColor: color.ember,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
   dangerZone: {
    marginTop: 32,
    alignItems: 'center',
  },
  exportButton: {
    padding: 8,
    marginBottom: 8,
  },
  deleteAccountButton: {
    padding: 8,
  },
});
