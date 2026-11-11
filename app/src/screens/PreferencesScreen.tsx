import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { INTENTS, Intent, MATCH_TYPES, MatchType } from '../lib/catalog';
import { Body, Button, Card, Eyebrow, Field, Note, Screen, T, Title } from '../components/ui';
import OnboardingScreen, { EditSection } from './OnboardingScreen';

type Summary = {
  first_name: string; alcaldia: string | null; intent: Intent; match_type: MatchType;
  career_level: string | null; job_title: string | null;
  age_older_max: number | null; age_younger_max: number | null;
  interests: number; photos: number;
};

// Mis preferencias: todo lo que se eligió en el registro se puede cambiar aquí,
// o empezar de cero sin borrar la cuenta. Los cambios aplican desde el siguiente match.
export default function PreferencesScreen({ userId, email, onBack }: { userId: string; email: string; onBack: () => void }) {
  const t = useTheme();
  const [sum, setSum] = useState<Summary | null>(null);
  const [editing, setEditing] = useState<EditSection | 'restart' | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [olderMax, setOlderMax] = useState('');
  const [youngerMax, setYoungerMax] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[kind: 'ok' | 'bad', text: string] | null>(null);

  const load = useCallback(async () => {
    const [{ data: p }, { count: ni }, { count: np }] = await Promise.all([
      supabase.from('profiles').select('first_name, alcaldia, intent, match_type, career_level, job_title, age_older_max, age_younger_max')
        .eq('id', userId).single(),
      supabase.from('interests').select('interest', { count: 'exact', head: true }).eq('profile_id', userId),
      supabase.from('photos').select('id', { count: 'exact', head: true }).eq('profile_id', userId),
    ]);
    if (p) {
      setSum({ ...p, interests: ni ?? 0, photos: np ?? 0 } as Summary);
      setOlderMax(p.age_older_max == null ? '' : String(p.age_older_max));
      setYoungerMax(p.age_younger_max == null ? '' : String(p.age_younger_max));
    }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // Vacío = sin límite; si no, un número de 0 a 60.
  const valid = (v: string) => v.trim() === '' || (/^\d{1,2}$/.test(v.trim()) && +v <= 60);
  const toDb = (v: string) => (v.trim() === '' ? null : +v);

  async function saveAges() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('profiles')
      .update({ age_older_max: toDb(olderMax), age_younger_max: toDb(youngerMax) }).eq('id', userId);
    setBusy(false);
    setMsg(error ? ['bad', 'No se pudo guardar. Intenta de nuevo.'] : ['ok', 'Guardado. Aplica a partir de tu siguiente match.']);
  }

  const finishEdit = (text: string) => { setEditing(null); setConfirmRestart(false); setMsg(['ok', text]); load(); };

  if (editing) {
    return (
      <OnboardingScreen
        userId={userId} email={email}
        mode={editing === 'restart' ? 'restart' : 'edit'}
        section={editing === 'restart' ? undefined : editing}
        onCancel={() => setEditing(null)}
        onDone={() => finishEdit(editing === 'restart'
          ? 'Listo, tu perfil empezó de cero. Tu siguiente match se basará en tus nuevas respuestas.'
          : 'Guardado. Aplica a partir de tu siguiente match.')}
      />
    );
  }

  const Item = ({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st.item, { backgroundColor: t.soft, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="semibold" size={16}>{title}</T>
        <T size={13} color={t.muted}>{detail}</T>
      </View>
      <T weight="semibold" size={14} color={t.accent}>Editar</T>
    </Pressable>
  );

  return (
    <Screen>
      <Button label="← Volver" kind="ghost" onPress={onBack} />
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <Eyebrow>Mis preferencias</Eyebrow>
        <Title>Tu perfil</Title>
        <Body muted>Cambia lo que quieras. Los cambios aplican a partir de tu siguiente match, no al que ya esté en curso.</Body>
      </View>
      {msg && <Note kind={msg[0]}>{msg[1]}</Note>}

      {!sum ? <Card><Body muted>Cargando…</Body></Card> : <>
        <Card>
          <Item title="Datos básicos" detail={[sum.first_name, sum.alcaldia].filter(Boolean).join(' · ')} onPress={() => setEditing('datos')} />
          <Item title="Qué buscas" detail={`${INTENTS[sum.intent]?.[0]} · ${MATCH_TYPES[sum.match_type]?.[0]}`} onPress={() => setEditing('busqueda')} />
          <Item title="Intereses, personalidad, trabajo e ingreso"
            detail={`${sum.interests} intereses · ${sum.job_title ?? sum.career_level ?? ''}`} onPress={() => setEditing('cuestionario')} />
          <Item title="Fotos" detail={`${sum.photos} fotos`} onPress={() => setEditing('fotos')} />
        </Card>

        <Card>
          <T weight="semibold" size={16}>Diferencia de edad que aceptas</T>
          <Body muted small>Déjala vacía si no te importa la edad.</Body>
          <Field label="¿Hasta cuántos años mayor que tú?" value={olderMax} onChangeText={setOlderMax} keyboardType="number-pad"
            maxLength={2} placeholder="Sin límite" error={!valid(olderMax) ? 'Escribe un número de 0 a 60' : undefined}
            hint="Pon 0 si no quieres conocer a alguien mayor que tú." />
          <Field label="¿Hasta cuántos años menor que tú?" value={youngerMax} onChangeText={setYoungerMax} keyboardType="number-pad"
            maxLength={2} placeholder="Sin límite" error={!valid(youngerMax) ? 'Escribe un número de 0 a 60' : undefined}
            hint="Pon 0 si no quieres conocer a alguien menor que tú. Nunca te presentaremos a menores de 18." />
          <Button label="Guardar rango de edad" onPress={saveAges} loading={busy} disabled={!valid(olderMax) || !valid(youngerMax)} />
        </Card>

        <Card>
          <T weight="semibold" size={16}>Empezar de cero</T>
          <Body muted small>
            Vuelve a contestar qué buscas y el cuestionario completo, por ejemplo para pasar de relación formal a noche casual.
            Se conservan tu cuenta, tus datos básicos, tus fotos, tu verificación y tu historial de citas.
            Nada cambia hasta que termines.
          </Body>
          {confirmRestart ? <>
            <Note kind="warn">Tus respuestas actuales se reemplazarán por las nuevas al terminar. ¿Continuar?</Note>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ flexGrow: 1, flexBasis: 140 }}><Button label="No, regresar" kind="ghost" onPress={() => setConfirmRestart(false)} /></View>
              <View style={{ flexGrow: 1, flexBasis: 140 }}><Button label="Sí, empezar de cero" onPress={() => setEditing('restart')} /></View>
            </View>
          </> : <Button label="Empezar de cero" kind="ghost" onPress={() => setConfirmRestart(true)} />}
        </Card>
      </>}
    </Screen>
  );
}

const st = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18 },
});
