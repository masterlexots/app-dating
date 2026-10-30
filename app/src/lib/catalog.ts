export type Intent = 'formal' | 'casual' | 'intima';
export type MatchType = 'comun' | 'complemento' | 'carrera';

export const INTENTS: Record<Intent, [string, string]> = {
  formal: ['Relación formal', 'Buscas una pareja a largo plazo.'],
  casual: ['Noche casual', 'Un encuentro sin compromiso. Hasta 3 intentos al día.'],
  intima: ['Pareja íntima estable', 'Encuentros íntimos recurrentes con la misma persona.'],
};

export const MATCH_TYPES: Record<MatchType, [string, string]> = {
  comun: ['Intereses y actividades en común', 'Alguien que disfrute lo mismo que tú.'],
  complemento: ['Personalidad complementaria', 'Alguien que equilibre tu forma de ser.'],
  carrera: ['Carrera y capacidad económica similar', 'Alguien en una etapa profesional parecida.'],
};

export const INTEREST_DETAILS: Record<string, string[]> = {
  'Cine': ['Acción', 'Comedia', 'Drama', 'Terror', 'Ciencia ficción', 'Romance', 'Documental', 'Cine de autor', 'Animación'],
  'Música en vivo': ['Rock', 'Pop', 'Electrónica', 'Reguetón', 'Regional mexicano', 'Jazz', 'Indie', 'Hip hop', 'Clásica'],
  'Correr': ['Por diversión', '10K', 'Medio maratón', 'Maratón', 'Trail'],
  'Gimnasio': ['Pesas', 'Crossfit', 'Funcional', 'Spinning', 'Yoga', 'Pilates'],
  'Cocinar': ['Mexicana', 'Italiana', 'Asiática', 'Repostería', 'Vegana', 'Parrilla'],
  'Viajar': ['Playa', 'Ciudades', 'Montaña', 'Pueblos mágicos', 'Internacional', 'Mochilero'],
  'Lectura': ['Novela', 'Fantasía', 'Ciencia ficción', 'Thriller', 'Historia', 'Negocios', 'Poesía', 'Desarrollo personal'],
  'Videojuegos': ['Consola', 'PC', 'Móvil', 'RPG', 'Shooters', 'Estrategia', 'Deportes', 'Nintendo'],
  'Arte y museos': ['Arte contemporáneo', 'Historia', 'Fotografía', 'Teatro', 'Galerías', 'Arquitectura'],
  'Fútbol': ['Liga MX', 'Europeo', 'Selección', 'Jugarlo', 'Verlo en el estadio'],
  'Senderismo': ['Ajusco y Desierto de los Leones', 'Nevado o volcanes', 'Escalada', 'Campismo'],
  'Bailar': ['Salsa', 'Bachata', 'Cumbia', 'Danzón', 'Electrónica', 'Reguetón', 'Swing'],
  'Café de especialidad': ['Espresso', 'Métodos de filtrado', 'Cafeterías nuevas', 'Lo preparo en casa'],
  'Mascotas': ['Perros', 'Gatos', 'Tengo mascota', 'Quiero tener'],
  'Tecnología': ['Gadgets', 'Programación', 'Inteligencia artificial', 'Startups', 'Gaming'],
  'Vino y mezcal': ['Vino tinto', 'Vino blanco', 'Mezcal', 'Cerveza artesanal', 'Coctelería', 'Catas'],
};

export const PERSONALITY: [key: string, left: string, right: string][] = [
  ['social', 'Prefiero planes tranquilos', 'Prefiero salir y socializar'],
  ['plan', 'Improviso', 'Planeo todo'],
  ['conflict', 'Necesito espacio en un conflicto', 'Hablo de inmediato'],
  ['ritmo', 'Vida de casa', 'Vida de ciudad'],
];

export const CAREER_LEVELS = ['Estudiante', 'Menos de 3 años', '3 a 7 años', '8 a 15 años', 'Más de 15 años', 'Emprendedor/a'];

export const SALARY = {
  MXN: ['Menos de $15,000', '$15,000 a $30,000', '$30,000 a $60,000', '$60,000 a $100,000', 'Más de $100,000'],
  USD: ['Menos de $750', '$750 a $1,500', '$1,500 a $3,000', '$3,000 a $5,000', 'Más de $5,000'],
} as const;
export const NO_SALARY = 'Prefiero no decir';

export const ALCALDIAS = [
  'Álvaro Obregón', 'Azcapotzalco', 'Benito Juárez', 'Coyoacán', 'Cuajimalpa', 'Cuauhtémoc',
  'Gustavo A. Madero', 'Iztacalco', 'Iztapalapa', 'La Magdalena Contreras', 'Miguel Hidalgo',
  'Milpa Alta', 'Tláhuac', 'Tlalpan', 'Venustiano Carranza', 'Xochimilco',
];

export const POLITICS = ['Izquierda', 'Centro-izquierda', 'Centro', 'Centro-derecha', 'Derecha'];
export const RELIGIONS = ['Católica', 'Cristiana', 'Judía', 'Otra', 'Sin religión'];
export const RELIGION_PREFS = ['Misma que la mía', ...RELIGIONS, 'No me importa'];

export const LINKEDIN_RE = /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]{3,}\/?$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Mexico_City',
  });
