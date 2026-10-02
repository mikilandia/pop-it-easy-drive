# 🚗 Pop It EASY DRIVE - Tablero Digital de Oficina & Estacionamiento de Turnos

Sistema completo de tablero de corcho/oficina digital con sincronización en tiempo real, Pop-It por código de colores, efecto de **resplandor activo durante 24 horas** para avisar a todos los turnos, **Estacionamiento interactivo de usuarios conectados** con avatares GIF animados, y sonido de llegada.

---

## 🌟 Características Implementadas

1. **Tablero de Oficina Multiturno**:
   - Columnas organizadas: *General / Novedades*, *Urgencias & Seguridad*, *Turno Mañana*, *Turno Tarde* y *Turno Noche*.
   - Alternador de estética: **Tablero de Corcho Clásico (🪵)** o **Slate Carbón Industrial (🏁)**.

2. **Pop It con Códigos de Color**:
   - 🟢 **Verde**: Informativo / General
   - 🚨 **Rojo**: Urgente / Alerta Inmediata
   - ⚠️ **Amarillo**: Precaución / Pendientes
   - 🔍 **Azul**: Procedimiento / Calidad
   - 🌙 **Morado**: Relevo de Turnos

3. **⚡ Resplandor de 24 Horas ("Glow Effect")**:
   - Si una nota es modificada o creada, adquiere un aura luminosa animada de neón/dorado (`@keyframes card24hPulse`).
   - Muestra una insignia animada: `⚡ MODIFICADO HOY · Quedan Xh Ym`.
   - Incluye un filtro rápido en la barra superior para que el turno que entra vea al instante todas las novedades de las últimas 24 horas.
   - Detalle del cambio: qué se modificó, quién lo hizo y en qué turno.

4. **🚗 "Estacionamiento" de Turno (Parking Lot)**:
   - Barra lateral con bahías de estacionamiento numeradas (`[P-01]`, `[P-02]`, etc.).
   - Cada compañero conectado aparece con su **GIF animado trabajando**, su nombre, turno y badge de estado (*"Trabajando en el tablero 📝"*, *"En pausa café ☕"*, etc.).

5. **🔔 Sonido de Llegada (Web Audio API)**:
   - Al conectarse un usuario, reproduce un chime armónico moderno que notifica a todos en la oficina.
   - Botón de silencio (🔔/🔇) en la barra superior.

6. **🖼️ Galería y Gestión de GIFs de Perfil**:
   - Catálogo integrado con avatares animados de oficina y conducción (Gato tecleando, hamster con café, perro programador, piloto Easy Drive, robot, etc.).
   - El administrador puede **subir archivos GIF** desde su PC o pegar URLs de Internet para enriquecer la galería.

7. **👥 Roles y Permisos**:
   - **Administrador**: Crear, modificar y eliminar Pop Its, subir nuevos GIFs, moderar comentarios.
   - **Usuario Básico**: Ver notas, comentar en tiempo real con su GIF y firmar: *"✅ Marcar Visto por mi Turno"*.

8. **🌐 Conexión Online y Red Local**:
   - Funciona en red local para que cualquier compañero en la misma Wi-Fi pueda abrirlo desde su teléfono o computadora.

---

## 🚀 Cómo Instalar y Ejecutar (Para tus compañeros)

1. Abre una terminal en la carpeta del proyecto e instala las dependencias:
```bash
npm install
```

2. Inicia el servidor:
```bash
node server.js
```

El servidor mostrará los accesos:
- **Local:** `http://localhost:3000`
- **Red Local (para compañeros en la misma Wi-Fi):** `http://<TU_IP_LOCAL>:3000`

---

## 🔑 Cuentas Preconfiguradas para Probar

| Usuario | Rol | Turno | PIN | Avatar GIF |
|---|---|---|---|---|
| `admin` | **Administrador** | Turno General | `admin123` | Pato Supervisor |
| `carlos` | Operador Básico | Turno Mañana | `1234` | Gato Tecleando |
| `laura` | Operador Básico | Turno Tarde | `1234` | Conductor Easy Drive |
| `diego` | Operador Básico | Turno Noche | `1234` | Hacker en Consola |

*Cualquier compañero nuevo puede hacer clic en **"Registrarme con mi GIF"** para crear su cuenta con su nombre, turno y avatar favorito en 5 segundos.*
