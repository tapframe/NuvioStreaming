import { getLocales } from 'expo-localization';
import { LanguageDetectorModule } from 'i18next';
import { mmkvStorage } from '../services/mmkvStorage';

const languageDetector = {
    type: 'languageDetector',
    async: true,
    detect: async (callback: any) => {
        try {
            const savedLanguage = await mmkvStorage.getItem('user_language');
            if (savedLanguage) {
                callback(savedLanguage);
                return;
            }
        } catch (error) {
            console.log('Error reading language from storage', error);
        }

        const locales = getLocales();
        const languageCode = locales[0]?.languageCode ?? 'en';
        callback(languageCode);
    },
    init: () => { },
    cacheUserLanguage: (language: string) => {
        mmkvStorage.setItem('user_language', language);
    },
};

export default languageDetector;
