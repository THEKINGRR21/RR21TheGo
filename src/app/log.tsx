import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TextInput, Pressable, FlatList, Keyboard, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { color } from '@/theme/tokens';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { LocalStore, syncOfflineQueue } from '@/utils/sync';

const API_BASE = 'https://rr21thego.onrender.com/api';

interface FoodServing {
  id: string;
  foodId: string;
  label: string;
  grams: number;
  isDefault: boolean;
}

interface Food {
  id: string;
  source: string;
  sourceId: string;
  barcode?: string;
  name: string;
  brand?: string;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbPer100g: number;
  fiberPer100g: number;
  servings: FoodServing[];
}

export default function LogScreen() {
  const { authSubject } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keyboard Autofocus Ref
  const inputRef = useRef<TextInput>(null);

  // Selected Food for Serving Picker
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedServing, setSelectedServing] = useState<FoodServing | null>(null);
  const [servingMultiplier, setServingMultiplier] = useState('1.0');
  const [customGrams, setCustomGrams] = useState('');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');

  const fetchFoods = async (q: string, barcodeStr?: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      let url = `${API_BASE}/foods/search`;
      if (barcodeStr) {
        url += `?barcode=${barcodeStr}`;
      } else if (q) {
        url += `?q=${q}`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${authSubject}` },
      });

      if (res.status === 200) {
        const data = await res.json();
        setResults(data);
      } else {
        const payload = await res.json();
        setErrorMessage(payload.error || 'Failed to search foods');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Search error. Radio off or backend offline.');
    } finally {
      setIsLoading(false);
    }
  };

  // Autofocus the search input on load
  useEffect(() => {
    // Small timeout to ensure layout is ready
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch results when search query changes
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchFoods(searchQuery);
    }, 150); // Small debounce

    return () => clearTimeout(delayDebounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleBarcodeSearch = () => {
    if (!barcodeQuery) return;
    fetchFoods('', barcodeQuery);
    Keyboard.dismiss();
  };

  const handleSelectFood = (food: Food) => {
    setSelectedFood(food);
    
    // Default to the default serving size
    const defServing = food.servings.find(s => s.isDefault) || food.servings[0] || null;
    setSelectedServing(defServing);
    setServingMultiplier('1.0');
    setCustomGrams(defServing ? defServing.grams.toString() : '100');
    setErrorMessage(null);
  };

  const handleServingMultiplierChange = (text: string) => {
    setServingMultiplier(text);
    const multiplier = Number(text) || 0;
    if (selectedServing) {
      setCustomGrams((selectedServing.grams * multiplier).toFixed(1));
    }
  };

  const handleCustomGramsChange = (text: string) => {
    setCustomGrams(text);
    const grams = Number(text) || 0;
    if (selectedServing && selectedServing.grams > 0) {
      setServingMultiplier((grams / selectedServing.grams).toFixed(2));
    } else {
      setServingMultiplier('0.0');
    }
  };

  const handleLogFood = async () => {
    if (!selectedFood || !authSubject) return;
    setIsLoading(true);
    try {
      const grams = Number(customGrams) || 100;
      
      // Calculate macros proportional to grams logged
      const factor = grams / 100;
      const kcal = selectedFood.kcalPer100g * factor;
      const proteinG = selectedFood.proteinPer100g ? selectedFood.proteinPer100g * factor : 0;
      const fatG = selectedFood.fatPer100g ? selectedFood.fatPer100g * factor : 0;
      const carbG = selectedFood.carbPer100g ? selectedFood.carbPer100g * factor : 0;

      const body = {
        foodId: selectedFood.id,
        loggedFor: new Date().toISOString().split('T')[0],
        meal: mealType,
        grams,
        kcal,
        proteinG,
        fatG,
        carbG,
        clientId: `client_${Math.random().toString(36).substring(2)}${Date.now()}`, // Idempotency key
      };

      // 1. Create a local log record to show immediately
      const localEntry = {
        id: `entry_${Math.random().toString(36).substring(2)}${Date.now()}`,
        foodId: selectedFood.id,
        loggedFor: body.loggedFor,
        meal: body.meal,
        grams: String(body.grams),
        kcal: String(body.kcal),
        proteinG: String(body.proteinG),
        fatG: String(body.fatG),
        carbG: String(body.carbG),
        foodName: selectedFood.name,
        foodBrand: selectedFood.brand,
        clientId: body.clientId,
      };

      // 2. Write to local cache first
      LocalStore.addLocalEntry(localEntry);

      // 3. Enqueue syncer write queue item
      LocalStore.enqueue('INSERT_ENTRY', body);

      // 4. Trigger asynchronous background sync
      syncOfflineQueue(authSubject).catch(err => console.warn('Background sync failed:', err));

      // 5. Instantly redirect home
      setSelectedFood(null);
      router.replace('/');
    } catch (err) {
      console.error('Error logging food:', err);
      setErrorMessage('Failed to log food.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
          <ThemedText type="smallBold" style={{ color: color.ash }}>CANCEL</ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={styles.headerTitle}>Log Food</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      {!selectedFood ? (
        // Search Interface
        <View style={styles.searchContainer}>
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search foods (chicken, rice, oats...)"
            placeholderTextColor={color.ash}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.barcodeSearchRow}>
            <TextInput
              style={[styles.searchInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Scan/Enter Barcode (e.g. 3017620422003)"
              placeholderTextColor={color.ash}
              value={barcodeQuery}
              onChangeText={setBarcodeQuery}
              keyboardType="numeric"
            />
            <Pressable style={styles.scanButton} onPress={handleBarcodeSearch}>
              <ThemedText type="smallBold" style={{ color: color.signal }}>SCAN</ThemedText>
            </Pressable>
          </View>

          {isLoading && <ActivityIndicator size="small" color={color.signal} style={{ margin: 16 }} />}

          {errorMessage && (
            <ThemedView type="backgroundElement" style={styles.errorBanner}>
              <ThemedText type="small" style={{ color: color.ember }}>{errorMessage}</ThemedText>
            </ThemedView>
          )}

          <FlatList
            data={results}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <ThemedText type="small" style={styles.emptyText}>
                    {searchQuery ? "No foods found." : "Nothing logged yet. Start with what you ate most recently."}
                  </ThemedText>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <Pressable style={styles.foodRow} onPress={() => handleSelectFood(item)}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  {item.brand && <ThemedText type="small" style={{ color: color.ash }}>{item.brand}</ThemedText>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <ThemedText type="smallBold" style={{ color: color.signal }}>{item.kcalPer100g} kcal</ThemedText>
                  <ThemedText type="small" style={{ color: color.ash }}>per 100g</ThemedText>
                </View>
              </Pressable>
            )}
          />
        </View>
      ) : (
        // Serving Picker Interface
        <ScrollView contentContainerStyle={styles.pickerContainer}>
          <ThemedView type="backgroundElement" style={styles.pickerCard}>
            <ThemedText type="subtitle">{selectedFood.name}</ThemedText>
            {selectedFood.brand && <ThemedText type="small" style={{ color: color.ash, marginTop: -8 }}>{selectedFood.brand}</ThemedText>}

            <View style={styles.pickerSection}>
              <ThemedText type="small" style={styles.sectionLabel}>SELECT MEAL</ThemedText>
              <View style={styles.row}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(m => (
                  <Pressable
                    key={m}
                    style={[styles.mealButton, mealType === m && styles.mealButtonSelected]}
                    onPress={() => setMealType(m)}
                  >
                    <ThemedText type="small" style={mealType === m ? styles.mealTextSelected : styles.mealText}>{m.toUpperCase()}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.pickerSection}>
              <ThemedText type="small" style={styles.sectionLabel}>SERVING UNIT</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', gap: 8 }}>
                {selectedFood.servings.map(s => (
                  <Pressable
                    key={s.id}
                    style={[styles.servingButton, selectedServing?.id === s.id && styles.servingButtonSelected]}
                    onPress={() => {
                      setSelectedServing(s);
                      const mult = Number(servingMultiplier) || 1.0;
                      setCustomGrams((s.grams * mult).toFixed(1));
                    }}
                  >
                    <ThemedText type="small" style={selectedServing?.id === s.id ? { color: color.signal } : { color: color.ash }}>
                      {s.label} ({s.grams}g)
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.pickerSection}>
              <View style={styles.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={styles.sectionLabel}>MULTIPLIER</ThemedText>
                  <TextInput
                    style={styles.pickerInput}
                    value={servingMultiplier}
                    onChangeText={handleServingMultiplierChange}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <ThemedText type="small" style={styles.sectionLabel}>TOTAL GRAMS</ThemedText>
                  <TextInput
                    style={styles.pickerInput}
                    value={customGrams}
                    onChangeText={handleCustomGramsChange}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            {/* Live Macro Summary */}
            <ThemedView type="backgroundSelected" style={styles.macroSummaryCard}>
              <View style={styles.macroCol}>
                <ThemedText type="small" style={{ color: color.ash }}>CALORIES</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.signal }}>
                  {((selectedFood.kcalPer100g * (Number(customGrams) || 0)) / 100).toFixed(0)} kcal
                </ThemedText>
              </View>
              <View style={styles.macroCol}>
                <ThemedText type="small" style={{ color: color.ash }}>PROTEIN</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>
                  {selectedFood.proteinPer100g ? ((selectedFood.proteinPer100g * (Number(customGrams) || 0)) / 100).toFixed(1) : '0.0'}g
                </ThemedText>
              </View>
              <View style={styles.macroCol}>
                <ThemedText type="small" style={{ color: color.ash }}>FATS</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>
                  {selectedFood.fatPer100g ? ((selectedFood.fatPer100g * (Number(customGrams) || 0)) / 100).toFixed(1) : '0.0'}g
                </ThemedText>
              </View>
              <View style={styles.macroCol}>
                <ThemedText type="small" style={{ color: color.ash }}>CARBS</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>
                  {selectedFood.carbPer100g ? ((selectedFood.carbPer100g * (Number(customGrams) || 0)) / 100).toFixed(1) : '0.0'}g
                </ThemedText>
              </View>
            </ThemedView>

            {errorMessage && <ThemedText type="small" style={{ color: color.ember }}>{errorMessage}</ThemedText>}

            <View style={styles.row}>
              <Pressable style={styles.pickerSecondaryButton} onPress={() => setSelectedFood(null)}>
                <ThemedText type="smallBold" style={{ color: color.ash }}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.pickerPrimaryButton} onPress={handleLogFood}>
                <ThemedText type="smallBold" style={{ color: color.signal }}>LOG ENTRY</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </ScrollView>
      )}
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
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: color.graphite,
  },
  backButton: {
    paddingVertical: 8,
    width: 60,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: color.chalk,
  },
  searchContainer: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  searchInput: {
    backgroundColor: color.carbon,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    color: color.chalk,
    padding: 12,
    fontSize: 15,
    marginBottom: 8,
  },
  barcodeSearchRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  scanButton: {
    backgroundColor: color.carbon,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    borderColor: color.ember,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  listContent: {
    gap: 8,
    paddingBottom: 24,
  },
  foodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: color.carbon,
    padding: 16,
    borderRadius: 8,
    borderColor: color.graphite,
    borderWidth: 1,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: color.ash,
    textAlign: 'center',
  },
  pickerContainer: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerCard: {
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 20,
  },
  pickerSection: {
    gap: 8,
  },
  sectionLabel: {
    fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: color.ash,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  mealButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  mealButtonSelected: {
    borderColor: color.signal,
  },
  mealText: {
    fontSize: 11,
    color: color.ash,
  },
  mealTextSelected: {
    fontSize: 11,
    color: color.signal,
    fontWeight: '700',
  },
  servingButton: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  servingButtonSelected: {
    borderColor: color.signal,
  },
  pickerInput: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    color: color.chalk,
    padding: 12,
    fontSize: 15,
  },
  macroSummaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    borderRadius: 8,
    borderColor: color.graphite,
    borderWidth: 1,
  },
  macroCol: {
    alignItems: 'center',
    gap: 4,
  },
  pickerPrimaryButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerSecondaryButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
