import React, { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { useTheme } from '../lib/theme';

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
      <View style={s.column}>{children}</View>
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[s.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[s.eyebrow, { color: t.accent }]}>{children}</Text>;
}

export function Title({ children, big }: { children: ReactNode; big?: boolean }) {
  const t = useTheme();
  return <Text style={[big ? s.h1 : s.h2, { color: t.ink }]}>{children}</Text>;
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const t = useTheme();
  return <Text style={{ color: muted ? t.muted : t.ink, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 22 }}>{children}</Text>;
}

type BtnKind = 'primary' | 'ghost' | 'danger';
export function Button({ label, onPress, kind = 'primary', disabled, loading }: {
  label: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; loading?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.badSoft : 'transparent';
  const fg = kind === 'primary' ? t.accentInk : kind === 'danger' ? t.bad : t.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, {
        backgroundColor: bg, borderColor: kind === 'ghost' ? t.line : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

export function Option({ title, subtitle, selected, onPress }: {
  title: string; subtitle?: string; selected: boolean; onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
      style={[s.opt, { borderColor: selected ? t.accent : t.line, backgroundColor: selected ? t.accentSoft : 'transparent' }]}
    >
      <View style={[s.dot, { borderColor: selected ? t.accent : t.line }]}>
        {selected && <View style={[s.dotIn, { backgroundColor: t.accent }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontWeight: '600', fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.muted, fontSize: 13 }}>{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}

export function Chips({ options, selected, onToggle }: {
  options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={s.chips}>
      {options.map(o => {
        const on = selected.includes(o);
        return (
          <Pressable key={o} onPress={() => onToggle(o)} accessibilityState={{ selected: on }}
            style={[s.chip, { borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accentSoft : 'transparent' }]}>
            <Text style={{ color: t.ink, fontSize: 13, fontWeight: on ? '600' : '400' }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[s.input, { color: t.ink, backgroundColor: t.bg, borderColor: error ? t.bad : t.line }, props.multiline && { minHeight: 72 }]}
      />
      {error ? <Text style={{ color: t.bad, fontSize: 12 }}>{error}</Text>
        : hint ? <Text style={{ color: t.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.ink, fontWeight: '600', fontSize: 14 }}>{children}</Text>;
}

type NoteKind = 'info' | 'ok' | 'warn' | 'bad' | 'accent';
export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: NoteKind }) {
  const t = useTheme();
  const map = {
    info: [t.bg, t.ink], ok: [t.okSoft, t.ok], warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], accent: [t.accentSoft, t.ink],
  } as const;
  const [bg, fg] = map[kind];
  return (
    <View style={[s.note, { backgroundColor: bg, borderColor: kind === 'info' ? t.line : 'transparent' }]}>
      <Text style={{ color: fg, fontSize: 13, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Steps({ current, total }: { current: number; total: number }) {
  const t = useTheme();
  return (
    <View style={s.steps} accessibilityLabel={`Paso ${current + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.step, { backgroundColor: i <= current ? t.accent : t.line }]} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingVertical: 24 },
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: 16 },
  card: { borderWidth: 1, borderRadius: 14, padding: 20, gap: 14 },
  eyebrow: { fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600' },
  h1: { fontSize: 28, lineHeight: 32, fontWeight: '700' },
  h2: { fontSize: 21, lineHeight: 26, fontWeight: '700' },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, borderWidth: 1.5, alignItems: 'center', flexGrow: 1, flexBasis: 140 },
  btnText: { fontWeight: '600', fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1.5, borderRadius: 12, alignItems: 'flex-start' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  dotIn: { width: 8, height: 8, borderRadius: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5 },
  input: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 },
  note: { padding: 12, borderRadius: 10, borderWidth: 1 },
  steps: { flexDirection: 'row', gap: 4 },
  step: { flex: 1, height: 4, borderRadius: 4 },
});
