import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F1F4', surface: '#FFFFFF', ink: '#24131D', muted: '#6E5A66', line: '#E6DAE1',
  accent: '#D1006F', accentInk: '#FFFFFF', accentSoft: '#FBE3EF',
  ok: '#1F7A4D', okSoft: '#DFF2E8', warn: '#9A5B00', warnSoft: '#FBEBD2', bad: '#B42318', badSoft: '#FCE4E2',
};
const dark: typeof light = {
  bg: '#170C13', surface: '#22141D', ink: '#F6EAF1', muted: '#B7A3AF', line: '#3A2733',
  accent: '#FF4FA3', accentInk: '#1A0610', accentSoft: '#3B1529',
  ok: '#5FD39A', okSoft: '#173327', warn: '#F2B35A', warnSoft: '#3A2810', bad: '#FF8A80', badSoft: '#3D1714',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
