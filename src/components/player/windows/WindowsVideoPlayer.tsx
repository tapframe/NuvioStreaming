/**
 * Windows Video Player - Placeholder Component
 * 
 * This is a placeholder component for the Windows platform.
 * Video player functionality will be implemented in a future update.
 * 
 * Options for future implementation:
 * 1. Windows MediaFoundation integration
 * 2. WebView2 with HTML5 video
 * 3. VLC/MPV native integration
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface WindowsVideoPlayerProps {
    route: {
        params: {
            uri: string;
            title?: string;
            episodeTitle?: string;
            season?: number;
            episode?: number;
            quality?: string;
            year?: number;
            streamProvider?: string;
            streamName?: string;
            type?: 'movie' | 'tv';
            tmdbId?: number;
            headers?: Record<string, string>;
        };
    };
}

const WindowsVideoPlayer: React.FC<WindowsVideoPlayerProps> = ({ route }) => {
    const navigation = useNavigation();
    const { uri, title, episodeTitle, season, episode, quality, streamProvider } = route.params;

    const handleGoBack = () => {
        navigation.goBack();
    };

    const handleOpenExternal = () => {
        // Future: Open in system default player or browser
        console.log('Opening in external player:', uri);
    };

    const displayTitle = episodeTitle
        ? `${title} - S${season}E${episode}: ${episodeTitle}`
        : title || 'Video';

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <MaterialCommunityIcons
                    name="video-off-outline"
                    size={80}
                    color="#666"
                />

                <Text style={styles.title}>Windows Video Player</Text>
                <Text style={styles.subtitle}>Coming Soon</Text>

                <View style={styles.infoBox}>
                    <Text style={styles.infoTitle}>{displayTitle}</Text>
                    {quality && <Text style={styles.infoText}>Quality: {quality}</Text>}
                    {streamProvider && <Text style={styles.infoText}>Provider: {streamProvider}</Text>}
                </View>

                <Text style={styles.description}>
                    Video playback on Windows is not yet supported.{'\n'}
                    This feature will be available in a future update.
                </Text>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity style={styles.button} onPress={handleGoBack}>
                        <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Go Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.button, styles.secondaryButton]}
                        onPress={handleOpenExternal}
                    >
                        <MaterialCommunityIcons name="open-in-new" size={20} color="#fff" />
                        <Text style={styles.buttonText}>Open External</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.streamInfo}>
                    <Text style={styles.streamLabel}>Stream URL:</Text>
                    <Text style={styles.streamUrl} numberOfLines={2}>
                        {uri}
                    </Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        alignItems: 'center',
        padding: 40,
        maxWidth: 600,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 20,
    },
    subtitle: {
        fontSize: 18,
        color: '#888',
        marginTop: 8,
    },
    infoBox: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 20,
        marginTop: 30,
        width: '100%',
        alignItems: 'center',
    },
    infoTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        textAlign: 'center',
    },
    infoText: {
        fontSize: 14,
        color: '#888',
        marginTop: 4,
    },
    description: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginTop: 24,
        lineHeight: 22,
    },
    buttonContainer: {
        flexDirection: 'row',
        marginTop: 30,
        gap: 16,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6366f1',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
    },
    secondaryButton: {
        backgroundColor: '#333',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    streamInfo: {
        marginTop: 40,
        padding: 16,
        backgroundColor: '#111',
        borderRadius: 8,
        width: '100%',
    },
    streamLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    streamUrl: {
        fontSize: 12,
        color: '#444',
        fontFamily: 'monospace',
    },
});

export default WindowsVideoPlayer;
