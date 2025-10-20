import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Toast, { ToastConfig } from './Toast';

interface ToastManagerProps {
  toasts: ToastConfig[];
  onRemoveToast: (id: string) => void;
}

const ToastManager: React.FC<ToastManagerProps> = ({ toasts, onRemoveToast }) => {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onRemove={onRemoveToast}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});

export default ToastManager;
