import { getLocales } from 'expo-localization';
import { LanguageDetectorModule } from 'i18next';
import { mmkvStorage } from '../services/mmkvStorage';

const languageDetector = {
    type: 'languageDetector',
    async: true,
    detect: (callback?: (lng: string) => void): string | undefined => {
        const findLanguage = async () => {
            try {
                const savedLanguage = await mmkvStorage.getItem('user_language');
                if (savedLanguage) {
                    if (callback) callback(savedLanguage);
                    return;
                }
            } catch (error) {
                console.log('Error reading language from storage', error);
            }

            const locales = getLocales();
            const languageCode = locales[0]?.languageCode ?? 'en';
            if (callback) callback(languageCode);
        };
        findLanguage();
        return undefined;
    },
    init: () => { },
    cacheUserLanguage: (language: string) => {
        mmkvStorage.setItem('user_language', language);
    },
};

export default languageDetector;
