import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import {
  ALCALDIAS, CAREER_LEVELS, EMAIL_RE, INTENTS, INTEREST_DETAILS, Intent, LINKEDIN_RE, MATCH_TYPES, MatchType,
  NO_SALARY, PERSONALITY, POLITICS, RELIGIONS, RELIGION_PREFS, SALARY,
} from '../lib/catalog';
import {
  Body, Button, Card, Chips, Eyebrow, Field, Label, Note, Option, Row, Screen, Steps, Title,
} from '../components/ui';

type Step = 'datos' | 'intencion' | 'tipo' | 'filtros' | 'cuestionario' | 'fotos' | 'pago' | 'verificacion';

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 9;

// Convierte DD/MM/AAAA a AAAA-MM-DD y valida mayoría de edad.
function parseBirth(s: string): { iso?: string; error?: string } {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { error: 'Usa el formato DD/MM/AAAA' };
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T12:00:00`);
  if (isNaN(date.getTime()) || date.getDate() !== +d) return { error: 'Revisa la fecha' };
  const adult = new Date(); adult.setFullYear(adult.getFullYear() - 18);
  if (date > adult) return { error: 'Necesitas tener 18 años o más' };
  return { iso: `${y}-${mo}-${d}` };
}

export default function OnboardingScreen({ userId, phone, onDone }: { userId: string; phone: string; onDone: () => void }) {
  const t = useTheme();
  const [step, setStep] = useState<Step>('datos');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Datos
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<'hombre' | 'mujer' | null>(null);
  const [alcaldia, setAlcaldia] = useState<string | null>(null);
  // Intención y tipo
  const [intent, setIntent] = useState<Intent | null>(null);
  const [matchType, setMatchType] = useState<MatchType | null>(null);
  // Filtros formales
  const [hasKids, setHasKids] = useState<boolean | null>(null);
  const [kidsPref, setKidsPref] = useState<'con' | 'sin' | 'igual' | null>(null);
  const [ownPolitics, setOwnPolitics] = useState<string | null>(null);
  const [politicsPref, setPoliticsPref] = useState<'igual' | 'similar' | 'contraria' | 'nd' | null>(null);
  const [ownReligion, setOwnReligion] = useState<string | null>(null);
  const [religionPref, setReligionPref] = useState<string | null>(null);
  const [sensConsent, setSensConsent] = useState(false);
  // Cuestionario
  const [interests, setInterests] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, string[]>>({});
  const [activities, setActivities] = useState('');
  const [personality, setPersonality] = useState<Record<string, number>>({ social: 3, plan: 3, conflict: 3, ritmo: 3 });
  const [career, setCareer] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [salary, setSalary] = useState<string | null>(null);
  // Fotos
  const [photos, setPhotos] = useState<{ path: string; preview: string }[]>([]);
  // Consentimiento final
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const flow: Step[] = useMemo(
    () => ['datos', 'intencion', 'tipo', ...(intent === 'formal' ? ['filtros' as Step] : []), 'cuestionario', 'fotos', 'pago', 'verificacion'],
    [intent],
  );
  const idx = flow.indexOf(step);
  const go = (dir: 1 | -1) => { setError(null); setStep(flow[idx + dir]); };

  const birthCheck = parseBirth(birth);
  const datosOk = firstName.trim() && lastName.trim() && EMAIL_RE.test(email.trim()) && birthCheck.iso && gender && alcaldia;
  const filtrosOk = hasKids !== null && kidsPref && ownPolitics && politicsPref && ownReligion && religionPref && sensConsent;
  const detailsOk = interests.every(i => (details[i] ?? []).length > 0);
  const quizOk = interests.length >= 3 && detailsOk && career && jobTitle.trim() && LINKEDIN_RE.test(linkedin.trim()) && salary;

  // Guarda el perfil completo al terminar el cuestionario (las fotos necesitan que exista).
  async function saveProfile() {
    setBusy(true); setError(null);
    try {
      const { error: e1 } = await supabase.from('profiles').upsert({
        id: userId, first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase(),
        phone, birthdate: birthCheck.iso, gender, seeking_gender: gender === 'hombre' ? 'mujer' : 'hombre',
        intent, match_type: matchType, activities: activities.trim() || null, personality,
        career_level: career, job_title: jobTitle.trim(), linkedin_url: linkedin.trim(), alcaldia,
      });
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('profile_private')
        .upsert({ profile_id: userId, salary_currency: salary === NO_SALARY ? null : currency, salary_range: salary });
      if (e2) throw e2;

      await supabase.from('interests').delete().eq('profile_id', userId);
      const { error: e3 } = await supabase.from('interests')
        .insert(interests.map(i => ({ profile_id: userId, interest: i, details: details[i] })));
      if (e3) throw e3;

      if (intent === 'formal') {
        const { error: e4 } = await supabase.from('formal_preferences').upsert({
          profile_id: userId, has_kids: hasKids, kids_pref: kidsPref, own_politics: ownPolitics?.toLowerCase(),
          politics_pref: politicsPref, own_religion: ownReligion, religion_pref: religionPref,
          consent_at: new Date().toISOString(),
          // Pendiente: sustituir por el id de la firma electrónica del proveedor (requisito legal).
          consent_evidence: `app-checkbox:${new Date().toISOString()}`,
        });
        if (e4) throw e4;
      }
      go(1);
    } catch (e: any) {
      setError(`No pudimos guardar tu perfil: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function addPhotos() {
    setError(null);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PHOTOS - photos.length, quality: 0.7,
    });
    if (res.canceled) return;
    setBusy(true);
    try {
      const added: { path: string; preview: string }[] = [];
      for (const [k, asset] of res.assets.entries()) {
        const position = photos.length + k;
        if (position >= MAX_PHOTOS) break;
        const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
        const path = `${userId}/${Date.now()}-${position}.${ext}`;
        const body = await (await fetch(asset.uri)).arrayBuffer();
        const up = await supabase.storage.from('photos').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg' });
        if (up.error) throw up.error;
        const ins = await supabase.from('photos').insert({ profile_id: userId, storage_path: path, position });
        if (ins.error) throw ins.error;
        added.push({ path, preview: asset.uri });
      }
      setPhotos(p => [...p, ...added]);
    } catch (e: any) {
      setError(`No pudimos subir una foto: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(i: number) {
    const p = photos[i];
    await supabase.storage.from('photos').remove([p.path]);
    await supabase.from('photos').delete().eq('storage_path', p.path);
    // Reordenar posiciones para que la primera siempre sea la principal
    const rest = photos.filter((_, k) => k !== i);
    await supabase.from('photos').delete().eq('profile_id', userId);
    await supabase.from('photos').insert(rest.map((r, k) => ({ profile_id: userId, storage_path: r.path, position: k })));
    setPhotos(rest);
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const header = <Steps current={idx} total={flow.length} />;
  const err = error && <Note kind="bad">{error}</Note>;

  if (step === 'datos') return (
    <Screen>{header}<Card>
      <Eyebrow>Paso 1 · Registro</Eyebrow><Title>Crea tu cuenta</Title>
      <Field label="Nombre" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
      <Field label="Apellido" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
      <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address"
        autoCapitalize="none" autoComplete="email" placeholder="tu@correo.com"
        error={email && !EMAIL_RE.test(email.trim()) ? 'Revisa el correo' : undefined}
        hint="Para avisos y recibos. En tu perfil solo se muestra tu nombre." />
      <Field label="Fecha de nacimiento" value={birth} onChangeText={setBirth} placeholder="DD/MM/AAAA"
        keyboardType="numbers-and-punctuation" maxLength={10} error={birth.length === 10 ? birthCheck.error : undefined} />
      <Label>Soy</Label>
      <Chips options={['Hombre', 'Mujer']} selected={gender ? [gender === 'hombre' ? 'Hombre' : 'Mujer'] : []}
        onToggle={v => setGender(v === 'Hombre' ? 'hombre' : 'mujer')} />
      <Label>¿En qué alcaldía vives o pasas más tiempo?</Label>
      <Chips options={ALCALDIAS} selected={alcaldia ? [alcaldia] : []} onToggle={setAlcaldia} />
      <Button label="Continuar" onPress={() => go(1)} disabled={!datosOk} />
    </Card></Screen>
  );

  if (step === 'intencion') return (
    <Screen>{header}<Card>
      <Eyebrow>Paso 2 · Intención</Eyebrow><Title>¿Qué estás buscando?</Title>
      {(Object.keys(INTENTS) as Intent[]).map(k => (
        <Option key={k} title={INTENTS[k][0]} subtitle={INTENTS[k][1]} selected={intent === k} onPress={() => setIntent(k)} />
      ))}
      <Body muted small>Solo te presentamos personas que buscan lo mismo que tú.</Body>
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Continuar" onPress={() => go(1)} disabled={!intent} /></Row>
    </Card></Screen>
  );

  if (step === 'tipo') return (
    <Screen>{header}<Card>
      <Eyebrow>Paso 3 · Tipo de match</Eyebrow><Title>¿Qué tipo de persona quieres conocer?</Title>
      {(Object.keys(MATCH_TYPES) as MatchType[]).map(k => (
        <Option key={k} title={MATCH_TYPES[k][0]} subtitle={MATCH_TYPES[k][1]} selected={matchType === k} onPress={() => setMatchType(k)} />
      ))}
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Continuar" onPress={() => go(1)} disabled={!matchType} /></Row>
    </Card></Screen>
  );

  if (step === 'filtros') return (
    <Screen>{header}<Card>
      <Eyebrow>Solo relación formal</Eyebrow><Title>Lo que no es negociable</Title>
      <Label>¿Tienes hijos?</Label>
      <Chips options={['Sí', 'No']} selected={hasKids === null ? [] : [hasKids ? 'Sí' : 'No']} onToggle={v => setHasKids(v === 'Sí')} />
      <Label>Buscas a alguien que…</Label>
      <Chips options={['Tenga hijos', 'No tenga hijos', 'Me da igual']}
        selected={kidsPref ? [{ con: 'Tenga hijos', sin: 'No tenga hijos', igual: 'Me da igual' }[kidsPref]] : []}
        onToggle={v => setKidsPref(v === 'Tenga hijos' ? 'con' : v === 'No tenga hijos' ? 'sin' : 'igual')} />
      <Label>Tu inclinación política</Label>
      <Chips options={POLITICS} selected={ownPolitics ? [ownPolitics] : []} onToggle={setOwnPolitics} />
      <Label>La de tu pareja debería ser…</Label>
      <Chips options={['Igual a la mía', 'Similar', 'Contraria', 'No me importa']}
        selected={politicsPref ? [{ igual: 'Igual a la mía', similar: 'Similar', contraria: 'Contraria', nd: 'No me importa' }[politicsPref]] : []}
        onToggle={v => setPoliticsPref(v === 'Igual a la mía' ? 'igual' : v === 'Similar' ? 'similar' : v === 'Contraria' ? 'contraria' : 'nd')} />
      <Label>Tu religión</Label>
      <Chips options={RELIGIONS} selected={ownReligion ? [ownReligion] : []} onToggle={setOwnReligion} />
      <Label>Religión que buscas en tu pareja</Label>
      <Chips options={RELIGION_PREFS} selected={religionPref ? [religionPref] : []} onToggle={setReligionPref} />
      <Option selected={sensConsent} onPress={() => setSensConsent(!sensConsent)}
        title="Autorizo el uso de mi religión y opinión política"
        subtitle="Solo para encontrar mi match. Nunca se muestran en mi perfil. Firmaré esta autorización en la verificación." />
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Continuar" onPress={() => go(1)} disabled={!filtrosOk} /></Row>
    </Card></Screen>
  );

  if (step === 'cuestionario') return (
    <Screen>{header}<Card>
      <Eyebrow>Cuestionario</Eyebrow><Title>Cuéntanos de ti</Title>
      <Label>Intereses (elige al menos 3)</Label>
      <Chips options={Object.keys(INTEREST_DETAILS)} selected={interests} onToggle={v => {
        setInterests(toggle(interests, v));
        if (interests.includes(v)) setDetails(({ [v]: _, ...rest }) => rest);
      }} />
      {interests.map(i => (
        <View key={i} style={[st.box, { borderColor: t.line, backgroundColor: t.bg }]}>
          <Label>{i}: ¿qué te gusta en específico?</Label>
          <Chips options={INTEREST_DETAILS[i]} selected={details[i] ?? []}
            onToggle={d => setDetails(x => ({ ...x, [i]: toggle(x[i] ?? [], d) }))} />
        </View>
      ))}
      <Field label="¿Qué haces en un fin de semana ideal?" multiline value={activities} onChangeText={setActivities}
        placeholder="Ej. Desayuno en la Roma, bici en Reforma y un concierto en la noche" />
      <Label>Personalidad</Label>
      {PERSONALITY.map(([k, a, b]) => (
        <View key={k} style={{ gap: 6 }}>
          <View style={st.scaleLabels}><Text style={[st.scaleText, { color: t.muted }]}>{a}</Text><Text style={[st.scaleText, { color: t.muted, textAlign: 'right' }]}>{b}</Text></View>
          <View style={st.scale}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable key={n} onPress={() => setPersonality(p => ({ ...p, [k]: n }))} accessibilityLabel={`${a} a ${b}: ${n} de 5`}
                style={[st.scaleDot, { borderColor: personality[k] === n ? t.accent : t.line, backgroundColor: personality[k] === n ? t.accent : 'transparent' }]} />
            ))}
          </View>
        </View>
      ))}
      <Label>Experiencia profesional</Label>
      <Chips options={CAREER_LEVELS} selected={career ? [career] : []} onToggle={setCareer} />
      <Field label="Puesto actual" value={jobTitle} onChangeText={setJobTitle} placeholder="Ej. Gerente de Producto" />
      <Field label="Perfil de LinkedIn" value={linkedin} onChangeText={setLinkedin} autoCapitalize="none" keyboardType="url"
        placeholder="linkedin.com/in/tu-perfil"
        error={linkedin && !LINKEDIN_RE.test(linkedin.trim()) ? 'Debe verse como linkedin.com/in/tu-perfil' : undefined}
        hint="Lo usamos para validar que tu experiencia sea real. No se muestra en tu perfil." />
      <Label>Ingreso mensual aproximado</Label>
      <Chips options={['MXN', 'USD']} selected={[currency]} onToggle={v => { if (v !== currency) { setCurrency(v as 'MXN' | 'USD'); setSalary(null); } }} />
      <Chips options={[...SALARY[currency], NO_SALARY]} selected={salary ? [salary] : []} onToggle={setSalary} />
      <Body muted small>Nunca se muestra en tu perfil. Solo ayuda a calcular compatibilidad.</Body>
      {interests.length >= 3 && !detailsOk && <Body muted small>Elige al menos un detalle en cada interés.</Body>}
      {err}
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Guardar y continuar" onPress={saveProfile} disabled={!quizOk} loading={busy} /></Row>
    </Card></Screen>
  );

  if (step === 'fotos') return (
    <Screen>{header}<Card>
      <Eyebrow>Fotos</Eyebrow><Title>Sube al menos 5 fotos</Title>
      <Body muted>Fotos recientes donde se vea bien tu cara. Las comparamos con tu selfie en la verificación.</Body>
      <View style={st.grid}>
        {photos.map((p, i) => (
          <View key={p.path} style={[st.photo, { backgroundColor: t.bg }]}>
            <Image source={{ uri: p.preview }} style={StyleSheet.absoluteFill} />
            {i === 0 && <Text style={[st.badge, { backgroundColor: t.surface, color: t.ink }]}>Principal</Text>}
            <Pressable onPress={() => removePhoto(i)} accessibilityLabel={`Quitar foto ${i + 1}`} style={[st.rm, { backgroundColor: t.surface }]}>
              <Text style={{ color: t.ink, fontSize: 16 }}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <Pressable onPress={addPhotos} style={[st.photo, st.add, { borderColor: t.line }]}>
            <Text style={{ color: t.accent, fontSize: 28 }}>+</Text><Text style={{ color: t.muted, fontSize: 13 }}>Agregar</Text>
          </Pressable>
        )}
      </View>
      <Body muted small>{photos.length} de {MIN_PHOTOS} mínimo (máximo {MAX_PHOTOS})</Body>
      {err}
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Continuar" onPress={() => go(1)} disabled={photos.length < MIN_PHOTOS || busy} loading={busy} /></Row>
    </Card></Screen>
  );

  if (step === 'pago') return (
    <Screen>{header}<Card>
      <Eyebrow>Forma de pago</Eyebrow><Title>¿Cómo vas a pagar tus citas?</Title>
      <Note kind="accent">No se cobra nada ahora. El cargo solo ocurre cuando los dos aceptan el match y ya hay fecha para la cita.</Note>
      <Note kind="warn">Pendiente de integración: aquí se abrirá el formulario seguro del proveedor de pagos. La app nunca ve ni guarda los datos de tu tarjeta.</Note>
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Continuar" onPress={() => go(1)} /></Row>
    </Card></Screen>
  );

  return (
    <Screen>{header}<Card>
      <Eyebrow>Verificación</Eyebrow><Title>Confirmemos que eres tú</Title>
      <Body muted>Todas las personas pasan por esta verificación antes de recibir un match: identificación oficial y selfie en vivo.</Body>
      <Note kind="warn">Pendiente de integración: aquí se abrirá el proveedor de verificación de identidad. Mientras tanto, tu cuenta queda en revisión.</Note>
      <Option selected={privacyConsent} onPress={() => setPrivacyConsent(!privacyConsent)}
        title="Acepto el aviso de privacidad"
        subtitle={intent === 'formal' ? 'Incluye la autorización expresa para tratar mis datos sensibles.' : undefined} />
      <Row><Button label="Atrás" kind="ghost" onPress={() => go(-1)} /><Button label="Terminar" onPress={onDone} disabled={!privacyConsent} /></Row>
    </Card></Screen>
  );
}

const st = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  scaleText: { fontSize: 12, flex: 1 },
  scale: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  scaleDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: '31%', aspectRatio: 3 / 4, borderRadius: 10, overflow: 'hidden' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 6, bottom: 6, fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  rm: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
