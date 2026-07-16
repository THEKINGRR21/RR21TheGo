import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { color } from '@/theme/tokens';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import Svg, { Path, Circle, Line, Text as SvgText, G } from 'react-native-svg';

const API_BASE = 'https://rr21thego.onrender.com/api';

interface TrendPoint {
  date: string;
  weightKg: number | null;
  trendKg: number;
}

interface FoodLog {
  date: string;
  kcalLogged: number;
}

interface CoachingInsights {
  bmrKcal: number;
  calibratedTdee: number;
  dailyCalorieBudget: number;
  basis: 'estimated' | 'calibrated';
  rationale: string;
  weightChangeKg: number;
  averageLoggedKcal: number;
  isClampedToKcalFloor: boolean;
  isClampedToBmrFloor: boolean;
  trendPoints: TrendPoint[];
  foodHistory: FoodLog[];
}

export default function ExploreScreen() {
  const { authSubject } = useAuth();
  const safeAreaInsets = useSafeAreaInsets();

  const [insights, setInsights] = useState<CoachingInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchInsights = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${API_BASE}/coaching/insights`, {
        headers: { Authorization: `Bearer ${authSubject}` },
      });
      if (res.status === 200) {
        const data = await res.json();
        setInsights(data);
      } else {
        const payload = await res.json();
        setErrorMessage(payload.error || 'Failed to load coaching data');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Offline or server unreachable.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [authSubject]);

  useEffect(() => {
    if (authSubject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchInsights();
    }
  }, [authSubject, fetchInsights]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchInsights(true);
  };

  const renderWeightChart = () => {
    if (!insights || insights.trendPoints.length === 0) {
      return (
        <View style={styles.chartEmpty}>
          <ThemedText style={{ color: color.ash }}>No weight trend data logged yet.</ThemedText>
        </View>
      );
    }

    const points = insights.trendPoints;
    const windowWidth = Dimensions.get('window').width;
    const chartWidth = Math.min(windowWidth - 32, 600);
    const chartHeight = 200;
    const paddingLeft = 45;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 30;

    // Filter valid weights for min/max
    const validWeights = points
      .map(p => p.weightKg)
      .filter((w): w is number => w !== null && w > 0);
    const trendWeights = points.map(p => p.trendKg);
    const allWeights = [...validWeights, ...trendWeights];

    if (allWeights.length === 0) {
      return (
        <View style={styles.chartEmpty}>
          <ThemedText style={{ color: color.ash }}>No weight data to plot.</ThemedText>
        </View>
      );
    }

    const minY = Math.min(...allWeights) - 1.0;
    const maxY = Math.max(...allWeights) + 1.0;
    const yRange = maxY - minY || 2;

    const getX = (index: number) => {
      const step = (chartWidth - paddingLeft - paddingRight) / Math.max(1, points.length - 1);
      return paddingLeft + index * step;
    };

    const getY = (value: number) => {
      const graphHeight = chartHeight - paddingTop - paddingBottom;
      const ratio = (value - minY) / yRange;
      return chartHeight - paddingBottom - ratio * graphHeight;
    };

    // Construct SVG path for trend line
    let trendPath = '';
    points.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.trendKg);
      if (idx === 0) {
        trendPath += `M ${x} ${y}`;
      } else {
        trendPath += ` L ${x} ${y}`;
      }
    });

    // Create 3 Y-axis grid levels
    const levels = [
      minY + 0.1,
      minY + yRange / 2,
      maxY - 0.1
    ];

    return (
      <View style={styles.chartCard}>
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: color.signal }]} />
            <ThemedText type="small" style={{ color: color.chalk }}>Trend Weight (Smoothed)</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, { backgroundColor: color.ash, borderRadius: 4 }]} />
            <ThemedText type="small" style={{ color: color.ash }}>Logged Weight</ThemedText>
          </View>
        </View>

        <Svg width={chartWidth} height={chartHeight}>
          {/* Horizontal Gridlines & Labels */}
          {levels.map((val, i) => (
            <G key={`grid-${i}`}>
              <Line
                x1={paddingLeft}
                y1={getY(val)}
                x2={chartWidth - paddingRight}
                y2={getY(val)}
                stroke={color.graphite}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <SvgText
                x={paddingLeft - 8}
                y={getY(val) + 4}
                fill={color.ash}
                fontSize={10}
                textAnchor="end"
              >
                {val.toFixed(1)}kg
              </SvgText>
            </G>
          ))}

          {/* Trend Smoothed Path */}
          {trendPath ? (
            <Path
              d={trendPath}
              fill="none"
              stroke={color.signal}
              strokeWidth={3}
            />
          ) : null}

          {/* Measured Weight Dots */}
          {points.map((p, idx) => {
            if (p.weightKg === null || p.weightKg <= 0) return null;
            return (
              <Circle
                key={`dot-${idx}`}
                cx={getX(idx)}
                cy={getY(p.weightKg)}
                r={3.5}
                fill={color.chalk}
                stroke={color.void}
                strokeWidth={1.5}
              />
            );
          })}

          {/* X Axis boundaries */}
          <SvgText
            x={paddingLeft}
            y={chartHeight - 10}
            fill={color.ash}
            fontSize={10}
            textAnchor="start"
          >
            {points[0].date.split('-').slice(1).join('/')}
          </SvgText>
          <SvgText
            x={chartWidth - paddingRight}
            y={chartHeight - 10}
            fill={color.ash}
            fontSize={10}
            textAnchor="end"
          >
            {points[points.length - 1].date.split('-').slice(1).join('/')}
          </SvgText>
        </Svg>
      </View>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={color.signal} />
          <ThemedText style={{ color: color.ash, marginTop: 12 }}>Analyzing metabolic trends...</ThemedText>
        </View>
      );
    }

    if (errorMessage || !insights) {
      return (
        <View style={styles.errorContainer}>
          <ThemedText style={{ color: color.ember, textAlign: 'center', marginBottom: 16 }}>
            {errorMessage || 'Unable to load coaching profile.'}
          </ThemedText>
          <Pressable style={styles.retryButton} onPress={() => fetchInsights()}>
            <ThemedText type="smallBold" style={{ color: color.signal }}>RETRY LOADING</ThemedText>
          </Pressable>
        </View>
      );
    }

    const {
      bmrKcal,
      calibratedTdee,
      dailyCalorieBudget,
      basis,
      rationale,
      weightChangeKg,
      averageLoggedKcal,
      isClampedToKcalFloor,
      isClampedToBmrFloor,
    } = insights;

    const deficitAmount = calibratedTdee - dailyCalorieBudget;

    return (
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={color.signal} />
        }
      >
        <View style={styles.insightsWrapper}>
          {/* Status Banner */}
          {basis === 'estimated' ? (
            <View style={styles.estimatedBanner}>
              <ThemedText type="subtitle" style={{ color: color.signal, fontSize: 16 }}>
                ⏳ Baseline Calibration Mode
              </ThemedText>
              <ThemedText type="small" style={{ color: color.chalk, marginTop: 4, lineHeight: 18 }}>
                We need 7 days of daily food logs and weight readings to map your metabolic rate. Currently displaying standardized baseline estimations.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.calibratedBanner}>
              <ThemedText type="subtitle" style={{ color: color.signal, fontSize: 16 }}>
                ⚡ Metabolic Target Calibrated
              </ThemedText>
              <ThemedText type="small" style={{ color: color.chalk, marginTop: 4, lineHeight: 18 }}>
                Your body&apos;s real energy expenditure has been mapped using trailing 14-day weight changes and food logs.
              </ThemedText>
            </View>
          )}

          {/* Macro Budget Header */}
          <ThemedView type="backgroundElement" style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={{ gap: 4 }}>
                <ThemedText type="smallBold" style={{ color: color.ash }}>YOUR BUDGET</ThemedText>
                <ThemedText style={styles.heroLargeText}>
                  {dailyCalorieBudget} <ThemedText style={{ color: color.signal, fontSize: 20 }}>kcal/day</ThemedText>
                </ThemedText>
              </View>
              <View style={styles.badge}>
                <ThemedText type="smallBold" style={{ color: color.signal, fontSize: 10 }}>
                  {basis.toUpperCase()}
                </ThemedText>
              </View>
            </View>
            <View style={styles.divider} />
            <ThemedText type="small" style={{ color: color.ash, lineHeight: 16 }}>
              {rationale}
            </ThemedText>
          </ThemedView>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            <ThemedView type="backgroundElement" style={styles.gridItem}>
              <ThemedText type="small" style={{ color: color.ash }}>METABOLIC TDEE</ThemedText>
              <ThemedText type="subtitle" style={{ color: color.chalk, marginTop: 4 }}>
                {calibratedTdee} kcal
              </ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.gridItem}>
              <ThemedText type="small" style={{ color: color.ash }}>BMR BASELINE</ThemedText>
              <ThemedText type="subtitle" style={{ color: color.chalk, marginTop: 4 }}>
                {bmrKcal} kcal
              </ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.gridItem}>
              <ThemedText type="small" style={{ color: color.ash }}>APPLIED DEFICIT</ThemedText>
              <ThemedText type="subtitle" style={{ color: color.signal, marginTop: 4 }}>
                {deficitAmount > 0 ? `-${deficitAmount}` : `+${Math.abs(deficitAmount)}`} kcal
              </ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.gridItem}>
              <ThemedText type="small" style={{ color: color.ash }}>CALIBRATION WINDOW</ThemedText>
              <ThemedText type="subtitle" style={{ color: color.chalk, marginTop: 4 }}>
                14 Days
              </ThemedText>
            </ThemedView>
          </View>

          {/* Weight Trend Section */}
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle" style={{ color: color.chalk }}>Weight Smoothing Chart</ThemedText>
            <ThemedText type="small" style={{ color: color.ash, marginTop: 4 }}>
              Orange shows your smoothed weight trend ignoring daily water weight fluctuations.
            </ThemedText>
          </View>
          {renderWeightChart()}

          {/* Mathematics Explainer Card */}
          <ThemedView type="backgroundElement" style={styles.formulaCard}>
            <ThemedText type="smallBold" style={{ color: color.signal }}>HOW THE MATH WORKS</ThemedText>
            <ThemedText type="small" style={{ color: color.chalk, marginTop: 8, lineHeight: 18 }}>
              Unlike static calorie calculators that guess your metabolic rate, Go✓ solves the thermodynamics equation dynamically:
            </ThemedText>

            <View style={styles.formulaBox}>
              <ThemedText type="smallBold" style={styles.formulaText}>
                TDEE = Average Food - (Trend Weight Change × 7700 / 14)
              </ThemedText>
            </View>

            <View style={{ gap: 10, marginTop: 12 }}>
              <View style={styles.mathRow}>
                <ThemedText type="small" style={{ color: color.ash }}>Avg Food Intook:</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>{averageLoggedKcal} kcal/day</ThemedText>
              </View>
              <View style={styles.mathRow}>
                <ThemedText type="small" style={{ color: color.ash }}>Trend Weight Shift:</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>
                  {weightChangeKg > 0 ? `+${weightChangeKg}` : weightChangeKg} kg
                </ThemedText>
              </View>
              <View style={styles.mathRow}>
                <ThemedText type="small" style={{ color: color.ash }}>Energy Disbalance:</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.signal }}>
                  {Math.round((weightChangeKg * 7700) / 14)} kcal/day
                </ThemedText>
              </View>
              <View style={styles.mathRow}>
                <ThemedText type="small" style={{ color: color.ash }}>Calibrated TDEE:</ThemedText>
                <ThemedText type="smallBold" style={{ color: color.chalk }}>
                  {averageLoggedKcal} - ({Math.round((weightChangeKg * 7700) / 14)}) = {calibratedTdee} kcal
                </ThemedText>
              </View>
            </View>
          </ThemedView>

          {/* Clamping Floors / Warning Cards */}
          {(isClampedToBmrFloor || isClampedToKcalFloor) && (
            <View style={styles.warningCard}>
              <ThemedText type="smallBold" style={{ color: color.ember }}>⚠️ WELLBEING FLOOR TRIGGERED</ThemedText>
              <ThemedText type="small" style={{ color: color.chalk, marginTop: 6, lineHeight: 16 }}>
                Your calculated calorie target fell below safe metabolic boundaries. Go✓ auto-adjusted your daily target up to your safety threshold (BMR floor of {bmrKcal} kcal or absolute safety limit) to protect your thyroid and hormones.
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'ios' ? safeAreaInsets.top : 12 }]}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Coaching Insights</ThemedText>
        <View style={styles.badgeContainer}>
          <View style={styles.activeDot} />
          <ThemedText type="small" style={{ color: color.signal, fontSize: 11 }}>Active Coach</ThemedText>
        </View>
      </View>
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.void,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.graphite,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: color.chalk,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(57, 255, 20, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.signal,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  retryButton: {
    borderColor: color.signal,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  scrollView: {
    flex: 1,
  },
  insightsWrapper: {
    padding: 16,
    gap: 16,
  },
  estimatedBanner: {
    backgroundColor: 'rgba(255, 179, 0, 0.08)',
    borderColor: 'rgba(255, 179, 0, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  calibratedBanner: {
    backgroundColor: 'rgba(57, 255, 20, 0.06)',
    borderColor: 'rgba(57, 255, 20, 0.15)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    borderColor: color.graphite,
    borderWidth: 1,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLargeText: {
    fontSize: 32,
    fontWeight: '900',
    color: color.chalk,
  },
  badge: {
    borderColor: color.signal,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  divider: {
    height: 1,
    backgroundColor: color.graphite,
    marginVertical: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 12,
    borderColor: color.graphite,
    borderWidth: 1,
  },
  sectionHeader: {
    marginTop: 8,
  },
  chartCard: {
    backgroundColor: color.carbon,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    width: '100%',
    justifyContent: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 12,
    height: 3,
  },
  chartEmpty: {
    height: 180,
    backgroundColor: color.carbon,
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formulaCard: {
    borderRadius: 16,
    padding: 16,
    borderColor: color.graphite,
    borderWidth: 1,
  },
  formulaBox: {
    backgroundColor: color.void,
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
    borderColor: color.graphite,
    borderWidth: 1,
  },
  formulaText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: color.signal,
    fontSize: 11,
    textAlign: 'center',
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: color.graphite,
    paddingVertical: 6,
  },
  warningCard: {
    backgroundColor: 'rgba(255, 77, 77, 0.08)',
    borderColor: 'rgba(255, 77, 77, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
});
