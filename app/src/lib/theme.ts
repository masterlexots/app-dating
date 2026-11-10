import { useColorScheme } from 'react-native';

// Dirección visual "Rosa mexicano discreto": rosa muy pálido para que la app
// no llame la atención en pantalla; el rosa mexicano intenso solo en detalles.
const light = {
  bg: '#FBF4F7',          // rosa casi blanco
  surface: '#FFFFFF',
  soft: '#F6E8EE',        // relleno de tarjetas y campos
  ink: '#2B1822',         // texto y botón principal
  muted: '#8C7380',
  line: '#EAD8E0',
  accent: '#D13D7A',      // rosa mexicano apagado, solo para detalles
  accentInk: '#FFFFFF',
  accentSoft: '#F8E0EA',
  primary: '#2B1822',     // botón principal: oscuro, no rosa, para ser discreto
  primaryInk: '#FFF6FA',
  ok: '#2F7A57', okSoft: '#E4F2EA', warn: '#8A5A12', warnSoft: '#F8EDDA', bad: '#B0303B', badSoft: '#F9E3E5',
};
const dark: typeof light = {
  bg: '#1A1116',
  surface: '#24171E',
  soft: '#2E1F27',
  ink: '#F5E8EE',
  muted: '#B59BA8',
  line: '#3D2B34',
  accent: '#E77AA6',
  accentInk: '#1A1116',
  accentSoft: '#3A2230',
  primary: '#F5E8EE',
  primaryInk: '#1A1116',
  ok: '#7BCB9F', okSoft: '#1C3027', warn: '#E8B866', warnSoft: '#33281A', bad: '#F08D95', badSoft: '#3A1D21',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

// Tipografía: DM Serif Display para títulos y nombres, DM Sans para el resto
// (se cargan en App.tsx).
export const F = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
  black: 'DMSerifDisplay_400Regular',   // títulos
  display: 'DMSerifDisplay_400Regular',
};
