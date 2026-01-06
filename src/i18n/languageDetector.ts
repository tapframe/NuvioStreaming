import { getLocales } from 'expo-localization';
import { LanguageDetectorAsyncModule } from 'i18next';
import { mmkvStorage } from '../services/mmkvStorage';

const languageDetector: LanguageDetectorAsyncModule = {
    type: 'languageDetector',
    async: true,
    detect: (callback: (lng: string | undefined) => void): void => {
        const findLanguage = async () => {
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
        };
        findLanguage();
    },
    init: () => { },
    cacheUserLanguage: (language: string) => {
        mmkvStorage.setItem('user_language', language);
    },
};

export default languageDetector;
