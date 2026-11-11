import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import MatchScreen from './src/screens/MatchScreen';
import PreferencesScreen from './src/screens/PreferencesScreen';
import PrivacyScreen from './src/screens/PrivacyScreen';
import { Body, Card, Screen } from './src/components/ui';

export default function App() {
  // Fuentes copiadas a assets/fonts (no desde node_modules: Netlify no publica esas carpetas).
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular: require('./assets/fonts/DMSans_400Regular.ttf'),
    DMSans_500Medium: require('./assets/fonts/DMSans_500Medium.ttf'),
    DMSans_600SemiBold: require('./assets/fonts/DMSans_600SemiBold.ttf'),
    DMSans_700Bold: require('./assets/fonts/DMSans_700Bold.ttf'),
    DMSerifDisplay_400Regular: require('./assets/fonts/DMSerifDisplay_400Regular.ttf'),
  });
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ¿Ya existe perfil con fotos? Si no, el usuario sigue en registro.
  useEffect(() => {
    if (!session) { setHasProfile(null); return; }
    (async () => {
      const { count } = await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('profile_id', session.user.id);
      setHasProfile((count ?? 0) >= 5);
    })();
  }, [session]);

  let screen: React.ReactNode;
  // Si las fuentes fallan, la app se muestra con la letra del sistema en lugar de quedarse en blanco.
  if (!fontsLoaded && !fontError) return null;
  if (session === undefined || (session && hasProfile === null)) {
    screen = <Screen><Card><Body muted>Cargando…</Body></Card></Screen>;
  } else if (!session) {
    screen = <AuthScreen />;
  } else if (!hasProfile && !onboardingDone) {
    screen = <OnboardingScreen userId={session.user.id} email={session.user.email ?? ''} onDone={() => setOnboardingDone(true)} />;
  } else if (showPrivacy) {
    screen = <PrivacyScreen onBack={() => setShowPrivacy(false)} />;
  } else if (showPrefs) {
    screen = <PreferencesScreen userId={session.user.id} email={session.user.email ?? ''} onBack={() => setShowPrefs(false)} />;
  } else if (openMatch) {
    screen = <MatchScreen matchId={openMatch} userId={session.user.id} onBack={() => setOpenMatch(null)} />;
  } else {
    screen = <HomeScreen userId={session.user.id} onOpenMatch={setOpenMatch} onOpenPrefs={() => setShowPrefs(true)} onOpenPrivacy={() => setShowPrivacy(true)} />;
  }

  return <>{screen}<StatusBar style="auto" /></>;
}
