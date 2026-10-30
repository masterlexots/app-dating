# Pruebas de la base de datos

`flujo_completo.sql` recorre todas las reglas de negocio en un Postgres 16 local:
match semanal con curador, dos intentos de horario, pago de ambos, reserva (rechaza
moteles en primera cita), chat, confirmación mutua de llegada, feedback obligatorio,
noche casual con 3 intentos al día, inasistencias y suspensión de 6 meses.

```bash
createdb prueba
psql -d prueba -f supabase/tests/stub_supabase.sql   # imita auth y storage de Supabase
for f in supabase/migrations/*.sql; do psql -d prueba -v ON_ERROR_STOP=1 -f "$f"; done
psql -d prueba -f supabase/tests/flujo_completo.sql  # termina con "TODAS LAS PRUEBAS PASARON"
```
