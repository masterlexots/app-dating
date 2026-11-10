import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Body, Button, Card, Eyebrow, Field, Note, Screen, Title } from '../components/ui';

// Preferencias que el usuario puede cambiar cuando quiera.
// Aplican a partir del siguiente match, no al que ya esté en curso.
export default function PreferencesScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [olderMax, setOlderMax] = useState('');
  const [youngerMax, setYoungerMax] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[kind: 'ok' | 'bad', text: string] | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('age_older_max, age_younger_max').eq('id', userId).single()
      .then(({ data }) => {
        setOlderMax(data?.age_older_max == null ? '' : String(data.age_older_max));
        setYoungerMax(data?.age_younger_max == null ? '' : String(data.age_younger_max));
        setLoaded(true);
      });
  }, [userId]);

  // Vacío = sin límite; si no, un número de 0 a 60.
  const valid = (v: string) => v.trim() === '' || (/^\d{1,2}$/.test(v.trim()) && +v <= 60);
  const toDb = (v: string) => (v.trim() === '' ? null : +v);

  async function save() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('profiles')
      .update({ age_older_max: toDb(olderMax), age_younger_max: toDb(youngerMax) }).eq('id', userId);
    setBusy(false);
    setMsg(error ? ['bad', 'No se pudo guardar. Intenta de nuevo.'] : ['ok', 'Guardado. Aplica a partir de tu siguiente match.']);
  }

  return (
    <Screen>
      <Button label="← Volver" kind="ghost" onPress={onBack} />
      <Card>
        <Eyebrow>Mis preferencias</Eyebrow>
        <Title>Diferencia de edad que aceptas</Title>
        <Body muted>Puedes cambiarla cuando quieras. Déjala vacía si no te importa la edad.</Body>
        <Field label="¿Hasta cuántos años mayor que tú?" value={olderMax} onChangeText={setOlderMax} keyboardType="number-pad"
          maxLength={2} placeholder="Sin límite" editable={loaded}
          error={!valid(olderMax) ? 'Escribe un número de 0 a 60' : undefined}
          hint="Pon 0 si no quieres conocer a alguien mayor que tú." />
        <Field label="¿Hasta cuántos años menor que tú?" value={youngerMax} onChangeText={setYoungerMax} keyboardType="number-pad"
          maxLength={2} placeholder="Sin límite" editable={loaded}
          error={!valid(youngerMax) ? 'Escribe un número de 0 a 60' : undefined}
          hint="Pon 0 si no quieres conocer a alguien menor que tú. Nunca te presentaremos a menores de 18." />
        {msg && <Note kind={msg[0]}>{msg[1]}</Note>}
        <Button label="Guardar" onPress={save} loading={busy} disabled={!loaded || !valid(olderMax) || !valid(youngerMax)} />
      </Card>
    </Screen>
  );
}
