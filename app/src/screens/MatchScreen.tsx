import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { rpc, supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { fmtSlot, INTENTS, Intent } from '../lib/catalog';
import { Body, Button, Card, Eyebrow, Field, Label, Note, Option, Row, Screen, Title } from '../components/ui';

type Shared = Record<string, { ambos: string[]; tambien_le_gusta: string[] }>;
type MatchCard = {
  match_id: string;
  status: 'proposed' | 'rejected' | 'awaiting_payment' | 'booking' | 'booked' | 'completed' | 'cancelled';
  intent: Intent; attempt: number; compatibility: number;
  slot_options: string[]; respond_by: string | null; starts_at: string | null;
  partner: { first_name: string; age: number; alcaldia: string | null; job_title: string | null; linkedin_verified: boolean; activities: string | null; photos: string[] };
  shared: Shared;
  my_response: { decision: 'accept' | 'reject'; slots: string[] } | null;
};
type Booking = {
  starts_at: string; venue: string; address: string; alcaldia: string; safety_keyword: string;
  reservation_ref: string; arrival_confirmed_by_me: boolean; my_arrival_confirmed: boolean;
};
type Msg = { id: number; sender_id: string; body: string; created_at: string };

export default function MatchScreen({ matchId, userId, onBack }: { matchId: string; userId: string; onBack: () => void }) {
  const t = useTheme();
  const [card, setCard] = useState<MatchCard | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [myPayment, setMyPayment] = useState<string | null>(null);
  const [fbDone, setFbDone] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<[kind: 'ok' | 'warn' | 'bad', text: string] | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await rpc<MatchCard>('get_match_card', { p_match: matchId });
      setCard(c);
      if (c.partner.photos.length) {
        const { data } = await supabase.storage.from('photos').createSignedUrls(c.partner.photos, 3600);
        setPhotoUrls((data ?? []).map(d => d.signedUrl).filter(Boolean) as string[]);
      }
      if (c.status === 'awaiting_payment') {
        const { data } = await supabase.from('payments').select('status').eq('match_id', matchId).eq('profile_id', userId).maybeSingle();
        setMyPayment(data?.status ?? null);
      }
      if (c.status === 'booked' || c.status === 'completed') {
        setBooking(await rpc<Booking | null>('get_booking', { p_match: matchId }));
        const { data } = await supabase.from('feedback').select('match_id').eq('match_id', matchId).eq('author_id', userId).maybeSingle();
        setFbDone(!!data);
      }
    } catch (e: any) { setNote(['bad', e.message]); }
  }, [matchId, userId]);
  useEffect(() => { load(); }, [load]);

  async function respond(decision: 'accept' | 'reject') {
    setBusy(true); setNote(null);
    try {
      const st = await rpc<string>('respond_to_match', { p_match: matchId, p_decision: decision, p_slots: decision === 'accept' ? slots : [] });
      setSlots([]);
      if (st === 'rejected') setNote(['warn', 'Nadie paga. ' + (card?.intent === 'casual' ? 'Puedes buscar otro match si te quedan intentos hoy.' : 'Tu siguiente match llega la próxima semana.')]);
      if (st === 'cancelled') setNote(['bad', 'No coincidieron en horario en el segundo intento. El match se canceló sin penalización.']);
      await load();
    } catch (e: any) { setNote(['bad', e.message]); }
    finally { setBusy(false); }
  }

  async function alert(kind: 'help' | 'share_location') {
    const { error } = await supabase.from('safety_alerts').insert({ match_id: matchId, profile_id: userId, kind });
    setNote(error ? ['bad', 'No se pudo enviar el aviso. Pide ayuda directamente al personal del restaurante.']
      : kind === 'help' ? ['bad', 'Aviso enviado al restaurante y a tu contacto de confianza. Alguien se acercará contigo.']
      : ['ok', 'Ubicación y hora de tu cita compartidas con tu contacto de confianza.']);
  }

  async function confirmArrival() {
    setBusy(true);
    try { await rpc('confirm_arrival', { p_match: matchId }); await load(); }
    catch (e: any) { setNote(['bad', e.message]); }
    finally { setBusy(false); }
  }

  if (!card) return <Screen><Card><Body muted>Cargando…</Body>{note && <Note kind={note[0]}>{note[1]}</Note>}</Card></Screen>;

  const p = card.partner;
  const dateStarted = card.starts_at ? new Date(card.starts_at).getTime() - Date.now() < 60 * 60 * 1000 : false;
  const feedbackTime = card.starts_at ? Date.now() > new Date(card.starts_at).getTime() : false;
  const needsFeedback = (card.status === 'booked' && feedbackTime) || card.status === 'completed';

  return (
    <Screen>
      <Button label="← Volver" kind="ghost" onPress={onBack} />

      {/* Tarjeta del match */}
      <Card>
        <Eyebrow>{card.intent === 'casual' ? 'Tu match de noche casual' : 'Tu match de la semana'}{card.attempt === 2 && card.status === 'proposed' ? ' · segundo intento de horario' : ''}</Eyebrow>
        {photoUrls.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photoUrls.map(u => <Image key={u} source={{ uri: u }} style={st.photo} accessibilityLabel={`Foto de ${p.first_name}`} />)}
          </ScrollView>
        )}
        <Title>{p.first_name}, {p.age}</Title>
        <Body muted>{[p.alcaldia, p.job_title].filter(Boolean).join(' · ')}{p.linkedin_verified ? ' · Experiencia verificada' : ''}</Body>
        <View style={[st.pill, { backgroundColor: t.okSoft }]}><Text style={{ color: t.ok, fontWeight: '600', fontSize: 13 }}>{Math.round(card.compatibility)}% compatible</Text></View>
        {p.activities ? <Body>“{p.activities}”</Body> : null}
        <Body muted small>Busca: {INTENTS[card.intent][0]}</Body>
        {Object.keys(card.shared).length > 0 && <>
          <Label>Lo que tienen en común</Label>
          {Object.entries(card.shared).map(([interest, d]) => (
            <View key={interest} style={[st.common, { backgroundColor: t.bg, borderColor: t.line }]}>
              <Text style={{ color: t.ink, fontSize: 14 }}>
                <Text style={{ fontWeight: '700' }}>{interest}:</Text>{' '}
                {d.ambos.length ? `a los dos les gusta ${d.ambos.join(' y ').toLowerCase()}` : 'les interesa a los dos'}
              </Text>
              {d.tambien_le_gusta.length > 0 && <Text style={{ color: t.muted, fontSize: 12 }}>También le gusta: {d.tambien_le_gusta.join(', ').toLowerCase()}</Text>}
            </View>
          ))}
        </>}
        {card.intent === 'formal' && <Body muted small>Coinciden en lo que pidieron sobre hijos, religión y política.</Body>}
      </Card>

      {note && <Note kind={note[0]}>{note[1]}</Note>}

      {/* Respuesta y horarios */}
      {card.status === 'proposed' && !card.my_response && (
        <Card>
          <Title>¿Quieres la cita?</Title>
          <Label>Marca todos los horarios que te funcionan</Label>
          {card.slot_options.map(s => (
            <Option key={s} title={fmtSlot(s)} subtitle={card.intent === 'casual' ? 'Café o restaurante aliado' : 'Restaurante aliado en una zona concurrida'}
              selected={slots.includes(s)} onPress={() => setSlots(x => x.includes(s) ? x.filter(y => y !== s) : [...x, s])} />
          ))}
          <Row>
            <Button label="Rechazar" kind="ghost" onPress={() => respond('reject')} loading={busy} />
            <Button label="Quiero la cita" onPress={() => respond('accept')} disabled={!slots.length} loading={busy} />
          </Row>
          {card.respond_by && <Body muted small>Responde antes de: {fmtSlot(card.respond_by)}. Si no respondes, cuenta como rechazo.</Body>}
        </Card>
      )}
      {card.status === 'proposed' && card.my_response && (
        <Card><Title>Esperando a {p.first_name}</Title><Body muted>Te avisamos en cuanto responda.</Body></Card>
      )}
      {(card.status === 'rejected' || card.status === 'cancelled') && !note && (
        <Card><Title>Este match se cerró</Title><Body muted>Nadie paga. {card.intent === 'casual' ? 'Puedes buscar otro si te quedan intentos hoy.' : 'Tu siguiente match llega la próxima semana.'}</Body></Card>
      )}

      {/* Pago */}
      {card.status === 'awaiting_payment' && (
        <Card>
          <Eyebrow>Fecha confirmada</Eyebrow><Title>¡Los dos aceptaron!</Title>
          <Body>Fecha: {card.starts_at ? fmtSlot(card.starts_at) : '—'}</Body>
          <Body muted small>El lugar se revela cuando ambos paguen. Si la otra persona no paga a tiempo, se cancela y te reembolsamos. Una vez pagada, si alguien no asiste no hay reembolso.</Body>
          {myPayment === 'paid'
            ? <Note kind="ok">Tu pago está confirmado. Esperando el pago de {p.first_name}.</Note>
            : <Note kind="warn">Pendiente de integración: aquí se cobra con tu forma de pago guardada a través del proveedor de pagos.</Note>}
        </Card>
      )}
      {card.status === 'booking' && (
        <Card><Eyebrow>Pago confirmado</Eyebrow><Title>Estamos reservando tu mesa</Title><Body muted>Te avisamos en cuanto el restaurante confirme.</Body></Card>
      )}

      {/* Cita: reserva, seguridad, llegada */}
      {booking && card.status === 'booked' && !needsFeedback && (
        <Card>
          <Eyebrow>Tu cita está lista</Eyebrow><Title>{booking.venue}</Title>
          <Body>{fmtSlot(booking.starts_at)}</Body>
          <Body muted>{booking.address}, {booking.alcaldia}</Body>
          <Note kind="ok">Protocolo de seguridad: si en algún momento te sientes incómodo/a, toca “Necesito ayuda” o pide en la barra “{booking.safety_keyword}”. El personal sabe qué hacer.</Note>
          {dateStarted && <>
            <Label>Antes de empezar, confirmen su llegada</Label>
            <Body muted small>Pídele a {p.first_name} que marque que llegaste, y tú marca que llegó. Esa confirmación mutua cuenta como asistencia.</Body>
            {booking.arrival_confirmed_by_me ? <Note kind="ok">Marcaste que {p.first_name} llegó.</Note>
              : <Button label={`${p.first_name} llegó`} onPress={confirmArrival} loading={busy} />}
            {booking.my_arrival_confirmed ? <Note kind="ok">{p.first_name} confirmó tu llegada.</Note>
              : <Note kind="warn">{p.first_name} aún no confirma tu llegada.</Note>}
            <Note kind="accent">Si la cita sale bien y deciden intercambiar datos, desde ese momento la comunicación sigue fuera de la app y la app ya no es responsable de lo que pase después.</Note>
          </>}
          <Row>
            <Button label="Compartir ubicación" kind="ghost" onPress={() => alert('share_location')} />
            <Button label="Necesito ayuda" kind="danger" onPress={() => alert('help')} />
          </Row>
        </Card>
      )}
      {booking && card.status === 'booked' && !needsFeedback && <Chat matchId={matchId} userId={userId} partner={p.first_name} />}

      {/* Feedback */}
      {needsFeedback && !fbDone && <Feedback matchId={matchId} arrivalOk={!!booking?.my_arrival_confirmed && !!booking?.arrival_confirmed_by_me} partner={p.first_name} onDone={() => { setFbDone(true); onBack(); }} />}
      {needsFeedback && fbDone && <Card><Title>¡Gracias por tu feedback!</Title><Body muted>Tu siguiente match ya está en camino.</Body></Card>}
    </Screen>
  );
}

