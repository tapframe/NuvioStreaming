import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors } from '../../styles';

const POSTER_WIDTH = 90;
const POSTER_HEIGHT = 135;

const SkeletonLoader: React.FC = () => {
  const pulseAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const renderSkeletonItem = () => (
    <View style={styles.skeletonVerticalItem}>
      <Animated.View style={[styles.skeletonPoster, { opacity }]} />
      <View style={styles.skeletonItemDetails}>
        <Animated.View style={[styles.skeletonTitle, { opacity }]} />
        <View style={styles.skeletonMetaRow}>
          <Animated.View style={[styles.skeletonMeta, { opacity }]} />
          <Animated.View style={[styles.skeletonMeta, { opacity }]} />
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.skeletonContainer}>
      {[...Array(5)].map((_, index) => (
        <View key={index}>
          {index === 0 && (
            <Animated.View style={[styles.skeletonSectionHeader, { opacity }]} />
          )}
          {renderSkeletonItem()}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  skeletonContainer: {
    padding: 16,
  },
  skeletonVerticalItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  skeletonPoster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 8,
    backgroundColor: colors.darkBackground,
  },
  skeletonItemDetails: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  skeletonMetaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  skeletonTitle: {
    height: 20,
    width: '80%',
    marginBottom: 8,
    backgroundColor: colors.darkBackground,
    borderRadius: 4,
  },
  skeletonMeta: {
    height: 14,
    width: '30%',
    backgroundColor: colors.darkBackground,
    borderRadius: 4,
  },
  skeletonSectionHeader: {
    height: 24,
    width: '40%',
    backgroundColor: colors.darkBackground,
    marginBottom: 16,
    borderRadius: 4,
  },
});

export default SkeletonLoader; 