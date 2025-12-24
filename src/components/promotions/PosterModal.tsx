import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Image,
    Linking,
} from 'react-native';
import Animated, {
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Campaign } from '../../services/campaignService';

interface PosterModalProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: any) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const PosterModal: React.FC<PosterModalProps> = ({
    campaign,
    onDismiss,
    onAction,
}) => {
    const insets = useSafeAreaInsets();
    const { content } = campaign;
    const isPosterOnly = !content.title && !content.message;

    const handleAction = () => {
        if (content.primaryAction) {
            if (content.primaryAction.type === 'link' && content.primaryAction.value) {
                Linking.openURL(content.primaryAction.value);
                onAction(content.primaryAction);
                onDismiss();
            } else if (content.primaryAction.type === 'dismiss') {
                onDismiss();
            } else {
                onAction(content.primaryAction);
            }
        }
    };

    return (
        <View style={StyleSheet.absoluteFill}>
            {/* Backdrop */}
            <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.backdrop}
            >
                <BlurView
                    intensity={30}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                />
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onDismiss}
                />
            </Animated.View>

            {/* Modal Container */}
            <Animated.View
                entering={FadeIn.duration(250)}
                exiting={FadeOut.duration(200)}
                style={[
                    styles.modalContainer,
                    { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }
                ]}
                pointerEvents="box-none"
            >
                <View style={styles.contentWrapper}>
                    {/* Close Button */}
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onDismiss}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    >
                        <View style={styles.closeButtonBg}>
                            <Ionicons
                                name="close"
                                size={20}
                                color={content.closeButtonColor || '#fff'}
                            />
                        </View>
                    </TouchableOpacity>

                    {/* Main Image */}
                    {content.imageUrl && (
                        <View style={[
                            styles.imageContainer,
                            { aspectRatio: content.aspectRatio || 0.7 }
                        ]}>
                            <Image
                                source={{ uri: content.imageUrl }}
                                style={styles.image}
                                resizeMode="cover"
                            />
                        </View>
                    )}

                    {/* Text Content */}
                    {!isPosterOnly && (
                        <View style={[
                            styles.textContainer,
                            { backgroundColor: content.backgroundColor || '#1a1a1a' }
                        ]}>
                            {content.title && (
                                <Text style={[styles.title, { color: content.textColor || '#fff' }]}>
                                    {content.title}
                                </Text>
                            )}
                            {content.message && (
                                <Text style={[styles.message, { color: content.textColor || '#fff' }]}>
                                    {content.message}
                                </Text>
                            )}
                        </View>
                    )}

                    {/* Primary Action Button */}
                    {content.primaryAction && (
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                {
                                    backgroundColor: content.textColor || '#fff',
                                    marginTop: isPosterOnly ? 16 : 0,
                                }
                            ]}
                            onPress={handleAction}
                            activeOpacity={0.8}
                        >
                            <Text style={[
                                styles.actionButtonText,
                                { color: content.backgroundColor || '#1a1a1a' }
                            ]}>
                                {content.primaryAction.label}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 998,
    },
    modalContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
    },
    contentWrapper: {
        width: Math.min(SCREEN_WIDTH * 0.85, 340),
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        zIndex: 1000,
    },
    closeButtonBg: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageContainer: {
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#222',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        width: '100%',
        padding: 20,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        marginTop: -2,
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 6,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        opacity: 0.85,
    },
    actionButton: {
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 24,
        marginTop: 16,
        minWidth: 180,
        alignItems: 'center',
    },
    actionButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
