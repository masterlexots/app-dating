import React from 'react';
import { View } from 'react-native';
import aviso from '../content/aviso-privacidad.json';
import { useTheme } from '../lib/theme';
import { Body, Button, Card, Note, Screen, Title, T } from '../components/ui';

export const PRIVACY_VERSION: string = aviso.version;

type Section = { title: string; paragraphs?: string[]; bullets?: string[]; afterBullets?: string[] };

export default function PrivacyScreen({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  return (
    <Screen>
      <Button label="← Volver" kind="ghost" onPress={onBack} />
      <Card>
        <Title>{aviso.title}</Title>
        {aviso.version.includes('borrador') && <Note kind="warn">{aviso.intro}</Note>}
        {(aviso.sections as Section[]).map(s => (
          <View key={s.title} style={{ gap: 8 }}>
            <T style={{ color: t.ink, fontSize: 16, fontWeight: '700' }}>{s.title}</T>
            {s.paragraphs?.map(p => <Body key={p}>{p}</Body>)}
            {s.bullets?.map(b => (
              <View key={b} style={{ flexDirection: 'row', gap: 8 }}>
                <T style={{ color: t.muted }}>•</T>
                <View style={{ flex: 1 }}><Body>{b}</Body></View>
              </View>
            ))}
            {s.afterBullets?.map(p => <Body key={p}>{p}</Body>)}
          </View>
        ))}
        <Body muted small>{aviso.updated} · Versión {aviso.version}</Body>
      </Card>
      <Button label="← Volver" kind="ghost" onPress={onBack} />
    </Screen>
  );
}
