import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image, Linking, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { campaignService, Campaign, CampaignAction } from '../../services/campaignService';
import { PosterModal } from './PosterModal';
import { useNavigation } from '@react-navigation/native';
import { useAccount } from '../../contexts/AccountContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Banner Component ---
interface BannerProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: CampaignAction) => void;
}

const BannerCampaign: React.FC<BannerProps> = ({ campaign, onDismiss, onAction }) => {
    const insets = useSafeAreaInsets();
    const { content } = campaign;

    const handlePress = () => {
        if (content.primaryAction) {
            onAction(content.primaryAction);
            if (content.primaryAction.type === 'dismiss') {
                onDismiss();
            } else if (content.primaryAction.type === 'link' && content.primaryAction.value) {
                Linking.openURL(content.primaryAction.value);
                onDismiss();
            }
        }
    };

    return (
        <Animated.View
            entering={SlideInUp.duration(300)}
            exiting={SlideOutUp.duration(250)}
            style={[styles.bannerContainer, { paddingTop: insets.top + 8 }]}
        >
            <TouchableOpacity
                style={[styles.banner, { backgroundColor: content.backgroundColor || '#1a1a1a' }]}
                onPress={handlePress}
                activeOpacity={0.9}
            >
                {content.imageUrl && (
                    <Image source={{ uri: content.imageUrl }} style={styles.bannerImage} />
                )}
                <View style={styles.bannerContent}>
                    {content.title && (
                        <Text style={[styles.bannerTitle, { color: content.textColor || '#fff' }]}>
                            {content.title}
                        </Text>
                    )}
                    {content.message && (
                        <Text style={[styles.bannerMessage, { color: content.textColor || '#fff' }]} numberOfLines={2}>
                            {content.message}
                        </Text>
                    )}
                </View>
                {content.primaryAction?.label && (
                    <View style={[styles.bannerCta, { backgroundColor: content.textColor || '#fff' }]}>
                        <Text style={[styles.bannerCtaText, { color: content.backgroundColor || '#1a1a1a' }]}>
                            {content.primaryAction.label}
                        </Text>
                    </View>
                )}
                <TouchableOpacity style={styles.bannerClose} onPress={onDismiss}>
                    <Ionicons name="close" size={18} color={content.closeButtonColor || '#fff'} />
                </TouchableOpacity>
            </TouchableOpacity>
        </Animated.View>
    );
};

// --- Bottom Sheet Component ---
interface BottomSheetProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: CampaignAction) => void;
}

const BottomSheetCampaign: React.FC<BottomSheetProps> = ({ campaign, onDismiss, onAction }) => {
    const insets = useSafeAreaInsets();
    const { content } = campaign;

    const handlePrimaryAction = () => {
        if (content.primaryAction) {
            onAction(content.primaryAction);
            if (content.primaryAction.type === 'dismiss') {
                onDismiss();
            } else if (content.primaryAction.type === 'link' && content.primaryAction.value) {
                Linking.openURL(content.primaryAction.value);
                onDismiss();
            }
        }
    };

    return (
        <View style={StyleSheet.absoluteFill}>
            <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={StyleSheet.absoluteFill}
            >
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                </TouchableOpacity>
            </Animated.View>

            <Animated.View
                entering={SlideInDown.duration(300)}
                exiting={SlideOutDown.duration(250)}
                style={[styles.bottomSheet, { paddingBottom: insets.bottom + 24 }]}
            >
                <View style={styles.bottomSheetHandle} />

                <TouchableOpacity style={styles.bottomSheetClose} onPress={onDismiss}>
                    <Ionicons name="close" size={22} color={content.closeButtonColor || '#fff'} />
                </TouchableOpacity>

                {content.imageUrl && (
                    <Image
                        source={{ uri: content.imageUrl }}
                        style={[styles.bottomSheetImage, { aspectRatio: content.aspectRatio || 1.5 }]}
                        resizeMode="cover"
                    />
                )}

                <View style={styles.bottomSheetContent}>
                    {content.title && (
                        <Text style={[styles.bottomSheetTitle, { color: content.textColor || '#fff' }]}>
                            {content.title}
                        </Text>
                    )}
                    {content.message && (
                        <Text style={[styles.bottomSheetMessage, { color: content.textColor || '#fff' }]}>
                            {content.message}
                        </Text>
                    )}
                </View>

                {content.primaryAction && (
                    <TouchableOpacity
                        style={[styles.bottomSheetButton, { backgroundColor: content.textColor || '#fff' }]}
                        onPress={handlePrimaryAction}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.bottomSheetButtonText, { color: content.backgroundColor || '#1a1a1a' }]}>
                            {content.primaryAction.label}
                        </Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        </View>
    );
};

