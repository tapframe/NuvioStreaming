import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import 'intl-pluralrules';
import languageDetector from './languageDetector';
import { resources } from './resources';

i18n
    .use(languageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        react: {
            useSuspense: false,
        },
    });

export default i18n;
