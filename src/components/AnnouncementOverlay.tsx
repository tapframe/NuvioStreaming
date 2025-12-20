import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    Dimensions,
    ScrollView,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface Announcement {
    icon: string;
    title: string;
    description: string;
    tag?: string;
}

interface AnnouncementOverlayProps {
    visible: boolean;
    onClose: () => void;
    onActionPress?: () => void;
    title?: string;
    announcements: Announcement[];
    actionButtonText?: string;
}

const AnnouncementOverlay: React.FC<AnnouncementOverlayProps> = ({
    visible,
    onClose,
    onActionPress,
    title = "What's New",
    announcements,
    actionButtonText = "Got it!",
}) => {
    const { currentTheme } = useTheme();
    const colors = currentTheme.colors;

    const scaleAnim = useRef(new Animated.Value(0.8)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    tension: 50,
                    friction: 7,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            scaleAnim.setValue(0.8);
            opacityAnim.setValue(0);
        }
    }, [visible]);

    const handleClose = () => {
        Animated.parallel([
            Animated.spring(scaleAnim, {
                toValue: 0.8,
                tension: 50,
                friction: 7,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            onClose();
        });
    };

    const handleAction = () => {
        if (onActionPress) {
            handleClose();
            // Delay navigation slightly to allow animation to complete
            setTimeout(() => {
                onActionPress();
            }, 300);
        } else {
            handleClose();
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            supportedOrientations={['portrait', 'landscape']}
            onRequestClose={handleClose}
        >
            <View style={styles.overlay}>

                <Animated.View
                    style={[
                        styles.container,
                        {
                            opacity: opacityAnim,
                            transform: [{ scale: scaleAnim }],
                        },
                    ]}
                >
                    <View style={styles.card}>
                        {/* Close Button */}
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleClose}
                        >
                            <Feather name="x" size={20} color={colors.white} />
                        </TouchableOpacity>

                        {/* Header */}
                        <View style={styles.header}>
                            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
                                <Feather name="zap" size={32} color={colors.primary} />
                            </View>
                            <Text style={[styles.title, { color: colors.white }]}>{title}</Text>
                            <Text style={[styles.subtitle, { color: colors.mediumEmphasis }]}>
                                Exciting updates in this release
                            </Text>
                        </View>

                        {/* Announcements */}
                        <ScrollView
                            style={styles.scrollView}
                            showsVerticalScrollIndicator={false}
                        >
                            {announcements.map((announcement, index) => (
                                <View
                                    key={index}
                                    style={styles.announcementItem}
                                >
                                    <View style={[styles.announcementIcon, { backgroundColor: colors.primary + '15' }]}>
                                        <Feather name={announcement.icon as any} size={24} color={colors.primary} />
                                    </View>
                                    <View style={styles.announcementContent}>
                                        <View style={styles.announcementHeader}>
                                            <Text style={[styles.announcementTitle, { color: colors.white }]}>
                                                {announcement.title}
                                            </Text>
                                            {announcement.tag && (
                                                <View style={[styles.tag, { backgroundColor: colors.primary }]}>
                                                    <Text style={styles.tagText}>{announcement.tag}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.announcementDescription, { color: colors.mediumEmphasis }]}>
                                            {announcement.description}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>

                        {/* Action Button */}
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.primary }]}
                            onPress={handleAction}
                        >
                            <Text style={styles.buttonText}>{actionButtonText}</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
    },
    container: {
        width: width * 0.9,
        maxWidth: 500,
        maxHeight: height * 0.8,
    },
    card: {
        backgroundColor: '#1a1a1a',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#2a2a2a',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        opacity: 0.9,
    },
    scrollView: {
        maxHeight: height * 0.45,
        marginBottom: 20,
    },
    announcementItem: {
        backgroundColor: '#252525',
        flexDirection: 'row',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
    },
    announcementIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    announcementContent: {
        flex: 1,
    },
    announcementHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    announcementTitle: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
        flex: 1,
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginLeft: 8,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#FFFFFF',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    announcementDescription: {
        fontSize: 14,
        lineHeight: 20,
        opacity: 0.9,
    },
    button: {
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});

export default AnnouncementOverlay;
