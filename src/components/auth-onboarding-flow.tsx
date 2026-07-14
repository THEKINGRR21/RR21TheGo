import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { color } from '@/theme/tokens';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { computeTarget, calculateBMI, calculateMinWeightForBMI } from '@/utils/nutrition';

type Step = 'login' | 'demographics' | 'metrics' | 'scan' | 'goals' | 'rate' | 'target_card';

export function AuthOnboardingFlow() {
  const { loginWithEmail, registerOnboarding, error, clearError } = useAuth();
  
  const [step, setStep] = useState<Step>('login');
  
  // Login State
  const [email, setEmail] = useState('');
  
  // Demographics State
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [sexAtBirth, setSexAtBirth] = useState<'male' | 'female'>('female');
  
  // Metrics State
  const [heightCm, setHeightCm] = useState('175');
  const [weightKg, setWeightKg] = useState('75');
  
  // Body Scan State
  const [hasScan, setHasScan] = useState<boolean | null>(null);
  const [leanMassKg, setLeanMassKg] = useState('');
  
  // Goals State
  const [activity, setActivity] = useState<'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extremely_active'>('moderately_active');
  const [goal, setGoal] = useState<'cut' | 'maintain' | 'gain'>('cut');
  
  // Rate State
  const [rateWeeklyPct, setRateWeeklyPct] = useState('0.5');
  const [goalWeightKg, setGoalWeightKg] = useState('68');
  
  // Local validation / math display state
  const [localCalculation, setLocalCalculation] = useState<any>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tappableExplainer, setTappableExplainer] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.includes('@')) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setLocalError(null);
    clearError();
    try {
      await loginWithEmail(email);
      setStep('demographics');
    } catch (err: any) {
      setLocalError(err.message);
    }
  };

  const handleDemographicsNext = () => {
    // Validate age gate
    try {
      const today = new Date();
      const birth = new Date(birthDate);
      if (isNaN(birth.getTime())) {
        setLocalError('Please enter birthdate in YYYY-MM-DD format.');
        return;
      }
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      if (age < 18) {
        setLocalError('Age gate: You must be 18 years or older to register.');
        return;
      }
      setLocalError(null);
      setStep('metrics');
    } catch {
      setLocalError('Invalid birthdate format.');
    }
  };

  const handleMetricsNext = () => {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!h || h <= 50 || h >= 250) {
      setLocalError('Please enter a valid height between 50 and 250 cm.');
      return;
    }
    if (!w || w <= 20 || w >= 300) {
      setLocalError('Please enter a valid weight.');
      return;
    }
    setLocalError(null);
    setStep('scan');
  };

  const handleScanNext = () => {
    if (hasScan === null) {
      setLocalError('Please select whether you had a body composition scan.');
      return;
    }
    if (hasScan) {
      const lbm = Number(leanMassKg);
      const totalW = Number(weightKg);
      if (!lbm || lbm <= 10 || lbm >= totalW) {
        setLocalError(`Please enter a valid lean mass less than your total weight (${totalW} kg).`);
        return;
      }
    }
    setLocalError(null);
    setStep('goals');
  };

  const handleGoalsNext = () => {
    setLocalError(null);
    setStep('rate');
  };

  const handleRateNext = () => {
    // Validate BMI floors and calculate target
    try {
      const h = Number(heightCm);
      const w = Number(weightKg);
      const gw = goalWeightKg ? Number(goalWeightKg) : undefined;
      const rate = Number(rateWeeklyPct);

      if (gw) {
        const goalBmi = calculateBMI(gw, h);
        if (goalBmi < 18.5) {
          const minW = calculateMinWeightForBMI(h);
          setLocalError(`Goal weight of ${gw} kg results in BMI of ${goalBmi}. Healthy floor (BMI 18.5) weight is ${minW} kg. Adjust your goal weight.`);
          return;
        }
      }

      const calc = computeTarget({
        sex: sexAtBirth,
        birthDate,
        heightCm: h,
        weightKg: w,
        activity,
        goal,
        rateWeeklyPct: rate,
        leanMassKg: hasScan ? Number(leanMassKg) : undefined,
        goalWeightKg: gw,
      });

      setLocalCalculation(calc);
      setLocalError(null);
      setStep('target_card');
    } catch (err: any) {
      setLocalError(err.message);
    }
  };

  const handleCompleteRegistration = async () => {
    try {
      setLocalError(null);
      await registerOnboarding({
        email,
        birthDate,
        sexAtBirth,
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        activity,
        goal,
        rateWeeklyPct: Number(rateWeeklyPct),
        leanMassKg: hasScan ? Number(leanMassKg) : undefined,
        goalWeightKg: goalWeightKg ? Number(goalWeightKg) : undefined,
        displayName: email.split('@')[0],
      });
    } catch (err: any) {
      setLocalError(err.message);
    }
  };

  const renderActiveStep = () => {
    switch (step) {
      case 'login':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Sign in with Email</ThemedText>
            <ThemedText type="small" style={styles.stepSubtitle}>Instruments measure, they do not shout.</ThemedText>
            
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={color.ash}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <Pressable style={styles.primaryButton} onPress={handleLogin}>
              <ThemedText type="smallBold" style={styles.buttonText}>CONTINUE</ThemedText>
            </Pressable>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <ThemedText type="small" style={styles.dividerText}>OR</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialButtonsContainer}>
              <Pressable style={styles.socialButton} onPress={() => loginWithEmail('apple@rr21.com')}>
                <ThemedText type="small">Sign in with Apple</ThemedText>
              </Pressable>
              <Pressable style={styles.socialButton} onPress={() => loginWithEmail('google@rr21.com')}>
                <ThemedText type="small">Sign in with Google</ThemedText>
              </Pressable>
            </View>
          </View>
        );

      case 'demographics':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Tell us about yourself</ThemedText>
            
            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>BIRTHDATE (YYYY-MM-DD)</ThemedText>
              <TextInput
                style={styles.input}
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={color.ash}
              />
              <ThemedText type="small" style={styles.helperText}>Used for age gating (18+) and BMR formula.</ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>SEX ASSIGNED AT BIRTH</ThemedText>
              <View style={styles.row}>
                <Pressable
                  style={[styles.choiceButton, sexAtBirth === 'female' && styles.choiceButtonSelected]}
                  onPress={() => setSexAtBirth('female')}
                >
                  <ThemedText type="smallBold" style={sexAtBirth === 'female' ? styles.choiceTextSelected : styles.choiceText}>FEMALE</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.choiceButton, sexAtBirth === 'male' && styles.choiceButtonSelected]}
                  onPress={() => setSexAtBirth('male')}
                >
                  <ThemedText type="smallBold" style={sexAtBirth === 'male' ? styles.choiceTextSelected : styles.choiceText}>MALE</ThemedText>
                </Pressable>
              </View>
              <ThemedText type="small" style={styles.helperText}>BMR formulas require this. Stated honestly in UI.</ThemedText>
            </View>

            <Pressable style={styles.primaryButton} onPress={handleDemographicsNext}>
              <ThemedText type="smallBold" style={styles.buttonText}>NEXT</ThemedText>
            </Pressable>
          </View>
        );

      case 'metrics':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Your metrics</ThemedText>
            
            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>HEIGHT (CM)</ThemedText>
              <TextInput
                style={styles.input}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="numeric"
                placeholder="175"
                placeholderTextColor={color.ash}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>CURRENT WEIGHT (KG)</ThemedText>
              <TextInput
                style={styles.input}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="numeric"
                placeholder="75"
                placeholderTextColor={color.ash}
              />
            </View>

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('demographics')}>
                <ThemedText type="smallBold" style={styles.secondaryButtonText}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryButtonHalf} onPress={handleMetricsNext}>
                <ThemedText type="smallBold" style={styles.buttonText}>NEXT</ThemedText>
              </Pressable>
            </View>
          </View>
        );

      case 'scan':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Body scan check</ThemedText>
            <ThemedText type="small" style={styles.stepSubtitle}>Have you had an InBody, DEXA, or body composition scan that gave you lean mass?</ThemedText>
            
            <View style={styles.row}>
              <Pressable
                style={[styles.choiceButton, hasScan === true && styles.choiceButtonSelected]}
                onPress={() => setHasScan(true)}
              >
                <ThemedText type="smallBold" style={hasScan === true ? styles.choiceTextSelected : styles.choiceText}>YES</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.choiceButton, hasScan === false && styles.choiceButtonSelected]}
                onPress={() => setHasScan(false)}
              >
                <ThemedText type="smallBold" style={hasScan === false ? styles.choiceTextSelected : styles.choiceText}>NO</ThemedText>
              </Pressable>
            </View>

            {hasScan === true && (
              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.label}>LEAN MASS (KG)</ThemedText>
                <TextInput
                  style={styles.input}
                  value={leanMassKg}
                  onChangeText={setLeanMassKg}
                  keyboardType="numeric"
                  placeholder="60"
                  placeholderTextColor={color.ash}
                />
                <ThemedText type="small" style={styles.helperText}>We will use the Katch-McArdle formula for your body.</ThemedText>
              </View>
            )}

            {hasScan === false && (
              <ThemedText type="small" style={styles.scanNotice}>
                We will use the Mifflin-St Jeor formula estimate. Go will measure and calibrate your real TDEE in about two weeks.
              </ThemedText>
            )}

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('metrics')}>
                <ThemedText type="smallBold" style={styles.secondaryButtonText}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryButtonHalf} onPress={handleScanNext}>
                <ThemedText type="smallBold" style={styles.buttonText}>NEXT</ThemedText>
              </Pressable>
            </View>
          </View>
        );

      case 'goals':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Choose your path</ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>ACTIVITY MULTIPLIER</ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollRow}>
                {['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active'].map((level: any) => (
                  <Pressable
                    key={level}
                    style={[styles.smallChoiceButton, activity === level && styles.choiceButtonSelected]}
                    onPress={() => setActivity(level)}
                  >
                    <ThemedText type="small" style={activity === level ? styles.choiceTextSelected : styles.choiceText}>
                      {level.replace('_', ' ').toUpperCase()}
                    </ThemedText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>GOAL</ThemedText>
              <View style={styles.row}>
                {['cut', 'maintain', 'gain'].map((g: any) => (
                  <Pressable
                    key={g}
                    style={[styles.smallChoiceButton, goal === g && styles.choiceButtonSelected, { flex: 1 }]}
                    onPress={() => setGoal(g)}
                  >
                    <ThemedText type="smallBold" style={goal === g ? styles.choiceTextSelected : styles.choiceText}>
                      {g.toUpperCase()}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('scan')}>
                <ThemedText type="smallBold" style={styles.secondaryButtonText}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryButtonHalf} onPress={handleGoalsNext}>
                <ThemedText type="smallBold" style={styles.buttonText}>NEXT</ThemedText>
              </Pressable>
            </View>
          </View>
        );

      case 'rate':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Rate and target weight</ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>WEEKLY RATE OF CHANGE (%)</ThemedText>
              <TextInput
                style={styles.input}
                value={rateWeeklyPct}
                onChangeText={setRateWeeklyPct}
                keyboardType="numeric"
                placeholder="0.5"
                placeholderTextColor={color.ash}
              />
              <ThemedText type="small" style={styles.helperText}>Weekly weight change target (e.g. 0.5% weight loss). Max 1%.</ThemedText>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="small" style={styles.label}>TARGET GOAL WEIGHT (KG)</ThemedText>
              <TextInput
                style={styles.input}
                value={goalWeightKg}
                onChangeText={setGoalWeightKg}
                keyboardType="numeric"
                placeholder="68"
                placeholderTextColor={color.ash}
              />
              <ThemedText type="small" style={styles.helperText}>Must respect healthy BMI floors (BMI &gt;= 18.5).</ThemedText>
            </View>

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('goals')}>
                <ThemedText type="smallBold" style={styles.secondaryButtonText}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryButtonHalf} onPress={handleRateNext}>
                <ThemedText type="smallBold" style={styles.buttonText}>CALCULATE</ThemedText>
              </Pressable>
            </View>
          </View>
        );

      case 'target_card':
        return (
          <View style={styles.card}>
            <ThemedText type="subtitle" style={styles.stepTitle}>Your calibrated target</ThemedText>
            <ThemedText type="small" style={styles.stepSubtitle}>Tap any number to view the mathematical explanation.</ThemedText>
            
            <ThemedView type="backgroundElement" style={styles.targetCardContainer}>
              <Pressable style={styles.cardMetricItem} onPress={() => setTappableExplainer(`BMR (Basal Metabolic Rate): ${localCalculation.bmr} kcal. Calculated using ${hasScan ? 'Katch-McArdle' : 'Mifflin-St Jeor'} formula.`)}>
                <ThemedText type="small" style={styles.cardMetricLabel}>BMR</ThemedText>
                <ThemedText type="subtitle" style={styles.cardMetricValue}>{localCalculation.bmr}</ThemedText>
              </Pressable>

              <Pressable style={styles.cardMetricItem} onPress={() => setTappableExplainer(`TDEE (Total Daily Energy Expenditure): TDEE = BMR * activity multiplier. Multiplying BMR by ${activity === 'sedentary' ? '1.2' : activity === 'lightly_active' ? '1.375' : activity === 'moderately_active' ? '1.55' : activity === 'very_active' ? '1.725' : '1.9'} equals ${localCalculation.tdee} kcal.`)}>
                <ThemedText type="small" style={styles.cardMetricLabel}>TDEE</ThemedText>
                <ThemedText type="subtitle" style={styles.cardMetricValue}>{localCalculation.tdee}</ThemedText>
              </Pressable>

              <Pressable style={styles.cardMetricItem} onPress={() => setTappableExplainer(`Applied Deficit: ${localCalculation.appliedDeficit} kcal. Capped at 25% of TDEE or 750 kcal, whichever is smaller.`)}>
                <ThemedText type="small" style={styles.cardMetricLabel}>DEFICIT</ThemedText>
                <ThemedText type="subtitle" style={styles.cardMetricValue}>-{localCalculation.appliedDeficit}</ThemedText>
              </Pressable>

              <View style={styles.cardDivider} />

              <Pressable style={styles.cardMetricItem} onPress={() => setTappableExplainer(`Target Calories: ${localCalculation.clampedTarget} kcal. Clamped to safety floors of 1500 (males)/1200 (females) and BMR. ${localCalculation.isClampedToBmrFloor ? 'Currently clamped to your BMR.' : localCalculation.isClampedToKcalFloor ? 'Currently clamped to gender safety floor.' : 'No clamps active.'}`)}>
                <ThemedText type="small" style={[styles.cardMetricLabel, { color: color.signal }]}>DAILY CALORIE TARGET</ThemedText>
                <ThemedText type="title" style={[styles.cardMetricValueMain, { color: color.signal }]}>{localCalculation.clampedTarget}</ThemedText>
              </Pressable>
            </ThemedView>

            {tappableExplainer && (
              <ThemedView type="backgroundSelected" style={styles.explainerCard}>
                <ThemedText type="small" style={styles.explainerText}>{tappableExplainer}</ThemedText>
              </ThemedView>
            )}

            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setStep('rate')}>
                <ThemedText type="smallBold" style={styles.secondaryButtonText}>BACK</ThemedText>
              </Pressable>
              <Pressable style={styles.primaryButtonHalf} onPress={handleCompleteRegistration}>
                <ThemedText type="smallBold" style={styles.buttonText}>START TRACKING</ThemedText>
              </Pressable>
            </View>
          </View>
        );
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.logoContainer}>
        <ThemedText type="title" style={styles.logoBrand}>RR21 <ThemedText type="title" style={{ color: color.signal }}>Go</ThemedText></ThemedText>
        <ThemedText type="small" style={styles.logoLabel}>MEASURED, NOT GUESSED.</ThemedText>
      </View>

      {renderActiveStep()}

      {(localError || error) && (
        <ThemedView type="backgroundElement" style={styles.errorContainer}>
          <ThemedText type="smallBold" style={styles.errorText}>
            {localError || error}
          </ThemedText>
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: color.void,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoBrand: {
    fontSize: 34,
    fontWeight: '800',
    color: color.chalk,
    letterSpacing: -1,
  },
  logoLabel: {
    fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : 'monospace',
    fontSize: 10,
    letterSpacing: 2,
    color: color.ash,
    marginTop: 4,
  },
  card: {
    backgroundColor: color.carbon,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    gap: 16,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: color.chalk,
  },
  stepSubtitle: {
    color: color.ash,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 8,
    width: '100%',
  },
  label: {
    fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : 'monospace',
    fontSize: 10,
    letterSpacing: 1,
    color: color.ash,
  },
  input: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    color: color.chalk,
    padding: 12,
    fontSize: 15,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  choiceButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  choiceButtonSelected: {
    borderColor: color.signal,
    borderWidth: 2,
  },
  smallChoiceButton: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginRight: 8,
  },
  choiceText: {
    color: color.ash,
  },
  choiceTextSelected: {
    color: color.signal,
  },
  helperText: {
    color: color.ash,
    fontSize: 12,
  },
  scanNotice: {
    color: color.ash,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 12,
  },
  primaryButtonHalf: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: color.signal,
    letterSpacing: 1,
  },
  secondaryButtonText: {
    color: color.ash,
    letterSpacing: 1,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: color.graphite,
  },
  dividerText: {
    color: color.ash,
    fontSize: 12,
  },
  socialButtonsContainer: {
    gap: 8,
  },
  socialButton: {
    backgroundColor: color.void,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  errorContainer: {
    backgroundColor: color.carbon,
    borderColor: color.ember,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    width: '100%',
    maxWidth: 420,
    marginTop: 16,
    alignItems: 'center',
  },
  errorText: {
    color: color.ember,
    textAlign: 'center',
  },
  targetCardContainer: {
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  cardMetricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  cardMetricLabel: {
    fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : 'monospace',
    fontSize: 11,
    color: color.ash,
  },
  cardMetricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: color.chalk,
  },
  cardMetricValueMain: {
    fontSize: 28,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    backgroundColor: color.graphite,
    marginVertical: 4,
  },
  explainerCard: {
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  explainerText: {
    color: color.chalk,
    lineHeight: 16,
  },
});
