import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import MatchScreen from './src/screens/MatchScreen';
import { Body, Card, Screen } from './src/components/ui';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [openMatch, setOpenMatch] = useState<string | null>(null);

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
  if (session === undefined || (session && hasProfile === null)) {
    screen = <Screen><Card><Body muted>Cargando…</Body></Card></Screen>;
  } else if (!session) {
    screen = <AuthScreen />;
  } else if (!hasProfile && !onboardingDone) {
    screen = <OnboardingScreen userId={session.user.id} phone={session.user.phone ?? ''} onDone={() => setOnboardingDone(true)} />;
  } else if (openMatch) {
    screen = <MatchScreen matchId={openMatch} userId={session.user.id} onBack={() => setOpenMatch(null)} />;
  } else {
    screen = <HomeScreen onOpenMatch={setOpenMatch} />;
  }

  return <>{screen}<StatusBar style="auto" /></>;
}
