// Genera docs/aviso-de-privacidad.md a partir del texto que muestra la app.
// Uso: node docs/generar_aviso.js
const fs = require('fs');
const path = require('path');
const a = require('../app/src/content/aviso-privacidad.json');
let md = `# ${a.title}\n\n> ${a.intro}\n\nVersión: ${a.version}\n`;
for (const s of a.sections) {
  md += `\n## ${s.title}\n\n`;
  for (const p of s.paragraphs ?? []) md += `${p}\n\n`;
  for (const b of s.bullets ?? []) md += `- ${b}\n`;
  if (s.bullets) md += '\n';
  for (const p of s.afterBullets ?? []) md += `${p}\n\n`;
}
md += `${a.updated}\n`;
fs.writeFileSync(path.join(__dirname, 'aviso-de-privacidad.md'), md);
console.log('docs/aviso-de-privacidad.md actualizado');
