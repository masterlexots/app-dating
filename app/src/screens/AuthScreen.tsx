import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { EMAIL_RE } from '../lib/catalog';
import { Body, Button, Card, Chips, Eyebrow, Field, Note, Screen, T, Title } from '../components/ui';
import PrivacyScreen from './PrivacyScreen';

// Inicio de sesión TEMPORAL con correo y contraseña, solo para desarrollo.
// Requiere desactivar "Confirm email" en Supabase. Antes de lanzar se vuelve
// a usar el celular con código por SMS (ver historial de este archivo).
export default function AuthScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const clean = email.trim().toLowerCase();
  const ok = EMAIL_RE.test(clean) && password.length >= 8;

  async function submit() {
    setError(null);
    setBusy(true);
    const { data, error } = mode === 'crear'
      ? await supabase.auth.signUp({ email: clean, password })
      : await supabase.auth.signInWithPassword({ email: clean, password });
    setBusy(false);
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('invalid login')) return setError('El correo o la contraseña no coinciden.');
      if (m.includes('already registered')) return setError('Ese correo ya tiene cuenta. Usa "Ya tengo cuenta".');
      if (m.includes('not confirmed')) return setError('Falta desactivar "Confirm email" en Supabase.');
      return setError(error.message);
    }
    if (mode === 'crear' && !data.session) {
      setError('La cuenta se creó, pero Supabase pide confirmar el correo. Desactiva "Confirm email" en Supabase.');
    }
    // Con sesión, App.tsx avanza solo.
  }

  if (showPrivacy) return <PrivacyScreen onBack={() => setShowPrivacy(false)} />;

  return (
    <Screen>
      <View style={st.hero}>
        <Image source={require('../../assets/inicio.jpg')} style={{ width: '100%', height: '100%' }} resizeMode="cover"
          accessibilityLabel="Hombre en su sala mirando su celular con una sonrisa" />
      </View>
      <View style={{ gap: 10, paddingHorizontal: 4 }}>
        <Eyebrow>Ciudad de México · 18+</Eyebrow>
        <Title big>Un match por semana, elegido con cuidado.</Title>
        <Body muted>
          Sin swipes. La IA propone, una persona del equipo revisa y tú decides. Solo pagas si los dos aceptan y ya
          hay fecha para la cita, siempre en un restaurante o café aliado.
        </Body>
      </View>
      <Card>
        <Chips options={['Ya tengo cuenta', 'Crear cuenta']} selected={[mode === 'entrar' ? 'Ya tengo cuenta' : 'Crear cuenta']}
          onToggle={v => { setMode(v === 'Crear cuenta' ? 'crear' : 'entrar'); setError(null); }} />
        <Field label="Correo electrónico" placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" value={email} onChangeText={setEmail} />
        <Field label="Contraseña" secureTextEntry value={password} onChangeText={setPassword}
          autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
          hint={mode === 'crear' ? 'Mínimo 8 caracteres.' : undefined} />
        {error && <Note kind="bad">{error}</Note>}
        <Button label={mode === 'crear' ? 'Crear cuenta' : 'Entrar'} onPress={submit} loading={busy} disabled={!ok} />
        <Body muted small>Versión de prueba. En la versión final se entra con tu celular.</Body>
      </Card>
      <Button label="Aviso de privacidad" kind="ghost" onPress={() => setShowPrivacy(true)} />
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { width: '100%', aspectRatio: 4 / 3, borderRadius: 28, overflow: 'hidden' },
});
