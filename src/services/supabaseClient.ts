import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';


const SUPABASE_URL = 'https://utypxyhwcekefvhyguxp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0eXB4eWh3Y2VrZWZ2aHlndXhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2NjE4NTksImV4cCI6MjA3MDIzNzg1OX0.kc76fjHLjq6a5tNLsQh6KxS4uGp0ngl_ipQBte6KZuA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storage: AsyncStorage as unknown as Storage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export default supabase;

