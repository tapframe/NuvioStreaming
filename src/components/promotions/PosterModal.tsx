import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Linking,
    useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Campaign } from '../../services/campaignService';

interface PosterModalProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: any) => void;
}

export const PosterModal: React.FC<PosterModalProps> = ({
    campaign,
    onDismiss,
    onAction,
}) => {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const { content } = campaign;
    const isPosterOnly = !content.title && !content.message;

    const isTablet = width >= 768;
    const isLandscape = width > height;

    const modalWidth = isTablet
        ? Math.min(width * 0.5, 420)
        : isLandscape
            ? Math.min(width * 0.45, 360)
            : Math.min(width * 0.85, 340);

    const maxImageHeight = isLandscape ? height * 0.6 : height * 0.5;

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
            <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={styles.backdrop}
            >
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onDismiss}
                />
            </Animated.View>

            <Animated.View
                entering={FadeIn.duration(250)}
                exiting={FadeOut.duration(200)}
                style={[
                    styles.modalContainer,
                    { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }
                ]}
                pointerEvents="box-none"
            >
                <View style={[styles.contentWrapper, { width: modalWidth }]}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={onDismiss}
                        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                    >
                        <View style={styles.closeButtonBg}>
                            <Ionicons
                                name="close"
                                size={isTablet ? 24 : 20}
                                color={content.closeButtonColor || '#fff'}
                            />
                        </View>
                    </TouchableOpacity>

                    {content.imageUrl && (
                        <View style={[
                            styles.imageContainer,
                            {
                                aspectRatio: content.aspectRatio || 0.7,
                                maxHeight: maxImageHeight,
                            }
                        ]}>
                            <Image
                                source={{ uri: content.imageUrl }}
                                style={styles.image}
                                resizeMode="cover"
                            />
                        </View>
                    )}

                    {!isPosterOnly && (
                        <View style={[
                            styles.textContainer,
                            {
                                backgroundColor: content.backgroundColor || '#1a1a1a',
                                padding: isTablet ? 24 : 20,
                            }
                        ]}>
                            {content.title && (
                                <Text style={[
                                    styles.title,
                                    {
                                        color: content.textColor || '#fff',
                                        fontSize: isTablet ? 24 : 20,
                                    }
                                ]}>
                                    {content.title}
                                </Text>
                            )}
                            {content.message && (
                                <Text style={[
                                    styles.message,
                                    {
                                        color: content.textColor || '#fff',
                                        fontSize: isTablet ? 16 : 14,
                                    }
                                ]}>
                                    {content.message}
                                </Text>
                            )}
                        </View>
                    )}

                    {content.primaryAction && (
                        <TouchableOpacity
                            style={[
                                styles.actionButton,
                                {
                                    backgroundColor: content.textColor || '#fff',
                                    marginTop: isPosterOnly ? 16 : 0,
                                    paddingVertical: isTablet ? 16 : 14,
                                    minWidth: isTablet ? 220 : 180,
                                }
                            ]}
                            onPress={handleAction}
                            activeOpacity={0.8}
                        >
                            <Text style={[
                                styles.actionButtonText,
                                {
                                    color: content.backgroundColor || '#1a1a1a',
                                    fontSize: isTablet ? 17 : 15,
                                }
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
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        zIndex: 1000,
    },
    closeButtonBg: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageContainer: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#222',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    textContainer: {
        width: '100%',
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 14,
        marginTop: -2,
    },
    title: {
        fontWeight: '600',
        marginBottom: 6,
        textAlign: 'center',
    },
    message: {
        lineHeight: 22,
        textAlign: 'center',
        opacity: 0.85,
    },
    actionButton: {
        paddingHorizontal: 32,
        borderRadius: 24,
        marginTop: 16,
        alignItems: 'center',
    },
    actionButtonText: {
        fontWeight: '600',
    },
});
