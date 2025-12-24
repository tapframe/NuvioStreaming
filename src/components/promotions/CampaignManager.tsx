import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Image, Linking, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { campaignService, Campaign, CampaignAction } from '../../services/campaignService';
import { PosterModal } from './PosterModal';
import { useNavigation } from '@react-navigation/native';
import { useAccount } from '../../contexts/AccountContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BannerProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: CampaignAction) => void;
}

const BannerCampaign: React.FC<BannerProps> = ({ campaign, onDismiss, onAction }) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { content } = campaign;
    const isTablet = width >= 768;
    const bannerMaxWidth = isTablet ? 600 : width - 24;

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
                style={[
                    styles.banner,
                    {
                        backgroundColor: content.backgroundColor || '#1a1a1a',
                        maxWidth: bannerMaxWidth,
                        alignSelf: 'center',
                        width: '100%',
                    }
                ]}
                onPress={handlePress}
                activeOpacity={0.9}
            >
                {content.imageUrl && (
                    <Image
                        source={{ uri: content.imageUrl }}
                        style={[styles.bannerImage, { width: isTablet ? 52 : 44, height: isTablet ? 52 : 44 }]}
                    />
                )}
                <View style={styles.bannerContent}>
                    {content.title && (
                        <Text style={[styles.bannerTitle, { color: content.textColor || '#fff', fontSize: isTablet ? 16 : 14 }]}>
                            {content.title}
                        </Text>
                    )}
                    {content.message && (
                        <Text style={[styles.bannerMessage, { color: content.textColor || '#fff', fontSize: isTablet ? 14 : 12 }]} numberOfLines={2}>
                            {content.message}
                        </Text>
                    )}
                </View>
                {content.primaryAction?.label && (
                    <View style={[styles.bannerCta, { backgroundColor: content.textColor || '#fff', paddingHorizontal: isTablet ? 16 : 12 }]}>
                        <Text style={[styles.bannerCtaText, { color: content.backgroundColor || '#1a1a1a', fontSize: isTablet ? 14 : 12 }]}>
                            {content.primaryAction.label}
                        </Text>
                    </View>
                )}
                <TouchableOpacity style={styles.bannerClose} onPress={onDismiss}>
                    <Ionicons name="close" size={isTablet ? 22 : 18} color={content.closeButtonColor || '#fff'} />
                </TouchableOpacity>
            </TouchableOpacity>
        </Animated.View>
    );
};

interface BottomSheetProps {
    campaign: Campaign;
    onDismiss: () => void;
    onAction: (action: CampaignAction) => void;
}

const BottomSheetCampaign: React.FC<BottomSheetProps> = ({ campaign, onDismiss, onAction }) => {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const { content } = campaign;
    const isTablet = width >= 768;
    const isLandscape = width > height;

    const sheetMaxWidth = isTablet ? 500 : width;
    const imageMaxHeight = isLandscape ? height * 0.35 : height * 0.3;

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
                style={[
                    styles.bottomSheet,
                    {
                        paddingBottom: insets.bottom + 24,
                        ...(isTablet && {
                            left: (width - sheetMaxWidth) / 2,
                            right: (width - sheetMaxWidth) / 2,
                            borderRadius: 20,
                            marginBottom: 20,
                        }),
                    }
                ]}
            >
                <View style={styles.bottomSheetHandle} />

                <TouchableOpacity style={styles.bottomSheetClose} onPress={onDismiss}>
                    <Ionicons name="close" size={isTablet ? 26 : 22} color={content.closeButtonColor || '#fff'} />
                </TouchableOpacity>

                {content.imageUrl && (
                    <Image
                        source={{ uri: content.imageUrl }}
                        style={[
                            styles.bottomSheetImage,
                            {
                                aspectRatio: content.aspectRatio || 1.5,
                                maxHeight: imageMaxHeight,
                            }
                        ]}
                        resizeMode="cover"
                    />
                )}

                <View style={styles.bottomSheetContent}>
                    {content.title && (
                        <Text style={[styles.bottomSheetTitle, { color: content.textColor || '#fff', fontSize: isTablet ? 24 : 20 }]}>
                            {content.title}
                        </Text>
                    )}
                    {content.message && (
                        <Text style={[styles.bottomSheetMessage, { color: content.textColor || '#fff', fontSize: isTablet ? 16 : 14 }]}>
                            {content.message}
                        </Text>
                    )}
                </View>

                {content.primaryAction && (
                    <TouchableOpacity
                        style={[styles.bottomSheetButton, { backgroundColor: content.textColor || '#fff', paddingVertical: isTablet ? 16 : 14 }]}
                        onPress={handlePrimaryAction}
                        activeOpacity={0.8}
                    >
                        <Text style={[styles.bottomSheetButtonText, { color: content.backgroundColor || '#1a1a1a', fontSize: isTablet ? 17 : 15 }]}>
                            {content.primaryAction.label}
                        </Text>
                    </TouchableOpacity>
                )}
            </Animated.View>
        </View>
    );
};

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
        }, 350);
    }, []);

    const handleAction = useCallback((action: CampaignAction) => {
        console.log('[CampaignManager] Action:', action);

        if (action.type === 'navigate' && action.value) {
            handleDismiss();
            setTimeout(() => {
                try {
                    (navigation as any).navigate(action.value);
                } catch (error) {
                    console.warn('[CampaignManager] Navigation failed:', error);
                }
            }, 400);
        } else if (action.type === 'link' && action.value) {
            Linking.openURL(action.value);
        }
    }, [navigation, handleDismiss]);

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
        padding: 14,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
    },
    bannerImage: {
        borderRadius: 10,
        marginRight: 12,
    },
    bannerContent: {
        flex: 1,
    },
    bannerTitle: {
        fontWeight: '600',
        marginBottom: 2,
    },
    bannerMessage: {
        opacity: 0.8,
    },
    bannerCta: {
        paddingVertical: 8,
        borderRadius: 16,
        marginLeft: 10,
    },
    bannerCtaText: {
        fontWeight: '600',
    },
    bannerClose: {
        padding: 6,
        marginLeft: 8,
    },
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
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 14,
    },
    bottomSheetHandle: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 18,
    },
    bottomSheetClose: {
        position: 'absolute',
        top: 18,
        right: 18,
        zIndex: 10,
        padding: 4,
    },
    bottomSheetImage: {
        width: '100%',
        borderRadius: 12,
        marginBottom: 18,
    },
    bottomSheetContent: {
        marginBottom: 22,
    },
    bottomSheetTitle: {
        fontWeight: '600',
        marginBottom: 10,
        textAlign: 'center',
    },
    bottomSheetMessage: {
        opacity: 0.8,
        textAlign: 'center',
        lineHeight: 22,
    },
    bottomSheetButton: {
        borderRadius: 26,
        alignItems: 'center',
    },
    bottomSheetButtonText: {
        fontWeight: '600',
    },
});
