import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Keyboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { mmkvStorage } from '../../services/mmkvStorage';
import { RECENT_SEARCHES_KEY, isTablet } from './searchUtils';

interface RecentSearchesProps {
    recentSearches: string[];
    onSearchPress: (query: string) => void;
    onSearchesChange: (searches: string[]) => void;
    visible: boolean;
}

/**
 * Recent search history list component
 */
export const RecentSearches: React.FC<RecentSearchesProps> = ({
    recentSearches,
    onSearchPress,
    onSearchesChange,
    visible,
}) => {
    const { currentTheme } = useTheme();

    if (!visible || recentSearches.length === 0) return null;

    const handleDelete = (index: number) => {
        const newRecentSearches = [...recentSearches];
        newRecentSearches.splice(index, 1);
        onSearchesChange(newRecentSearches);
        mmkvStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(newRecentSearches));
    };

    const handlePress = (search: string) => {
        onSearchPress(search);
        Keyboard.dismiss();
    };

    return (
        <View style={styles.container}>
            <Text style={[styles.title, { color: currentTheme.colors.white }]}>
                Recent Searches
            </Text>
            {recentSearches.map((search, index) => (
                <TouchableOpacity
                    key={index}
                    style={styles.searchItem}
                    onPress={() => handlePress(search)}
                >
                    <MaterialIcons
                        name="history"
                        size={20}
                        color={currentTheme.colors.lightGray}
                        style={styles.icon}
                    />
                    <Text style={[styles.searchText, { color: currentTheme.colors.white }]}>
                        {search}
                    </Text>
                    <TouchableOpacity
                        onPress={() => handleDelete(index)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.deleteButton}
                    >
                        <MaterialIcons name="close" size={16} color={currentTheme.colors.lightGray} />
                    </TouchableOpacity>
                </TouchableOpacity>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 16,
        paddingBottom: isTablet ? 24 : 16,
        paddingTop: isTablet ? 12 : 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        marginBottom: isTablet ? 16 : 8,
    },
    title: {
        fontSize: isTablet ? 18 : 16,
        fontWeight: '700',
        marginBottom: 12,
    },
    searchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: isTablet ? 12 : 10,
        paddingHorizontal: 16,
        marginVertical: 1,
    },
    icon: {
        marginRight: 12,
    },
    searchText: {
        fontSize: 16,
        flex: 1,
    },
    deleteButton: {
        padding: 4,
    },
});

export default RecentSearches;
