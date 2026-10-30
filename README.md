# App Dating CDMX

App de dating para Ciudad de México: un match curado por semana (noche casual: hasta 3
intentos al día), pago solo cuando ambos aceptan y hay fecha, y primera cita siempre en un
restaurante o café aliado.

## Estructura

| Carpeta | Qué contiene |
| --- | --- |
| `app/` | App en React Native + Expo (iOS, Android y web) |
| `supabase/migrations/` | Base de datos, reglas de privacidad (RLS) y reglas de negocio |
| `supabase/tests/` | Prueba de punta a punta del ciclo de citas |

## Reglas de negocio implementadas (en la base de datos)

- Relación formal e íntima: 1 match por semana, propuesto por la IA y aprobado por un curador.
- Noche casual: hasta 3 intentos al día, uno nuevo solo si el anterior se rechazó; cita hoy o mañana; sin curador.
- Solo se emparejan personas con la misma intención; MVP heterosexual; filtros de hijos, religión y política en formal.
- Horarios: viernes o sábado 7 pm (semanal), hoy o mañana (casual). Máximo 2 intentos de horario; si no coinciden, se cancela sin penalización.
- Cobro a ambos solo con fecha fijada; si uno no paga a tiempo, se cancela y se reembolsa al otro.
- Primera cita solo en restaurante o café aliado (la base de datos rechaza moteles).
- Chat abierto solo con la reserva publicada.
- Confirmación mutua de llegada al inicio de la cita; quien no es marcado recibe una inasistencia.
- 3 inasistencias en un año calendario suspenden la cuenta 6 meses.
- Feedback obligatorio para recibir el siguiente match. Botón de pausa.

Los valores ajustables (horarios, plazos, precio, límites) están en la tabla `app_settings`.

## Puesta en marcha

### 1. Base de datos (Supabase)

1. En tu proyecto de Supabase abre **SQL Editor**.
2. Ejecuta, en orden, cada archivo de `supabase/migrations/`.
3. En **Authentication > Providers > Phone**, activa el inicio de sesión por SMS y conecta un proveedor de SMS.

### 2. App

```bash
cd app
cp .env.example .env      # llena la URL y la anon key de tu proyecto
npm install
npm run web               # o: npm run ios / npm run android (con Expo Go)
```

### Probar sin proveedores de pago ni verificación

Mientras esas integraciones no existen, marca un usuario como listo desde el SQL Editor:

```sql
update profiles set status = 'active', identity_verified = true where email = 'correo@ejemplo.com';
insert into payment_methods (profile_id, provider, customer_ref, label)
select id, 'prueba', 'prueba', 'Tarjeta de prueba' from profiles where email = 'correo@ejemplo.com';
```

## Pendiente

- Integrar proveedor de pagos (cobro, reembolso, `mark_payment_paid`).
- Integrar verificación de identidad y firma electrónica del consentimiento de datos sensibles.
- Panel interno: curadores, reservas con restaurantes, alertas de seguridad y reportes.
- Tarea programada: `propose_weekly_matches()` cada lunes y `run_maintenance()` cada 15 minutos.
- Notificaciones push.
- Revisión legal y auditoría de seguridad antes de lanzar.
