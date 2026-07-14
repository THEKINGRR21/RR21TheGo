import React, { useEffect, useState } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '@/theme/tokens';
import { ThemedText } from './themed-text';

// Wrap Path with Animated to support strokeDashoffset animations
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface TheTickProps {
  consumedKcal: number;
  targetKcal: number;
  hideNumbers?: boolean;
}

// Path Definition: M 30 60 L 52 82 L 95 38 L 112 18
const PATH_TOTAL_LENGTH = 118.88;
const PATH_BASE_LENGTH = 92.63;
const PATH_TAIL_LENGTH = 26.25;

export function TheTick({ consumedKcal, targetKcal, hideNumbers = false }: TheTickProps) {
  const percent = targetKcal > 0 ? consumedKcal / targetKcal : 0;
  const isOver = percent > 1.0;

  // Animating stroke offset
  const [offsetAnim] = useState(() => new Animated.Value(PATH_TOTAL_LENGTH));

  // Animating color transition (0 = signal, 1 = ember)
  const [colorAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // 1. Calculate target offset
    let targetOffset = PATH_TOTAL_LENGTH;
    if (percent > 0) {
      if (percent <= 1.0) {
        // Draw along base path
        targetOffset = PATH_TOTAL_LENGTH - (percent * PATH_BASE_LENGTH);
      } else {
        // Fully draw base path + partial tail (capped up to 150% consumption)
        const overshootFactor = Math.min(1.0, (percent - 1.0) / 0.5);
        targetOffset = PATH_TAIL_LENGTH - (overshootFactor * PATH_TAIL_LENGTH);
      }
    }

    // Spring animation for stroke draw
    Animated.spring(offsetAnim, {
      toValue: targetOffset,
      friction: 7,
      tension: 40,
      useNativeDriver: false, // SVG props animation require false for cross-platform web compat
    }).start();

    // Color transition animation
    Animated.timing(colorAnim, {
      toValue: isOver ? 1 : 0,
      duration: 350,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [percent, isOver, offsetAnim, colorAnim]);

  // Interpolated stroke color
  const strokeColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [color.signal, color.ember],
  });

  return (
    <View style={styles.container}>
      <View style={styles.svgWrapper}>
        <Svg width="140" height="110" viewBox="0 0 140 110" fill="none">
          {/* 1. Ghost background outline path (graphite) */}
          <Path
            d="M 30 60 L 52 82 L 95 38"
            stroke={color.graphite}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* 2. Foreground animated checkmark path */}
          <AnimatedPath
            d="M 30 60 L 52 82 L 95 38 L 112 18"
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${PATH_TOTAL_LENGTH}`}
            strokeDashoffset={offsetAnim}
          />
        </Svg>
      </View>

      {/* Numerical readouts or hide numbers mode indicator */}
      {!hideNumbers ? (
        <View style={styles.infoBlock}>
          <ThemedText type="small" style={styles.label}>
            {isOver ? 'OVER BUDGET' : 'REMAINING'}
          </ThemedText>
          <ThemedText
            type="title"
            style={[
              styles.remainingValue,
              isOver && { color: color.ember }
            ]}
          >
            {isOver ? `+${Math.round(consumedKcal - targetKcal)}` : Math.max(0, Math.round(targetKcal - consumedKcal))}
          </ThemedText>
          <ThemedText type="small" style={styles.unit}>
            kcal
          </ThemedText>
        </View>
      ) : (
        <View style={styles.infoBlock}>
          <ThemedText type="small" style={styles.label}>
            {isOver ? 'OVER TARGET' : 'DAILY STATUS'}
          </ThemedText>
          <ThemedText
            type="title"
            style={[
              styles.remainingValue,
              { color: isOver ? color.ember : color.signal }
            ]}
          >
            {isOver ? '✓+' : '✓'}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  svgWrapper: {
    height: 110,
    width: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBlock: {
    alignItems: 'center',
    marginTop: 8,
  },
  label: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    letterSpacing: 1,
    color: color.ash,
  },
  remainingValue: {
    fontSize: 34,
    fontWeight: '800',
    color: color.chalk,
    marginVertical: 2,
  },
  unit: {
    fontSize: 10,
    color: color.ash,
  },
});
