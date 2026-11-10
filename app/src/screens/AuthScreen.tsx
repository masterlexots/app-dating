import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { EMAIL_RE } from '../lib/catalog';
import { Body, Button, Card, Eyebrow, Field, Note, Screen, Title } from '../components/ui';

// Inicio de sesión y registro con correo y código de un solo uso.
// Temporal mientras se activa el proveedor de SMS; antes de lanzar se
// vuelve a usar el celular (ver historial de este archivo).
export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = email.trim().toLowerCase();

  async function sendCode() {
    setError(null);
    if (!EMAIL_RE.test(clean)) return setError('Revisa tu correo electrónico.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      return setError(/rate|limit/i.test(error.message)
        ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.'
        : 'No pudimos enviar el correo. Intenta de nuevo en un momento.');
    }
    setSent(true);
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: clean, token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError('El código no coincide o ya venció. Revisa el correo o pide uno nuevo.');
    // Al verificar, App.tsx detecta la sesión y avanza solo.
  }

  const codeOk = /^\d{6,8}$/.test(code.trim());

  return (
    <Screen>
      <Card>
        <Eyebrow>Ciudad de México · 18+</Eyebrow>
        <Title big>Un match por semana, elegido con cuidado.</Title>
        <Body muted>
          Sin swipes. La IA propone, una persona del equipo revisa y tú decides. Solo pagas si los dos aceptan y ya
          hay fecha para la cita, siempre en un restaurante o café aliado.
        </Body>
      </Card>
      <Card>
        <Title>Entra con tu correo</Title>
        <Field
          label="Correo electrónico" placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none"
          autoComplete="email" value={email} onChangeText={setEmail} editable={!sent}
          hint="Te enviamos un código para entrar. Nunca se muestra en tu perfil."
        />
        {sent && (
          <Field label="Código del correo" keyboardType="number-pad" maxLength={8} value={code}
            onChangeText={setCode} autoComplete="one-time-code" textContentType="oneTimeCode"
            hint="Revisa también la carpeta de spam." />
        )}
        {error && <Note kind="bad">{error}</Note>}
        {sent
          ? <>
              <Button label="Entrar" onPress={verify} loading={busy} disabled={!codeOk} />
              <Button label="Cambiar correo" kind="ghost" onPress={() => { setSent(false); setCode(''); }} />
            </>
          : <Button label="Enviar código" onPress={sendCode} loading={busy} />}
      </Card>
    </Screen>
  );
}
