import React, { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { F, useTheme } from '../lib/theme';

// Texto con la tipografía de la app. Úsalo en lugar de <Text> suelto.
export function T({ children, style, weight = 'regular', color, size }: {
  children: ReactNode; style?: TextStyle | TextStyle[]; weight?: keyof typeof F; color?: string; size?: number;
}) {
  const t = useTheme();
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const { fontWeight, ...rest } = flat;
  const w = fontWeight ? (({ '400': 'regular', '500': 'medium', '600': 'semibold', '700': 'bold', bold: 'bold', '800': 'black', '900': 'black' } as const)[String(fontWeight) as '400'] ?? weight) : weight;
  return <Text style={[{ fontFamily: F[w], color: color ?? t.ink, fontSize: size ?? 15 }, rest]}>{children}</Text>;
}

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
  return <View style={[s.card, { backgroundColor: t.surface }, style]}>{children}</View>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <T weight="semibold" size={13} color={t.accent}>{children}</T>;
}

export function Title({ children, big }: { children: ReactNode; big?: boolean }) {
  return <T weight="black" size={big ? 38 : 26} style={{ lineHeight: big ? 38 : 28, letterSpacing: big ? -1 : -0.5 }}>{children}</T>;
}

export function Body({ children, muted, small }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const t = useTheme();
  return <T size={small ? 13 : 16} color={muted ? t.muted : t.ink} style={{ lineHeight: small ? 18 : 23 }}>{children}</T>;
}

type BtnKind = 'primary' | 'ghost' | 'danger';
export function Button({ label, onPress, kind = 'primary', disabled, loading }: {
  label: string; onPress: () => void; kind?: BtnKind; disabled?: boolean; loading?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'danger' ? t.badSoft : t.soft;
  const fg = kind === 'primary' ? t.primaryInk : kind === 'danger' ? t.bad : t.ink;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.8 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <T weight="bold" size={16} color={fg}>{label}</T>}
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={s.row}>
      {React.Children.map(children, c => (c ? <View style={s.rowItem}>{c}</View> : null))}
    </View>
  );
}

export function Option({ title, subtitle, selected, onPress }: {
  title: string; subtitle?: string; selected: boolean; onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}
      style={[s.opt, { backgroundColor: selected ? t.accentSoft : t.soft, borderColor: selected ? t.accent : 'transparent' }]}
    >
      <View style={[s.dot, { borderColor: selected ? t.accent : t.muted }]}>
        {selected && <View style={[s.dotIn, { backgroundColor: t.accent }]} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="semibold" size={16}>{title}</T>
        {subtitle ? <T size={13} color={t.muted} style={{ lineHeight: 18 }}>{subtitle}</T> : null}
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
            style={[s.chip, { backgroundColor: on ? t.ink : t.soft }]}>
            <T weight={on ? 'semibold' : 'medium'} size={14} color={on ? t.bg : t.ink}>{o}</T>
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
      <T weight="semibold" size={14}>{label}</T>
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[s.input, { color: t.ink, backgroundColor: t.soft, borderColor: error ? t.bad : 'transparent', fontFamily: F.regular },
          props.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
      />
      {error ? <T size={12} color={t.bad}>{error}</T>
        : hint ? <T size={12} color={t.muted} style={{ lineHeight: 16 }}>{hint}</T> : null}
    </View>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <T weight="semibold" size={15}>{children}</T>;
}

type NoteKind = 'info' | 'ok' | 'warn' | 'bad' | 'accent';
export function Note({ children, kind = 'info' }: { children: ReactNode; kind?: NoteKind }) {
  const t = useTheme();
  const map = {
    info: [t.soft, t.ink], ok: [t.okSoft, t.ok], warn: [t.warnSoft, t.warn], bad: [t.badSoft, t.bad], accent: [t.accentSoft, t.ink],
  } as const;
  const [bg, fg] = map[kind];
  return (
    <View style={[s.note, { backgroundColor: bg }]}>
      <T size={14} color={fg} style={{ lineHeight: 19 }}>{children}</T>
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
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: 14 },
  card: { borderRadius: 28, padding: 22, gap: 16 },
  btn: { borderRadius: 999, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowItem: { flexGrow: 1, flexBasis: 140 },
  opt: { flexDirection: 'row', gap: 12, padding: 16, borderWidth: 1.5, borderRadius: 20, alignItems: 'flex-start' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginTop: 1, alignItems: 'center', justifyContent: 'center' },
  dotIn: { width: 10, height: 10, borderRadius: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999 },
  input: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, fontSize: 16 },
  note: { padding: 14, borderRadius: 16 },
  steps: { flexDirection: 'row', gap: 5 },
  step: { flex: 1, height: 4, borderRadius: 4 },
});
