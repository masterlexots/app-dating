import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { rpc, supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { INTENTS, Intent } from '../lib/catalog';
import { Body, Button, Card, Eyebrow, Note, Screen, Title } from '../components/ui';

type CycleStatus = {
  status: 'onboarding' | 'active' | 'paused' | 'suspended';
  intent: Intent;
  suspended_until: string | null;
  open_match: string | null;
  pending_feedback: string | null;
  no_shows_this_year: number;
  casual_attempts_today: number | null;
  eligible: boolean;
};

export default function HomeScreen({ onOpenMatch }: { onOpenMatch: (id: string) => void }) {
  const t = useTheme();
  const [s, setS] = useState<CycleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[kind: 'ok' | 'warn' | 'bad', text: string] | null>(null);

  const load = useCallback(async () => {
    try { setS(await rpc<CycleStatus>('my_cycle_status')); }
    catch (e: any) { setMsg(['bad', e.message]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function togglePause() {
    if (!s) return;
    setBusy(true);
    try { await rpc('set_paused', { p_paused: s.status !== 'paused' }); await load(); }
    catch (e: any) { setMsg(['bad', e.message]); }
    finally { setBusy(false); }
  }

  async function requestCasual() {
    setBusy(true); setMsg(null);
    try {
      const id = await rpc<string | null>('request_casual_match');
      if (id) onOpenMatch(id);
      else setMsg(['warn', 'Ahora no hay alguien disponible que coincida contigo. Intenta más tarde.']);
    } catch (e: any) { setMsg(['bad', e.message]); }
    finally { setBusy(false); await load(); }
  }

  if (!s) return <Screen><Card><Body muted>Cargando…</Body></Card></Screen>;

  const attemptsLeft = 3 - (s.casual_attempts_today ?? 0);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: '700' }}>Una por Semana</Text>
        {(s.status === 'active' || s.status === 'paused') && (
          <Pressable onPress={togglePause} disabled={busy} accessibilityRole="switch" accessibilityState={{ checked: s.status === 'paused' }}
            style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5,
              borderColor: s.status === 'paused' ? 'transparent' : t.line, backgroundColor: s.status === 'paused' ? t.warnSoft : 'transparent' }}>
            <Text style={{ color: s.status === 'paused' ? t.warn : t.ink, fontWeight: '600', fontSize: 13 }}>
              {s.status === 'paused' ? 'En pausa' : s.intent === 'casual' ? 'Pausar' : 'Pausar ciclo'}
            </Text>
          </Pressable>
        )}
      </View>

      <Card>
        {s.status === 'onboarding' && <>
          <Eyebrow>Verificación</Eyebrow><Title>Tu cuenta está en revisión</Title>
          <Body muted>Te avisamos en cuanto se confirme tu identidad. Después recibirás tu primer match.</Body>
        </>}

        {s.status === 'suspended' && <>
          <Eyebrow>Cuenta suspendida</Eyebrow><Title>Tu cuenta está suspendida</Title>
          <Body muted>
            Se registraron más de 2 inasistencias este año. Podrás volver a usar la app el{' '}
            {s.suspended_until ? new Date(s.suspended_until).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.
          </Body>
        </>}

        {s.status === 'paused' && <>
          <Eyebrow>En pausa</Eyebrow><Title>No recibirás matches</Title>
          <Body muted>Tu perfil queda oculto hasta que reactives tu ciclo.</Body>
          <Button label="Reactivar" onPress={togglePause} loading={busy} />
        </>}

        {s.status === 'active' && s.pending_feedback && <>
          <Eyebrow>Feedback pendiente</Eyebrow><Title>¿Cómo te fue en tu cita?</Title>
          <Body muted>Cuéntanos para poder enviarte tu siguiente match.</Body>
          <Button label="Dar feedback" onPress={() => onOpenMatch(s.pending_feedback!)} />
        </>}

        {s.status === 'active' && !s.pending_feedback && s.open_match && <>
          <Eyebrow>Tienes un match en curso</Eyebrow><Title>Revisa tu match</Title>
          <Button label="Abrir" onPress={() => onOpenMatch(s.open_match!)} />
        </>}

        {s.status === 'active' && !s.pending_feedback && !s.open_match && s.intent !== 'casual' && <>
          <Eyebrow>Ciclo semanal</Eyebrow><Title>Tu próximo match llega el lunes</Title>
          <Body muted>La IA busca candidatos y una persona del equipo revisa que el par tenga sentido antes de enviártelo.</Body>
        </>}

        {s.status === 'active' && !s.pending_feedback && !s.open_match && s.intent === 'casual' && <>
          <Eyebrow>Noche casual</Eyebrow><Title>{attemptsLeft > 0 ? `Te quedan ${attemptsLeft} intentos hoy` : 'Ya usaste tus 3 intentos de hoy'}</Title>
          <Body muted>Cada intento te presenta a una persona para verse hoy o mañana en un café o restaurante aliado.</Body>
          <Button label="Buscar match" onPress={requestCasual} loading={busy} disabled={attemptsLeft <= 0} />
        </>}

        {msg && <Note kind={msg[0]}>{msg[1]}</Note>}

        <View style={{ gap: 4 }}>
          <Body muted small>Buscas: {INTENTS[s.intent]?.[0]}</Body>
          <Body muted small>Inasistencias {new Date().getFullYear()}: {s.no_shows_this_year} de 2 permitidas</Body>
        </View>
      </Card>

      <Button label="Actualizar" kind="ghost" onPress={load} />
      <Button label="Cerrar sesión" kind="ghost" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
