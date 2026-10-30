import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Body, Button, Card, Eyebrow, Field, Note, Screen, Title } from '../components/ui';

// Inicio de sesión y registro con número de celular (+52) y código por SMS.
export default function AuthScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = phone.replace(/\D/g, '');
  const e164 = `+52${digits}`;

  async function sendCode() {
    setError(null);
    if (digits.length !== 10) return setError('Escribe tu número de celular a 10 dígitos.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError('No pudimos enviar el SMS. Intenta de nuevo en un momento.');
    setSent(true);
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (error) setError('El código no coincide o ya venció. Revisa el SMS o pide uno nuevo.');
    // Al verificar, App.tsx detecta la sesión y avanza solo.
  }

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
        <Title>Entra con tu celular</Title>
        <Field
          label="Número de celular (+52)" placeholder="10 dígitos" keyboardType="number-pad" maxLength={10}
          value={phone} onChangeText={setPhone} editable={!sent} autoComplete="tel"
          hint="Te enviamos un código por SMS. Nunca se muestra en tu perfil."
        />
        {sent && (
          <Field label="Código de 6 dígitos" keyboardType="number-pad" maxLength={6} value={code}
            onChangeText={setCode} autoComplete="sms-otp" textContentType="oneTimeCode" />
        )}
        {error && <Note kind="bad">{error}</Note>}
        {sent
          ? <>
              <Button label="Verificar" onPress={verify} loading={busy} disabled={code.trim().length !== 6} />
              <Button label="Cambiar número" kind="ghost" onPress={() => { setSent(false); setCode(''); }} />
            </>
          : <Button label="Enviar código por SMS" onPress={sendCode} loading={busy} />}
      </Card>
    </Screen>
  );
}
