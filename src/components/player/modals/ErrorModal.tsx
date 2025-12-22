import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
    FadeIn,
    FadeOut,
    ZoomIn,
    ZoomOut,
} from 'react-native-reanimated';

interface ErrorModalProps {
    showErrorModal: boolean;
    setShowErrorModal: (show: boolean) => void;
    errorDetails: string;
    onDismiss?: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
    showErrorModal,
    setShowErrorModal,
    errorDetails,
    onDismiss,
}) => {
    const { width } = useWindowDimensions();
    const MODAL_WIDTH = Math.min(width * 0.8, 400);

    const handleClose = () => {
        setShowErrorModal(false);
        if (onDismiss) {
            onDismiss();
        }
    };

    if (!showErrorModal) return null;

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex: 99999, justifyContent: 'center', alignItems: 'center' }]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose}>
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' }} />
            </TouchableOpacity>

            <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                style={{
                    width: MODAL_WIDTH,
                    backgroundColor: '#1a1a1a',
                    borderRadius: 20,
                    padding: 24,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.1)',
                }}
            >
                <View style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16
                }}>
                    <MaterialIcons name="error-outline" size={32} color="#EF4444" />
                </View>

                <Text style={{
                    color: 'white',
                    fontSize: 20,
                    fontWeight: '700',
                    marginBottom: 8,
                    textAlign: 'center'
                }}>
                    Playback Error
                </Text>

                <Text style={{
                    color: 'rgba(255,255,255,0.7)',
                    fontSize: 15,
                    textAlign: 'center',
                    marginBottom: 24,
                    lineHeight: 22
                }}>
                    {errorDetails || 'An unknown error occurred during playback.'}
                </Text>

                <TouchableOpacity
                    style={{
                        backgroundColor: 'white',
                        paddingVertical: 12,
                        paddingHorizontal: 32,
                        borderRadius: 12,
                        width: '100%',
                        alignItems: 'center'
                    }}
                    onPress={handleClose}
                    activeOpacity={0.9}
                >
                    <Text style={{
                        color: 'black',
                        fontSize: 16,
                        fontWeight: '700'
                    }}>
                        Dismiss
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
};

export default ErrorModal;