// --- Campaign Manager ---
export const CampaignManager: React.FC = () => {
    const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const navigation = useNavigation();
    const { user } = useAccount();

    const checkForCampaigns = useCallback(async () => {
        try {
            console.log('[CampaignManager] Checking for campaigns...');
            await new Promise(resolve => setTimeout(resolve, 1500));

            const campaign = await campaignService.getActiveCampaign();
            console.log('[CampaignManager] Got campaign:', campaign?.id, campaign?.type);

            if (campaign) {
                setActiveCampaign(campaign);
                setIsVisible(true);
                campaignService.recordImpression(campaign.id, campaign.rules.showOncePerUser);
            }
        } catch (error) {
            console.warn('[CampaignManager] Failed to check campaigns', error);
        }
    }, []);

    useEffect(() => {
        checkForCampaigns();
    }, [checkForCampaigns]);

    const handleDismiss = useCallback(() => {
        setIsVisible(false);

        // After animation completes, check for next campaign
        setTimeout(() => {
            const nextCampaign = campaignService.getNextCampaign();
            console.log('[CampaignManager] Next campaign:', nextCampaign?.id, nextCampaign?.type);

            if (nextCampaign) {
                setActiveCampaign(nextCampaign);
                setIsVisible(true);
                campaignService.recordImpression(nextCampaign.id, nextCampaign.rules.showOncePerUser);
            } else {
                setActiveCampaign(null);
            }
        }, 350); // Wait for exit animation
    }, []);

    const handleAction = (action: CampaignAction) => {
        console.log('[CampaignManager] Action:', action);
    };

    if (!activeCampaign || !isVisible) return null;

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {activeCampaign.type === 'poster_modal' && (
                <PosterModal
                    campaign={activeCampaign}
                    onDismiss={handleDismiss}
                    onAction={handleAction}
                />
            )}
            {activeCampaign.type === 'banner' && (
                <BannerCampaign
                    campaign={activeCampaign}
                    onDismiss={handleDismiss}
                    onAction={handleAction}
                />
            )}
            {activeCampaign.type === 'bottom_sheet' && (
                <BottomSheetCampaign
                    campaign={activeCampaign}
                    onDismiss={handleDismiss}
                    onAction={handleAction}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    // Banner styles
    bannerContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        paddingHorizontal: 12,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 6,
    },
    bannerImage: {
        width: 44,
        height: 44,
        borderRadius: 8,
        marginRight: 12,
    },
    bannerContent: {
        flex: 1,
    },
    bannerTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
    },
    bannerMessage: {
        fontSize: 12,
        opacity: 0.8,
    },
    bannerCta: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        marginLeft: 8,
    },
    bannerCtaText: {
        fontSize: 12,
        fontWeight: '600',
    },
    bannerClose: {
        padding: 4,
        marginLeft: 8,
    },

    // Bottom sheet styles
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    bottomSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    bottomSheetHandle: {
        width: 36,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    bottomSheetClose: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 10,
        padding: 4,
    },
    bottomSheetImage: {
        width: '100%',
        borderRadius: 10,
        marginBottom: 16,
    },
    bottomSheetContent: {
        marginBottom: 20,
    },
    bottomSheetTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
    },
    bottomSheetMessage: {
        fontSize: 14,
        opacity: 0.8,
        textAlign: 'center',
        lineHeight: 20,
    },
    bottomSheetButton: {
        paddingVertical: 14,
        borderRadius: 24,
        alignItems: 'center',
    },
    bottomSheetButtonText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
