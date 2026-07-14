import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color } from '@/theme/tokens';
import { ThemedText } from './themed-text';
import { kgToLbs } from '@/utils/units';

interface ChartPoint {
  date: string;
  weightKg: number;
  trendKg: number;
}

interface WeightChartProps {
  points: ChartPoint[];
  unit?: 'metric' | 'imperial';
}

export function WeightChart({ points, unit = 'metric' }: WeightChartProps) {
  if (points.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ThemedText type="small" style={{ color: color.ash }}>
          Log weight entries to see your smoothed trend line.
        </ThemedText>
      </View>
    );
  }

  // Sort and convert to target units for rendering math
  const sortedPoints = [...points]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(p => ({
      date: p.date,
      weightKg: unit === 'imperial' ? kgToLbs(p.weightKg) : p.weightKg,
      trendKg: unit === 'imperial' ? kgToLbs(p.trendKg) : p.trendKg,
    }));

  const labelSuffix = unit === 'imperial' ? 'lbs' : 'kg';

  // Determine boundaries
  const weights = sortedPoints.flatMap(p => [p.weightKg, p.trendKg]);
  const maxW = Math.max(...weights) + 1;
  const minW = Math.max(0, Math.min(...weights) - 1);
  const rangeW = maxW - minW || 1;

  const dates = sortedPoints.map(p => new Date(p.date).getTime());
  const maxD = Math.max(...dates);
  const minD = Math.min(...dates);
  const rangeD = maxD - minD || 1;

  // Chart Dimensions (Fixed relative canvas size for plotting coordinates)
  const chartHeight = 140;
  const chartWidth = 320; // Will scale responsively inside container

  // Calculate coordinates: maps a data point to coordinates on our grid
  const getCoordinates = (p: { date: string; weightKg: number; trendKg: number }) => {
    const time = new Date(p.date).getTime();
    const x = rangeD > 1 ? ((time - minD) / rangeD) * 100 : 50; // percentage
    const yVal = ((p.weightKg - minW) / rangeW) * 100;
    const yTrend = ((p.trendKg - minW) / rangeW) * 100;
    
    return {
      x, // percent
      yVal: 100 - yVal, // percent from top
      yTrend: 100 - yTrend, // percent from top
    };
  };

  const coords = sortedPoints.map(getCoordinates);

  return (
    <View style={styles.container}>
      {/* Chart Grid Area */}
      <View style={[styles.grid, { height: chartHeight }]}>
        {/* Y-Axis Labels */}
        <View style={styles.yAxisLabels}>
          <ThemedText type="small" style={styles.axisText}>{maxW.toFixed(0)} {labelSuffix}</ThemedText>
          <ThemedText type="small" style={styles.axisText}>{((maxW + minW) / 2).toFixed(0)} {labelSuffix}</ThemedText>
          <ThemedText type="small" style={styles.axisText}>{minW.toFixed(0)} {labelSuffix}</ThemedText>
        </View>

        {/* Plot Area */}
        <View style={styles.plotArea}>
          {/* Grid lines */}
          <View style={styles.gridLine} />
          <View style={[styles.gridLine, { top: '50%' }]} />
          <View style={[styles.gridLine, { top: '100%' }]} />

          {/* Raw Weights - Scatter Dots */}
          {coords.map((c, i) => (
            <View
              key={`dot-${i}`}
              style={[
                styles.rawDot,
                {
                  left: `${c.x}%`,
                  top: `${c.yVal}%`,
                  transform: [{ translateX: -4 }, { translateY: -4 }],
                },
              ]}
            />
          ))}

          {/* Trend Line segments */}
          {coords.map((c, i) => {
            if (i === 0) return null;
            const prev = coords[i - 1];

            // Render line segment between prev and current trend point
            // Convert percentage coordinate differences to pixel space differences for rotation math
            const x1Pix = (prev.x / 100) * chartWidth;
            const y1Pix = (prev.yTrend / 100) * chartHeight;
            const x2Pix = (c.x / 100) * chartWidth;
            const y2Pix = (c.yTrend / 100) * chartHeight;

            const dx = x2Pix - x1Pix;
            const dy = y2Pix - y1Pix;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            const xMidPct = (prev.x + c.x) / 2;
            const yMidPct = (prev.yTrend + c.yTrend) / 2;

            return (
              <View
                key={`line-${i}`}
                style={[
                  styles.trendSegment,
                  {
                    left: `${xMidPct}%`,
                    top: `${yMidPct}%`,
                    width: distance,
                    marginLeft: -distance / 2,
                    marginTop: -1, // center vertical height of 2px
                    transform: [
                      { rotate: `${angle}rad` },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      {/* X-Axis labels (dates) */}
      <View style={styles.xAxisLabels}>
        <ThemedText type="small" style={styles.axisText}>
          {sortedPoints[0].date}
        </ThemedText>
        <ThemedText type="small" style={styles.axisText}>
          {sortedPoints[sortedPoints.length - 1].date}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 12,
  },
  emptyContainer: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: color.graphite,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: 'dashed',
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    width: '100%',
  },
  yAxisLabels: {
    width: 60,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  axisText: {
    fontSize: 9,
    color: color.ash,
  },
  plotArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: color.graphite,
    opacity: 0.5,
  },
  rawDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: color.ash,
    zIndex: 2,
  },
  trendSegment: {
    position: 'absolute',
    height: 2,
    backgroundColor: color.signal,
    zIndex: 1,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 60,
    marginTop: 8,
  },
});