function Chat({ matchId, userId, partner }: { matchId: string; userId: string; partner: string }) {
  const t = useTheme();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const scroll = useRef<any>(null);

  useEffect(() => {
    supabase.from('messages').select('*').eq('match_id', matchId).order('created_at').then(({ data }) => setMsgs(data ?? []));
    const ch = supabase.channel(`chat-${matchId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        payload => setMsgs(m => m.some(x => x.id === (payload.new as Msg).id) ? m : [...m, payload.new as Msg]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId]);

  async function send() {
    const body = text.trim(); if (!body) return;
    setText('');
    const { data, error } = await supabase.from('messages').insert({ match_id: matchId, sender_id: userId, body }).select().single();
    if (!error && data) setMsgs(m => m.some(x => x.id === data.id) ? m : [...m, data]);
  }

  return (
    <Card>
      <Label>Chat con {partner}</Label>
      <ScrollView ref={scroll} style={{ maxHeight: 280 }} onContentSizeChange={() => scroll.current?.scrollToEnd()} contentContainerStyle={{ gap: 8 }}>
        <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>Chat abierto para conocerse un poco antes de verse.</Text>
        {msgs.map(m => {
          const me = m.sender_id === userId;
          return (
            <View key={m.id} style={[st.msg, me ? { alignSelf: 'flex-end', backgroundColor: t.accent } : { alignSelf: 'flex-start', backgroundColor: t.bg, borderWidth: 1, borderColor: t.line }]}>
              <Text style={{ color: me ? t.accentInk : t.ink, fontSize: 14 }}>{m.body}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Escribe un mensaje" placeholderTextColor={t.muted}
          style={[st.input, { color: t.ink, borderColor: t.line, backgroundColor: t.bg }]} />
        <Pressable onPress={send} style={[st.send, { backgroundColor: t.accent }]}><Text style={{ color: t.accentInk, fontWeight: '600' }}>Enviar</Text></Pressable>
      </View>
    </Card>
  );
}

function Feedback({ matchId, arrivalOk, partner, onDone }: { matchId: string; arrivalOk: boolean; partner: string; onDone: () => void }) {
  const t = useTheme();
  const [stars, setStars] = useState(0);
  const [good, setGood] = useState('');
  const [bad, setBad] = useState('');
  const [exchanged, setExchanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await rpc('submit_feedback', { p_match: matchId, p_stars: stars, p_good: good.trim() || null, p_bad: bad.trim() || null, p_exchanged: exchanged });
      onDone();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card>
      <Eyebrow>Obligatorio para tu siguiente match</Eyebrow><Title>¿Cómo te fue?</Title>
      {arrivalOk ? <Note kind="ok">Asistencia confirmada por ambos en el restaurante.</Note>
        : <Note kind="warn">No se confirmó la asistencia de ambos al inicio de la cita. Quien no fue marcado como presente recibe una inasistencia.</Note>}
      <Label>Califica la cita</Label>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={`${n} estrellas`}>
            <Text style={{ fontSize: 30, color: n <= stars ? t.accent : t.line }}>★</Text>
          </Pressable>
        ))}
      </View>
      <Field label="¿Qué salió bien?" multiline value={good} onChangeText={setGood} placeholder="Ej. La conversación fluyó, el lugar era tranquilo" />
      <Field label="¿Qué salió mal o qué mejorarías?" multiline value={bad} onChangeText={setBad} placeholder="Opcional" />
      <Option selected={exchanged} onPress={() => setExchanged(!exchanged)} title={`Intercambié datos de contacto con ${partner}`}
        subtitle="A partir de ahí la app ya no es responsable de lo que pase después." />
      <Body muted small>Tu respuesta es privada. {partner} no la ve.</Body>
      {error && <Note kind="bad">{error}</Note>}
      <Button label="Enviar y activar mi siguiente match" onPress={submit} disabled={!stars} loading={busy} />
    </Card>
  );
}

const st = StyleSheet.create({
  photo: { width: 150, height: 200, borderRadius: 12 },
  pill: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  common: { padding: 10, borderRadius: 10, borderWidth: 1, gap: 2 },
  msg: { maxWidth: '80%', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
  input: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 },
  send: { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
});
